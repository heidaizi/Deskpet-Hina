import { app } from 'electron'
import { join } from 'node:path'
import { state } from '../app-state'
import { observeDecision, releaseDecision } from '../behavior/decision-bus'
import {
  computeFocusPressure,
  computeLateNightPenalty,
  computeRecentDisturbance,
  computeThreshold,
  scoreCandidate,
} from './utility'
import { decideManners } from './manners'
import {
  buildPerceptionPrompt,
  collectScreenContext,
  collectScreenContextFast,
  type ScreenContext,
} from '../perception/screen-context'
import { PresenceSessionStore } from './presence-session-store'
import { PresenceEmotionStore } from './presence-emotion-store'
import { PresenceMemoryStore } from './presence-memory-store'
import { createDefaultEmotionState, getVoicePerformanceStyle } from './emotion-engine'
import { PresenceController, PresenceDelivery, ProactiveAiRequest } from './presence-controller'
import { IS_E2E, presenceMode } from '../config'
import {
  isPetAvailableForAutonomousBehavior,
  readPositiveNumberEnv,
  startAutonomousWalk,
} from '../behavior/autonomous'
import {
  EmotionState,
  PresenceCandidate,
  PresenceContextV1,
  PresenceDecision,
  PresenceSessionState,
} from '../../shared/presence'
import { MemoryStateWithSignals } from './episodic-memory'
import { AiProactivePlan } from '../../shared/ai-context'
import { DeepSeekApiError, DeepSeekClient } from '../domain/deepseek-client'
import { createScenePerformanceCandidate } from './presence-rules'
import { deriveEmotionSeed } from '../domain/local-tts-service'
import { sendRendererCommand } from '../renderer/commands'
export function initializePresenceController(): void {
  if (!IS_E2E) {
    startScreenContextPolling()
  }
  const now = Date.now()
  state.presenceSessionStore = new PresenceSessionStore(
    join(app.getPath('userData'), 'presence-session.json'),
  )
  state.presenceEmotionStore = new PresenceEmotionStore(
    join(app.getPath('userData'), 'presence-emotion.json'),
  )
  state.presenceMemoryStore = new PresenceMemoryStore(
    join(app.getPath('userData'), 'presence-memory.json'),
  )
  const memoryEnabled = state.petController?.getSettings().presenceMemoryEnabled ?? true
  const emotionEnabled = state.petController?.getSettings().presenceEmotionEnabled ?? true
  const restoredSession = memoryEnabled ? state.presenceSessionStore.load(now) : undefined
  const restoredMemory = memoryEnabled ? state.presenceMemoryStore.load(now) : undefined
  const petSnapshot = state.petController?.getSettingsSnapshot()
  const defaultEmotion = createDefaultEmotionState(
    now,
    petSnapshot?.state.energy ?? 78,
    petSnapshot?.state.mood ?? 62,
    petSnapshot?.state.affectionLevel ?? 1,
  )
  const restoredEmotion = emotionEnabled
    ? state.presenceEmotionStore.load(defaultEmotion)
    : defaultEmotion
  if (restoredSession?.lastInteractionAt) {
    state.lastInteractionAt = restoredSession.lastInteractionAt
  }
  state.presenceController = new PresenceController({
    mode: presenceMode,
    memoryEnabled,
    emotionEnabled,
    initialSession: restoredSession,
    initialEmotion: restoredEmotion,
    initialMemory: restoredMemory,
    onSessionChanged: handlePresenceSessionChanged,
    onEmotionChanged: handlePresenceEmotionChanged,
    onMemoryChanged: handlePresenceMemoryChanged,
    dialogueRepeatWindowMs: readPositiveNumberEnv('DESKPET_PRESENCE_DIALOGUE_DEDUPE_MS'),
    restartReturnDelayMs: readPositiveNumberEnv('DESKPET_PRESENCE_RESTART_RETURN_DELAY_MS'),
    restartReturnAfterMs: readPositiveNumberEnv('DESKPET_PRESENCE_RESTART_RETURN_AFTER_MS'),
    sessionPersistIntervalMs: readPositiveNumberEnv('DESKPET_PRESENCE_SESSION_PERSIST_MS'),
    focusFirstMs: readPositiveNumberEnv('DESKPET_PRESENCE_FOCUS_FIRST_MS'),
    focusLongMs: readPositiveNumberEnv('DESKPET_PRESENCE_FOCUS_LONG_MS'),
    returnAfterMs: readPositiveNumberEnv('DESKPET_PRESENCE_RETURN_AFTER_MS'),
    idleReturnAfterMs: readPositiveNumberEnv('DESKPET_PRESENCE_IDLE_RETURN_AFTER_MS'),
    interactionGraceMs: readPositiveNumberEnv('DESKPET_PRESENCE_INTERACTION_GRACE_MS'),
    minimumSpeechGapMs: readPositiveNumberEnv('DESKPET_PRESENCE_SPEECH_GAP_MS'),
    maximumSpeechPerHour: readPositiveNumberEnv('DESKPET_PRESENCE_MAX_SPEECH_PER_HOUR'),
    isProactiveAiEnabled: () => {
      const settings = state.petController?.getSettings()
      return Boolean(settings?.aiEnabled && settings.aiProactiveEnabled)
    },
    planProactiveAi: planProactivePresence,
    proactiveAiTimeoutMs: readPositiveNumberEnv('DESKPET_PRESENCE_PROACTIVE_AI_TIMEOUT_MS'),
    maximumProactiveAiPerHour: readPositiveNumberEnv('DESKPET_PRESENCE_MAX_PROACTIVE_AI_PER_HOUR'),
    scenePerformanceStableMs: readPositiveNumberEnv('DESKPET_PRESENCE_SCENE_STABLE_MS'),
    lateNightStableMs: readPositiveNumberEnv('DESKPET_PRESENCE_LATE_NIGHT_STABLE_MS'),
    idleMicroMs: readPositiveNumberEnv('DESKPET_PRESENCE_IDLE_MICRO_MS'),
    restEnergy: readPositiveNumberEnv('DESKPET_PRESENCE_REST_ENERGY'),
    getRuntime: () => {
      const snapshot = state.petController?.getSettingsSnapshot()
      return {
        visible: isPetAvailableForAutonomousBehavior(),
        dragging: state.interactionLocked,
        clickThrough: state.clickThroughMode,
        interactionsPaused: snapshot?.settings.interactionsPaused ?? true,
        randomVoiceEnabled: snapshot?.settings.randomVoiceEnabled ?? false,
        autonomyEnabled: snapshot?.settings.presenceAutonomyEnabled ?? true,
        intensity: snapshot?.settings.presenceIntensity ?? 'balanced',
        energy: snapshot?.state.energy ?? 100,
        mood: snapshot?.state.mood ?? 60,
        affectionLevel: snapshot?.state.affectionLevel ?? 1,
        lastInteractionAt: state.lastInteractionAt,
      }
    },
    ...(presenceMode === 'active'
      ? {
          getScenePerformance: (context: PresenceContextV1) => getPresenceScenePerformance(context),
        }
      : {}),
    getScreenContext: () => latestScreenContext,
    utility: (candidate, context) => {
      const focusPressure = computeFocusPressure({
        focusMinutes: 0,
        interactionDensity: 0,
        scene: context.scene.scene,
      })
      // 分寸感对基础和自适应都生效：刚被打扰、连续被忽略、深夜、专注时不主动。
      const manners = decideManners({
        now: context.now,
        priority: candidate.priority,
        lastInteractionAt: state.lastInteractionAt,
        recentEvents: state.feedbackStore?.list(50) ?? [],
        focusPressure,
      })
      if (manners.suppress) {
        return { score: -1, threshold: 1 }
      }
      if (state.petController?.getSettings().intelligenceLevel !== 'adaptive') {
        return null
      }

      const recentDisturbance = computeRecentDisturbance(
        state.feedbackStore?.list(50) ?? [],
        context.now,
      )
      const score = scoreCandidate({
        priority: candidate.priority,
        sceneFit: candidate.tags.length > 0 ? 0.6 : 0.3,
        memoryHit: 0,
        affectionLevel: context.pet.affectionLevel,
        focusPressure,
        recentDisturbance,
        lateNightPenalty: computeLateNightPenalty(new Date(context.now)),
        repeatPressure: 0,
        cooldownPressure: 0,
      })
      return {
        score,
        threshold: computeThreshold(focusPressure, recentDisturbance) + manners.thresholdBoost,
      }
    },
    deliver: handlePresenceDelivery,
    onDecision: logPresenceDecision,
  })
}

export function handlePresenceSessionChanged(session: PresenceSessionState): void {
  state.presenceSessionStore?.save(session)
}

export function handlePresenceEmotionChanged(emotion: EmotionState): void {
  state.presenceEmotionStore?.save(emotion)
}

export function handlePresenceMemoryChanged(memory: MemoryStateWithSignals): void {
  state.presenceMemoryStore?.save(memory)
}

export function syncPresenceMemorySetting(enabled: boolean): void {
  if (!state.presenceController) {
    return
  }
  if (!enabled) {
    state.presenceController.setMemoryEnabled(false)
    return
  }
  const now = Date.now()
  state.presenceController.setMemoryEnabled(
    true,
    state.presenceSessionStore?.load(now),
    state.presenceMemoryStore?.load(now),
  )
}

export function syncPresenceEmotionSetting(enabled: boolean): void {
  if (!state.presenceController) {
    return
  }
  if (!enabled) {
    state.presenceController.setEmotionEnabled(false)
    return
  }
  const now = Date.now()
  const snapshot = state.petController?.getSettingsSnapshot()
  const fallback = createDefaultEmotionState(
    now,
    snapshot?.state.energy ?? 78,
    snapshot?.state.mood ?? 62,
    snapshot?.state.affectionLevel ?? 1,
  )
  state.presenceController.setEmotionEnabled(true, state.presenceEmotionStore?.load(fallback))
}

let latestScreenContext: ScreenContext | null = null

/** 定期刷新当前页面，供主动行为使用（失败静默）。 */
let screenPollingStarted = false

function startScreenContextPolling(): void {
  if (screenPollingStarted) {
    return
  }
  screenPollingStarted = true
  const refresh = (): void => {
    void collectScreenContext().then((context) => {
      if (context) {
        latestScreenContext = context
      }
    })
  }
  refresh()
  setInterval(refresh, 2 * 60_000).unref?.()
}

export async function planProactivePresenceWithDeepSeek(
  request: ProactiveAiRequest,
): Promise<AiProactivePlan | null> {
  const settings = state.petController?.getSettings()
  if (!settings?.aiEnabled || !settings.aiProactiveEnabled || !state.deepSeekKeyStore) {
    return null
  }
  const key = await state.deepSeekKeyStore.loadKey()
  if (!key) {
    return null
  }
  try {
    // 把当前页面作为背景带进主动规划，让她能就内容提问或发表看法。
    const screen = await collectScreenContextFast()
    const context = screen
      ? {
          ...request.context,
          localTrigger: {
            ...request.context.localTrigger,
            reason: `${request.context.localTrigger.reason}；老师正在看「${screen.title ?? screen.app}」`,
          },
          memories: [
            {
              id: 'screen-context',
              summary: buildPerceptionPrompt(screen).slice(0, 600),
              tags: ['screen'],
              importance: 0.6,
            },
            ...request.context.memories,
          ].slice(0, 8),
        }
      : request.context
    const plan = await new DeepSeekClient({ apiKey: key }).planProactiveReply(context, {
      signal: request.signal,
      timeoutMs: 8_000,
    })
    state.aiLastError = undefined
    return plan
  } catch (error) {
    if (error instanceof DeepSeekApiError && error.code === 'cancelled') {
      return null
    }
    state.aiLastError = error instanceof Error ? error.message : String(error)
    console.error('Proactive AI planning failed:', error)
    return null
  }
}

export function planProactivePresence(
  request: ProactiveAiRequest,
): Promise<AiProactivePlan | null> {
  return IS_E2E ? planE2EProactivePresence(request) : planProactivePresenceWithDeepSeek(request)
}

export async function planE2EProactivePresence(
  request: ProactiveAiRequest,
): Promise<AiProactivePlan | null> {
  const mode = process.env.DESKPET_E2E_PROACTIVE_AI_PLAN
  if (!mode) {
    return null
  }
  if (request.signal.aborted) {
    return null
  }
  const delayMs = Math.max(0, Number(process.env.DESKPET_E2E_PROACTIVE_AI_DELAY_MS ?? 0))
  if (delayMs > 0) {
    const completed = await new Promise<boolean>((resolve) => {
      const handleAbort = (): void => {
        clearTimeout(timeout)
        resolve(false)
      }
      const timeout = setTimeout(() => {
        request.signal.removeEventListener('abort', handleAbort)
        resolve(true)
      }, delayMs)
      request.signal.addEventListener('abort', handleAbort, { once: true })
    })
    if (!completed) {
      return null
    }
  }

  if (mode === 'fallback') {
    return null
  }
  if (mode === 'silent' || mode === 'silent-action') {
    return {
      should_speak: false,
      intent: 'quiet_company',
      emotion: 'calm',
      action: mode === 'silent-action' ? 'look_at_cursor' : 'idle',
      memory_reference_ids: [],
      confidence: 1,
    }
  }
  if (mode === 'speak' || mode === 'delay') {
    const memoryId = request.context.memories[0]?.id
    return {
      should_speak: true,
      intent: 'notice',
      reply_zh: '老师，先喘口气。我会在这里看着进度。',
      reply_ja: '先生、少し息を整えて。進み具合はここで見ています。',
      emotion: 'soft',
      action: 'look_at_cursor',
      memory_reference_ids: memoryId ? [memoryId] : [],
      confidence: 1,
    }
  }
  return null
}

export function getPresenceScenePerformance(context: PresenceContextV1): PresenceCandidate | null {
  if (!context.runtime.randomVoiceEnabled || !state.sceneCompanion) {
    return null
  }
  const selection = state.sceneCompanion.observe({
    scene: context.scene.scene,
    timePeriod: context.scene.timePeriod,
    energy: context.pet.energy,
    mood: context.pet.mood,
    affectionLevel: context.pet.affectionLevel,
    now: context.now,
    visible: context.runtime.visible,
    dragging: context.runtime.dragging,
    clickThrough: context.runtime.clickThrough,
    screenLocked: context.scene.screenLocked,
    suspended: context.scene.suspended,
    systemIdleSeconds: context.scene.systemIdleSeconds,
    randomVoiceEnabled: context.runtime.randomVoiceEnabled,
  })
  return selection ? createScenePerformanceCandidate(selection) : null
}

export function handlePresenceDelivery(delivery: PresenceDelivery): void {
  const { candidate } = delivery
  // 拖拽期间用户正在持续托起角色，任何 Presence 演出都会打断 Formation_Pickup 循环。
  // 这里撤销已经排队的投递，并通知控制器释放该次投递状态。
  if (state.interactionLocked) {
    if (delivery.deliveryId) {
      state.presenceController?.handleDeliveryEvent({
        deliveryId: delivery.deliveryId,
        type: 'speech_interrupted',
        reason: 'user',
      })
    }
    return
  }
  if (candidate.restRecovery) {
    state.petController?.recoverFromRest(delivery.selectedAt)
  }
  if (candidate.ruleId === 'autonomous-walk') {
    startAutonomousWalk()
    return
  }
  const ttsEmotion = candidate.ttsEmotion ?? delivery.voiceEmotion ?? undefined
  const affectionLevel = state.petController?.getSettingsSnapshot().state.affectionLevel ?? 1
  const voiceStyle = delivery.emotion
    ? getVoicePerformanceStyle(
        delivery.emotion,
        affectionLevel,
        ttsEmotion,
        delivery.relationship ?? undefined,
      )
    : null
  const ttsSeed =
    candidate.ttsSeed ??
    (voiceStyle && (candidate.dialogue || candidate.spokenText)
      ? deriveEmotionSeed(
          'presence-emotion-v1',
          candidate.spokenText ?? candidate.dialogue ?? '',
          voiceStyle.emotion,
          voiceStyle.activationBucket,
        )
      : undefined)
  sendRendererCommand({
    action: candidate.action ?? 'idle',
    deliveryId: delivery.deliveryId ?? undefined,
    performanceToken: delivery.performanceToken,
    modelClip: candidate.modelClip,
    performanceId: candidate.performanceId ?? `presence:${candidate.ruleId}`,
    expression: candidate.expression,
    dialogue: candidate.dialogue,
    voice: candidate.voice,
    spokenText: candidate.spokenText,
    ttsEmotion,
    ttsSeed,
    ttsDurationScale: voiceStyle?.durationScale,
    speakDialogue: candidate.speech !== 'none',
    bodyPolicy: candidate.bodyPolicy === 'replace' ? 'replace' : 'overlay',
    microMotion: candidate.microMotion,
    idlePerformance: candidate.speech === 'none' && candidate.tags.includes('scene_comment'),
    activityClass: 'ambient',
  })
  // 只登记占用，不拦截投递；Presence 的准入仍由自身仲裁器负责。
  observeDecision({
    source: 'presence',
    reason: candidate.ruleId,
    leaseMs: 5_000,
  })
  // 反馈观察窗口：30 秒内有交互记 engaged，被打断记 interrupted，否则记 ignored。
  state.feedbackStore?.noteDelivery(candidate.ruleId, state.timeSceneContext.scene)
  if (candidate.speech !== 'none') {
    state.lastProactiveDialogueAt = delivery.selectedAt
  }
}

export function logPresenceDecision(decision: PresenceDecision, context: PresenceContextV1): void {
  if (presenceMode !== 'shadow' || process.env.DESKPET_PRESENCE_LOG !== '1') {
    return
  }
  if (decision.kind === 'perform') {
    console.info(
      `[presence:shadow] ${decision.candidate.ruleId} score=${decision.score.toFixed(2)} scene=${context.scene.scene}`,
    )
  } else {
    console.info(`[presence:shadow] silent: ${decision.reason}`)
  }
}

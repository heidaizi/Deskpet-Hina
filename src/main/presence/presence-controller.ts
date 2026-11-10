import { createHash, randomUUID } from 'node:crypto'
import {
  parsePresenceMode,
  type DeliveryLifecycleEvent,
  type EmotionState,
  type EpisodicMemory,
  type PresenceDialogueHistoryEntry,
  type PresenceCandidate,
  type PresenceContextV1,
  type PresenceDecision,
  type PresenceDiagnostics,
  type PresenceMode,
  type PresenceRuntimeState,
  type PresenceSessionState,
  type PresenceTag,
  type RelationshipProfile,
  type ReturnEpisode,
  type SpeechState,
} from '../../shared/presence'
import type {
  PerformanceLifecycleEvent,
  PerformanceState,
  PetInteraction,
  PresenceIntensity,
  PresenceTelemetrySnapshot,
} from '../../shared/types'
import type { AiProactiveContext, AiProactivePlan } from '../../shared/ai-context'
import {
  createPresenceContext,
  isExternalScene,
  type PresencePetSnapshot,
} from './presence-context'
import { arbitratePresence, type PresenceArbitrationState } from './presence-arbiter'
import {
  createAutonomousWalkCandidate,
  createFocusMilestoneCandidate,
  createIdleMicroCandidate,
  createHourlyGreetingCandidate,
  createPageNoticeCandidate,
  createLateNightCandidate,
  createRestCandidate,
  createReturnGreetingCandidate,
} from './presence-rules'
import { MAX_RECENT_PRESENCE_DIALOGUES, normalizePresenceSession } from './presence-session-store'
import { isQuietScene, type TimeSceneContext } from '../../shared/time-scene'
import {
  advanceEmotion,
  applyInteractionEmotion,
  applyPresenceEmotion,
  createDefaultEmotionState,
  getRelationshipProfile,
  getVoiceEmotion,
  normalizeEmotionState,
} from './emotion-engine'
import {
  clearEpisodicMemories,
  createEmptyEpisodicMemoryState,
  deleteEpisodicMemory,
  markMemoriesReferenced,
  normalizeEpisodicMemoryState,
  pruneEpisodicMemories,
  recordEpisodicMemory,
  retrieveEpisodicMemories,
  type EpisodicMemoryEvent,
  type MemoryStateWithSignals,
} from './episodic-memory'

const DEFAULT_FOCUS_FIRST_MS = 40 * 60_000
const DEFAULT_FOCUS_LONG_MS = 90 * 60_000
const DEFAULT_RETURN_AFTER_MS = 10 * 60_000
const DEFAULT_RESTART_RETURN_AFTER_MS = 2 * 60 * 60_000
const DEFAULT_IDLE_RETURN_AFTER_MS = 5 * 60_000
const DEFAULT_INTERACTION_GRACE_MS = 30_000
const DEFAULT_MINIMUM_SPEECH_GAP_MS = 20_000
const DEFAULT_MAXIMUM_SPEECH_PER_HOUR = 9
const DEFAULT_SCENE_PERFORMANCE_STABLE_MS = 0
const DEFAULT_LATE_NIGHT_STABLE_MS = 20_000
const DEFAULT_IDLE_MICRO_MS = 90_000
const DEFAULT_REST_ENERGY = 25
const RETURN_EPISODE_MAX_AGE_MS = 5 * 60_000
const DELIVERY_STATE_TIMEOUT_MS = 120_000
const DEFAULT_DIALOGUE_REPEAT_WINDOW_MS = 30 * 60_000
const DEFAULT_RESTART_RETURN_DELAY_MS = 2_000
const DEFAULT_SESSION_PERSIST_INTERVAL_MS = 30_000
const DEFAULT_EMOTION_PERSIST_INTERVAL_MS = 30_000
const DEFAULT_MEMORY_PERSIST_INTERVAL_MS = 30_000
const DEFAULT_PROACTIVE_AI_TIMEOUT_MS = 6_000
const DEFAULT_MAX_PROACTIVE_AI_PER_HOUR = 6
const DEFAULT_IDLE_CLIP_REPEAT_MS = 5 * 60_000
const PRESENCE_INTENSITY_POLICY: Record<
  PresenceIntensity,
  {
    minimumSpeechGapMs: number
    maximumSpeechPerHour: number
    maximumProactiveAiPerHour: number
    idleMicroMs: number
  }
> = {
  quiet: {
    minimumSpeechGapMs: 120_000,
    maximumSpeechPerHour: 3,
    maximumProactiveAiPerHour: 2,
    idleMicroMs: 5 * 60_000,
  },
  balanced: {
    minimumSpeechGapMs: 45_000,
    maximumSpeechPerHour: 6,
    maximumProactiveAiPerHour: 4,
    idleMicroMs: 90_000,
  },
  lively: {
    minimumSpeechGapMs: 20_000,
    maximumSpeechPerHour: 9,
    maximumProactiveAiPerHour: 6,
    idleMicroMs: 45_000,
  },
}
const DEFAULT_TAG_COOLDOWNS: Record<PresenceTag, number> = {
  late_night: 20 * 60 * 60_000,
  rest: 15 * 60_000,
  focus: 10 * 60_000,
  return: 30 * 60_000,
  affection: 30 * 60_000,
  scene_comment: 5 * 60_000,
}

type PresenceBaseRuntime = Omit<PresenceRuntimeState, 'speechState' | 'performanceState'>

export interface PresenceDelivery {
  candidate: PresenceCandidate
  eventEpoch: number
  deliveryId: string | null
  performanceToken: string
  emotion: EmotionState | null
  relationship: RelationshipProfile | null
  selectedAt: number
  source: 'local' | 'proactive-ai'
  voiceEmotion: string | null
}

export interface ProactiveAiRequest {
  context: AiProactiveContext
  localCandidate: PresenceCandidate
  signal: AbortSignal
}

export interface PresenceControllerOptions {
  mode?: PresenceMode | string
  memoryEnabled?: boolean
  emotionEnabled?: boolean
  now?: () => number
  random?: () => number
  getRuntime: () => PresenceBaseRuntime & PresencePetSnapshot
  getScenePerformance?: (context: PresenceContextV1) => PresenceCandidate | null
  utility?: (
    candidate: PresenceCandidate,
    context: PresenceContextV1,
  ) => { score: number; threshold: number } | null
  deliver: (delivery: PresenceDelivery) => void
  onDecision?: (decision: PresenceDecision, context: PresenceContextV1) => void
  focusFirstMs?: number
  focusLongMs?: number
  returnAfterMs?: number
  restartReturnAfterMs?: number
  idleReturnAfterMs?: number
  interactionGraceMs?: number
  minimumSpeechGapMs?: number
  maximumSpeechPerHour?: number
  initialSession?: PresenceSessionState
  onSessionChanged?: (session: PresenceSessionState) => void
  initialEmotion?: EmotionState
  onEmotionChanged?: (emotion: EmotionState) => void
  emotionPersistIntervalMs?: number
  initialMemory?: MemoryStateWithSignals
  onMemoryChanged?: (memory: MemoryStateWithSignals) => void
  memoryPersistIntervalMs?: number
  isProactiveAiEnabled?: () => boolean
  planProactiveAi?: (request: ProactiveAiRequest) => Promise<AiProactivePlan | null>
  proactiveAiTimeoutMs?: number
  maximumProactiveAiPerHour?: number
  dialogueRepeatWindowMs?: number
  tagCooldownMs?: Partial<Record<PresenceTag, number>>
  restartReturnDelayMs?: number
  sessionPersistIntervalMs?: number
  scenePerformanceStableMs?: number
  /** 最近一次感知到的前台页面（由桥接层定时刷新）。 */
  getScreenContext?: () => { app: string; title?: string; url?: string } | null
  lateNightStableMs?: number
  idleMicroMs?: number
  restEnergy?: number
  idleClipRepeatMs?: number
}

export class PresenceController {
  readonly mode: PresenceMode
  private readonly now: () => number
  private readonly random: () => number
  private readonly focusFirstMs: number
  private readonly focusLongMs: number
  private readonly returnAfterMs: number
  private readonly restartReturnAfterMs: number
  private readonly idleReturnAfterMs: number
  private readonly interactionGraceMs: number
  private readonly minimumSpeechGapMs: number
  private readonly maximumSpeechPerHour: number
  private readonly configuredMinimumSpeechGapMs: number | null
  private readonly configuredMaximumSpeechPerHour: number | null
  private memoryEnabled: boolean
  private emotionEnabled: boolean
  private readonly dialogueRepeatWindowMs: number
  private readonly tagCooldownMs: Record<PresenceTag, number>
  private readonly restartReturnDelayMs: number
  private readonly sessionPersistIntervalMs: number
  private readonly emotionPersistIntervalMs: number
  private readonly memoryPersistIntervalMs: number
  private readonly isProactiveAiEnabled: () => boolean
  private readonly proactiveAiTimeoutMs: number
  private readonly maximumProactiveAiPerHour: number
  private readonly configuredMaximumProactiveAiPerHour: number | null
  private readonly scenePerformanceStableMs: number
  private readonly lateNightStableMs: number
  private readonly idleMicroMs: number
  private readonly configuredIdleMicroMs: number | null
  private readonly restEnergy: number
  private readonly idleClipRepeatMs: number
  private readonly arbitrationState: PresenceArbitrationState = {
    lastRuleUse: {},
    lastSpeechAt: Number.NEGATIVE_INFINITY,
    speechEvents: [],
  }

  private eventEpoch = 0
  private sceneKey: string | null = null
  private sceneStartedAt = 0
  private focusFirstSent = false
  private focusLongSent = false
  private lateNightDateKey: string | null = null
  private lastNoticedPageUrl: string | null = null
  private inactiveStartedAt: number | null = null
  private inactiveReason: ReturnEpisode['reason'] = 'wake'
  private idleStartedAt: number | null = null
  private pendingReturn: ReturnEpisode | null = null
  private speechState: SpeechState = 'idle'
  private performanceState: PerformanceState = 'idle'
  private activePerformanceToken: string | null = null
  private performanceScheduledAt: number | null = null
  private lastPerformanceEvent: PerformanceLifecycleEvent['type'] | null = null
  private activeDeliveryId: string | null = null
  private deliveryScheduledAt: number | null = null
  private lastEventType: string | null = null
  private lastDecision: PresenceDecision | null = null
  private lastPerformedRuleId: string | null = null
  private lastPerformedAt: number | null = null
  private decisionCount = 0
  private deliveredCount = 0
  private lastReturnAwayMs: number | null = null
  private session: PresenceSessionState
  private lastSessionPersistAt = 0
  private emotion: EmotionState
  private lastEmotionPersistAt = 0
  private latestScene: TimeSceneContext | null = null
  private memoryState: MemoryStateWithSignals
  private lastMemoryPersistAt = 0
  private lastAffectionLevel = 1
  private lastIdleClip: { clip: string; at: number } | null = null
  private currentIntensity: PresenceIntensity = 'balanced'
  private proactiveAiPlanning = false
  private proactiveAiGeneration = 0
  private proactiveAiAbortController: AbortController | null = null
  private proactiveAiRequestTimes: number[] = []
  private lastProactiveAiOutcome: string | null = null
  private lastProactiveAiIntent: string | null = null
  private readonly startedAt: number
  private telemetry: PresenceTelemetrySnapshot

  constructor(private readonly options: PresenceControllerOptions) {
    this.mode = parsePresenceMode(options.mode)
    this.memoryEnabled = options.memoryEnabled ?? true
    this.emotionEnabled = options.emotionEnabled ?? true
    this.now = options.now ?? (() => Date.now())
    this.random = options.random ?? Math.random
    this.focusFirstMs = options.focusFirstMs ?? DEFAULT_FOCUS_FIRST_MS
    this.focusLongMs = Math.max(this.focusFirstMs, options.focusLongMs ?? DEFAULT_FOCUS_LONG_MS)
    this.returnAfterMs = options.returnAfterMs ?? DEFAULT_RETURN_AFTER_MS
    this.restartReturnAfterMs = options.restartReturnAfterMs ?? DEFAULT_RESTART_RETURN_AFTER_MS
    this.idleReturnAfterMs = options.idleReturnAfterMs ?? DEFAULT_IDLE_RETURN_AFTER_MS
    this.interactionGraceMs = options.interactionGraceMs ?? DEFAULT_INTERACTION_GRACE_MS
    this.configuredMinimumSpeechGapMs = options.minimumSpeechGapMs ?? null
    this.configuredMaximumSpeechPerHour = options.maximumSpeechPerHour ?? null
    this.minimumSpeechGapMs = options.minimumSpeechGapMs ?? DEFAULT_MINIMUM_SPEECH_GAP_MS
    this.maximumSpeechPerHour = options.maximumSpeechPerHour ?? DEFAULT_MAXIMUM_SPEECH_PER_HOUR
    this.dialogueRepeatWindowMs =
      options.dialogueRepeatWindowMs ?? DEFAULT_DIALOGUE_REPEAT_WINDOW_MS
    this.tagCooldownMs = {
      ...DEFAULT_TAG_COOLDOWNS,
      ...options.tagCooldownMs,
    }
    this.restartReturnDelayMs = options.restartReturnDelayMs ?? DEFAULT_RESTART_RETURN_DELAY_MS
    this.sessionPersistIntervalMs =
      options.sessionPersistIntervalMs ?? DEFAULT_SESSION_PERSIST_INTERVAL_MS
    this.emotionPersistIntervalMs =
      options.emotionPersistIntervalMs ?? DEFAULT_EMOTION_PERSIST_INTERVAL_MS
    this.memoryPersistIntervalMs =
      options.memoryPersistIntervalMs ?? DEFAULT_MEMORY_PERSIST_INTERVAL_MS
    this.isProactiveAiEnabled = options.isProactiveAiEnabled ?? (() => false)
    this.proactiveAiTimeoutMs = options.proactiveAiTimeoutMs ?? DEFAULT_PROACTIVE_AI_TIMEOUT_MS
    this.configuredMaximumProactiveAiPerHour = options.maximumProactiveAiPerHour ?? null
    this.maximumProactiveAiPerHour =
      options.maximumProactiveAiPerHour ?? DEFAULT_MAX_PROACTIVE_AI_PER_HOUR
    this.scenePerformanceStableMs =
      options.scenePerformanceStableMs ?? DEFAULT_SCENE_PERFORMANCE_STABLE_MS
    this.lateNightStableMs = options.lateNightStableMs ?? DEFAULT_LATE_NIGHT_STABLE_MS
    this.configuredIdleMicroMs = options.idleMicroMs ?? null
    this.idleMicroMs = options.idleMicroMs ?? DEFAULT_IDLE_MICRO_MS
    this.restEnergy = options.restEnergy ?? DEFAULT_REST_ENERGY
    this.idleClipRepeatMs = options.idleClipRepeatMs ?? DEFAULT_IDLE_CLIP_REPEAT_MS
    const now = this.now()
    this.startedAt = now
    this.telemetry = {
      sampledAt: now,
      uptimeMs: 0,
      sceneSamples: 0,
      decisions: 0,
      silentDecisions: 0,
      performed: 0,
      speeches: 0,
      proactiveRequests: 0,
      proactiveFallbacks: 0,
      proactiveCancellations: 0,
      repeatedDialoguesSuppressed: 0,
      repeatedIdleClipsSuppressed: 0,
      actionInterruptions: 0,
      recoveryCompletions: 0,
      voiceInterruptions: 0,
      rules: {},
    }
    const initialRuntime = this.options.getRuntime()
    this.currentIntensity = initialRuntime.intensity
    const defaultEmotion = createDefaultEmotionState(
      now,
      initialRuntime.energy,
      initialRuntime.mood,
      initialRuntime.affectionLevel,
    )
    this.emotion =
      this.emotionEnabled && options.initialEmotion
        ? normalizeEmotionState(options.initialEmotion, defaultEmotion)
        : defaultEmotion
    this.lastEmotionPersistAt = now
    this.lastAffectionLevel = initialRuntime.affectionLevel
    this.memoryState =
      this.memoryEnabled && options.initialMemory
        ? normalizeEpisodicMemoryState(options.initialMemory, now)
        : createEmptyEpisodicMemoryState()
    this.lastMemoryPersistAt = now
    const restored = this.memoryEnabled
      ? normalizePresenceSession(options.initialSession, now)
      : normalizePresenceSession(undefined, now)
    const previousLastSeenAt = restored.lastSeenAt
    this.session = {
      ...restored,
      sessionStartedAt: now,
      lastSeenAt: now,
    }
    if (previousLastSeenAt > 0 && now - previousLastSeenAt >= this.restartReturnAfterMs) {
      this.pendingReturn = {
        id: randomUUID(),
        awayStartedAt: previousLastSeenAt,
        returnedAt: now,
        awayMs: now - previousLastSeenAt,
        reason: 'restart',
        greeted: false,
      }
      this.lastReturnAwayMs = now - previousLastSeenAt
    }
  }

  observeScene(scene: TimeSceneContext): PresenceDecision {
    this.eventEpoch += 1
    this.lastEventType = 'scene_sample'
    const now = scene.sampledAt
    this.telemetry.sceneSamples += 1
    this.telemetry.sampledAt = now
    this.telemetry.uptimeMs = Math.max(0, now - this.startedAt)
    const previousScene = this.latestScene
    this.latestScene = scene
    if (this.memoryEnabled) {
      this.session.lastSeenAt = now
      this.session.lastExternalScene = isExternalScene(scene.scene)
        ? scene.scene
        : this.session.lastExternalScene
      this.session.lastTimePeriod = scene.timePeriod
      this.persistSession(now)
    }
    this.expireStaleDelivery(now)
    this.expireStalePerformance(now)
    this.updateSceneEpisode(scene, now)
    this.updateReturnEpisode(scene, now)
    if ((scene.screenLocked || scene.suspended) && this.proactiveAiPlanning) {
      this.cancelProactiveAi('power')
    } else if (
      previousScene &&
      (previousScene.scene !== scene.scene || previousScene.timePeriod !== scene.timePeriod) &&
      this.proactiveAiPlanning
    ) {
      this.cancelProactiveAi('scene')
    }

    if (this.mode === 'legacy') {
      return this.recordSilentDecision(now, 'legacy 模式只保留旧调度器')
    }

    const runtime = this.options.getRuntime()
    if (this.emotionEnabled) {
      this.emotion = advanceEmotion(this.emotion, {
        now,
        scene,
        energy: runtime.energy,
        mood: runtime.mood,
        affectionLevel: runtime.affectionLevel,
      })
      this.persistEmotion(now)
    }
    if (this.memoryEnabled) {
      this.memoryState = pruneEpisodicMemories(this.memoryState, now)
      if (runtime.affectionLevel > this.lastAffectionLevel) {
        this.recordMemory({
          type: 'relationship_milestone',
          eventId: randomUUID(),
          at: now,
          affectionLevel: runtime.affectionLevel,
        })
      }
      this.lastAffectionLevel = runtime.affectionLevel
      this.persistMemory(now)
    }
    const context = createPresenceContext(
      scene,
      {
        energy: runtime.energy,
        mood: runtime.mood,
        affectionLevel: runtime.affectionLevel,
      },
      runtime,
      this.speechState,
      this.performanceState,
      this.emotionEnabled ? this.emotion : undefined,
      this.emotionEnabled ? getRelationshipProfile(runtime.affectionLevel) : undefined,
    )
    this.currentIntensity = context.runtime.intensity
    if (!context.runtime.autonomyEnabled) {
      return this.recordSilentDecision(now, '主动行为已关闭')
    }
    if (this.proactiveAiPlanning) {
      return this.recordSilentDecision(now, '主动 AI 正在规划高价值事件')
    }
    const candidates = this.collectCandidates(context)
      .filter((candidate) => !this.isIdleClipRepeated(candidate, context.now))
      .filter(
        (candidate) =>
          !this.memoryEnabled || !this.isCandidateSuppressedByHistory(candidate, context.now),
      )
    const decision = arbitratePresence(candidates, context, this.arbitrationState, {
      minimumInteractionGraceMs: this.interactionGraceMs,
      minimumSpeechGapMs: this.getEffectiveMinimumSpeechGapMs(context.runtime.intensity),
      maximumSpeechPerHour: this.getEffectiveMaximumSpeechPerHour(context.runtime.intensity),
      random: this.random,
      eventEpoch: this.eventEpoch,
      ...(this.options.utility ? { utility: this.options.utility } : {}),
    })
    this.applyDecision(decision, context)
    return decision
  }

  /** 对话带来的轻量互动：更新时间、取消主动规划，并按情绪微调心情。 */
  notifyChat(sentiment: 'positive' | 'neutral' | 'negative'): void {
    this.eventEpoch += 1
    this.lastEventType = 'user_interaction'
    if (this.proactiveAiPlanning) {
      this.cancelProactiveAi('user')
    }
    const now = this.now()
    if (this.memoryEnabled) {
      this.session.lastInteractionAt = now
      this.persistSession(now, true)
    }
    if (!this.emotionEnabled) {
      return
    }
    const delta = sentiment === 'positive' ? 3 : sentiment === 'negative' ? -2 : 0
    if (delta !== 0) {
      this.emotion = {
        ...this.emotion,
        valence: Math.max(0, Math.min(100, this.emotion.valence + delta)),
        updatedAt: now,
      }
      this.persistEmotion(now, true)
    }
  }

  notifyInteraction(interaction?: PetInteraction): void {
    this.eventEpoch += 1
    this.lastEventType = 'user_interaction'
    if (this.proactiveAiPlanning) {
      this.cancelProactiveAi('user')
    }
    const now = this.now()
    if (this.memoryEnabled) {
      this.session.lastInteractionAt = now
      this.persistSession(now, true)
    }
    if (this.emotionEnabled && this.mode === 'active' && interaction && this.latestScene) {
      const runtime = this.options.getRuntime()
      this.emotion = applyInteractionEmotion(this.emotion, {
        now,
        scene: this.latestScene,
        energy: runtime.energy,
        mood: runtime.mood,
        affectionLevel: runtime.affectionLevel,
        kind: interaction.kind,
        area: interaction.area,
      })
      this.persistEmotion(now, true)
    }
  }

  handleDeliveryScheduled(deliveryId: string): void {
    this.activeDeliveryId = deliveryId
    this.speechState = 'synthesizing'
    this.deliveryScheduledAt = this.now()
    this.lastEventType = 'delivery_scheduled'
  }

  handlePerformanceScheduled(performanceToken: string): void {
    this.activePerformanceToken = performanceToken
    this.performanceState = 'preparing'
    this.performanceScheduledAt = this.now()
    this.lastPerformanceEvent = 'action_prepared'
    this.lastEventType = 'performance_scheduled'
  }

  handlePerformanceEvent(event: PerformanceLifecycleEvent): boolean {
    if (event.performanceToken !== this.activePerformanceToken) {
      return false
    }
    this.lastPerformanceEvent = event.type
    this.performanceScheduledAt = this.now()
    if (event.type === 'action_prepared') {
      this.performanceState = 'preparing'
      return true
    }
    if (event.type === 'action_started' || event.type === 'micro_started') {
      this.performanceState = 'performing'
      return true
    }
    if (
      event.type === 'action_completed' ||
      event.type === 'micro_completed' ||
      event.type === 'recovery_started'
    ) {
      this.performanceState = 'recovering'
      return true
    }
    if (event.type === 'action_interrupted' || event.type === 'recovery_completed') {
      if (event.type === 'action_interrupted') {
        this.telemetry.actionInterruptions += 1
      } else {
        this.telemetry.recoveryCompletions += 1
      }
      this.performanceState = 'idle'
      this.activePerformanceToken = null
      this.performanceScheduledAt = null
      return true
    }
    return false
  }

  handleDeliveryEvent(event: DeliveryLifecycleEvent): boolean {
    if (event.deliveryId !== this.activeDeliveryId) {
      return false
    }
    this.lastEventType = event.type
    if (event.type === 'speech_started') {
      this.speechState = 'speaking'
      return true
    }
    if (event.type === 'speech_completed' || event.type === 'speech_interrupted') {
      if (event.type === 'speech_interrupted') {
        this.telemetry.voiceInterruptions += 1
      }
      this.speechState = 'idle'
      this.activeDeliveryId = null
      this.deliveryScheduledAt = null
      return true
    }
    return false
  }

  getDiagnostics(): PresenceDiagnostics {
    const decision = this.lastDecision
    return {
      mode: this.mode,
      memoryEnabled: this.memoryEnabled,
      emotionEnabled: this.emotionEnabled,
      emotionDominant: this.emotionEnabled ? this.emotion.dominant : null,
      emotionValence: this.emotionEnabled ? this.emotion.valence : null,
      emotionActivation: this.emotionEnabled ? this.emotion.activation : null,
      emotionFatigue: this.emotionEnabled ? this.emotion.fatigue : null,
      emotionPatience: this.emotionEnabled ? this.emotion.patience : null,
      emotionSocialBattery: this.emotionEnabled ? this.emotion.socialBattery : null,
      speechState: this.speechState,
      performanceState: this.performanceState,
      activePerformanceToken: this.activePerformanceToken,
      lastPerformanceEvent: this.lastPerformanceEvent,
      activeDeliveryId: this.activeDeliveryId,
      lastEventType: this.lastEventType,
      lastRuleId:
        this.lastPerformedRuleId ??
        (decision?.kind === 'perform' ? decision.candidate.ruleId : null),
      lastPerformedRuleId: this.lastPerformedRuleId,
      lastDecision: decision?.kind ?? null,
      lastDecisionReason:
        decision?.kind === 'silent' ? decision.reason : (decision?.candidate.reason ?? null),
      lastDecisionAt: decision?.selectedAt ?? null,
      lastPerformedAt: this.lastPerformedAt,
      decisionCount: this.decisionCount,
      deliveredCount: this.deliveredCount,
      speechCountLastHour: this.getRecentSpeechCount(this.lastDecision?.selectedAt ?? this.now()),
      lastReturnAwayMs: this.lastReturnAwayMs,
      recentDialogueCount: this.session.recentDialogues.length,
      memoryCount: this.memoryEnabled ? this.memoryState.memories.length : 0,
      proactiveAiRequestsLastHour: this.proactiveAiRequestTimes.filter(
        (timestamp) => this.now() - timestamp < 3_600_000,
      ).length,
      proactiveAiRequestLimit: this.getEffectiveMaximumProactiveAiPerHour(this.currentIntensity),
      lastProactiveAiOutcome: this.lastProactiveAiOutcome,
      lastProactiveAiIntent: this.lastProactiveAiIntent,
    }
  }

  getTelemetry(): PresenceTelemetrySnapshot {
    this.telemetry.sampledAt = this.now()
    this.telemetry.uptimeMs = Math.max(0, this.telemetry.sampledAt - this.startedAt)
    return structuredClone(this.telemetry)
  }

  getSessionState(): PresenceSessionState {
    return structuredClone(this.session)
  }

  getEmotionState(): EmotionState | null {
    return this.emotionEnabled ? structuredClone(this.emotion) : null
  }

  getEmotionVoice(): string | null {
    if (!this.emotionEnabled) {
      return null
    }
    const relationship = getRelationshipProfile(this.options.getRuntime().affectionLevel)
    return getVoiceEmotion(this.emotion, this.options.getRuntime().affectionLevel, relationship)
  }

  setMemoryEnabled(
    enabled: boolean,
    restoredSession?: PresenceSessionState,
    restoredMemory?: MemoryStateWithSignals,
  ): void {
    this.memoryEnabled = enabled
    const now = this.now()
    if (!enabled) {
      this.session = normalizePresenceSession(undefined, now)
      this.memoryState = createEmptyEpisodicMemoryState()
      this.pendingReturn = null
      this.lastSessionPersistAt = 0
      this.lastMemoryPersistAt = 0
      return
    }
    this.restoreSession(restoredSession, now)
    this.memoryState = normalizeEpisodicMemoryState(restoredMemory, now)
    this.lastMemoryPersistAt = 0
    this.persistMemory(now, true)
  }

  setEmotionEnabled(enabled: boolean, restoredEmotion?: EmotionState): void {
    this.emotionEnabled = enabled
    const now = this.now()
    const runtime = this.options.getRuntime()
    if (!enabled) {
      this.emotion = createDefaultEmotionState(
        now,
        runtime.energy,
        runtime.mood,
        runtime.affectionLevel,
      )
      this.lastEmotionPersistAt = now
      return
    }
    const fallback = createDefaultEmotionState(
      now,
      runtime.energy,
      runtime.mood,
      runtime.affectionLevel,
    )
    this.emotion = normalizeEmotionState(restoredEmotion, fallback)
    this.lastEmotionPersistAt = 0
    this.persistEmotion(now, true)
  }

  flushSession(): void {
    if (this.memoryEnabled) {
      this.persistSession(this.now(), true)
    }
  }

  flushEmotion(): void {
    if (this.emotionEnabled) {
      this.persistEmotion(this.now(), true)
    }
  }

  flushMemory(): void {
    if (this.memoryEnabled) {
      this.persistMemory(this.now(), true)
    }
  }

  getEpisodicMemories(): EpisodicMemory[] {
    return this.memoryEnabled
      ? structuredClone(
          [...this.memoryState.memories].sort((left, right) => right.updatedAt - left.updatedAt),
        )
      : []
  }

  deleteEpisodicMemory(id: string): EpisodicMemory[] {
    if (!this.memoryEnabled) {
      return []
    }
    this.memoryState = deleteEpisodicMemory(this.memoryState, id)
    this.persistMemory(this.now(), true)
    return this.getEpisodicMemories()
  }

  clearEpisodicMemories(): void {
    if (!this.memoryEnabled) {
      return
    }
    this.memoryState = clearEpisodicMemories(this.memoryState)
    this.persistMemory(this.now(), true)
  }

  retrieveRelevantMemories(limit = 5): EpisodicMemory[] {
    if (!this.memoryEnabled || !this.latestScene) {
      return []
    }
    const tags: PresenceTag[] = []
    if (this.latestScene.scene === 'focus' || this.latestScene.scene === 'development') {
      tags.push('focus')
    }
    if (this.latestScene.timePeriod === 'late_night') {
      tags.push('late_night')
    }
    if (tags.length === 0) {
      tags.push('scene_comment')
    }
    const result = retrieveEpisodicMemories(this.memoryState, {
      now: this.now(),
      tags,
      limit,
      markReferenced: false,
    })
    this.memoryState = result.state
    return result.memories
  }

  private updateSceneEpisode(scene: TimeSceneContext, now: number): void {
    if (!isExternalScene(scene.scene)) {
      this.sceneKey = null
      this.sceneStartedAt = 0
      this.focusFirstSent = false
      this.focusLongSent = false
      return
    }

    if (this.sceneKey !== scene.scene) {
      this.sceneKey = scene.scene
      this.sceneStartedAt = now
      this.focusFirstSent = false
      this.focusLongSent = false
    }
  }

  private expireStaleDelivery(now: number): void {
    if (
      this.activeDeliveryId &&
      this.deliveryScheduledAt !== null &&
      now - this.deliveryScheduledAt > DELIVERY_STATE_TIMEOUT_MS
    ) {
      this.speechState = 'idle'
      this.activeDeliveryId = null
      this.deliveryScheduledAt = null
      this.lastEventType = 'delivery_timeout'
    }
  }

  private expireStalePerformance(now: number): void {
    if (
      this.activePerformanceToken &&
      this.performanceScheduledAt !== null &&
      now - this.performanceScheduledAt > DELIVERY_STATE_TIMEOUT_MS
    ) {
      this.performanceState = 'idle'
      this.activePerformanceToken = null
      this.performanceScheduledAt = null
      this.lastPerformanceEvent = 'action_interrupted'
      this.lastEventType = 'performance_timeout'
    }
  }

  private updateReturnEpisode(scene: TimeSceneContext, now: number): void {
    const inactive = scene.screenLocked || scene.suspended
    if (inactive) {
      if (this.inactiveStartedAt === null) {
        this.inactiveStartedAt = now
        this.inactiveReason = scene.suspended ? 'wake' : 'unlock'
      }
      this.idleStartedAt = null
      return
    }

    if (this.inactiveStartedAt !== null) {
      this.queueReturnEpisode(this.inactiveStartedAt, now, this.inactiveReason, this.returnAfterMs)
      this.inactiveStartedAt = null
    }

    if (scene.systemIdleSeconds * 1_000 >= this.idleReturnAfterMs) {
      if (this.idleStartedAt === null) {
        this.idleStartedAt = now - scene.systemIdleSeconds * 1_000
      }
      return
    }

    if (this.idleStartedAt !== null && scene.systemIdleSeconds <= 10) {
      this.queueReturnEpisode(this.idleStartedAt, now, 'system-idle', this.returnAfterMs)
      this.idleStartedAt = null
    }
  }

  private queueReturnEpisode(
    awayStartedAt: number,
    returnedAt: number,
    reason: ReturnEpisode['reason'],
    thresholdMs: number,
  ): void {
    const awayMs = Math.max(0, returnedAt - awayStartedAt)
    if (awayMs < thresholdMs) {
      return
    }
    const episode: ReturnEpisode = {
      id: randomUUID(),
      awayStartedAt,
      returnedAt,
      awayMs,
      reason,
      greeted: false,
    }
    this.lastReturnAwayMs = awayMs
    if (!this.pendingReturn || this.pendingReturn.awayMs < awayMs) {
      this.pendingReturn = episode
    }
  }

  private collectCandidates(context: PresenceContextV1): PresenceCandidate[] {
    const candidates: PresenceCandidate[] = []
    const now = context.now

    if (this.pendingReturn && now - this.pendingReturn.returnedAt > RETURN_EPISODE_MAX_AGE_MS) {
      this.pendingReturn = null
    }
    if (
      this.pendingReturn &&
      (this.pendingReturn.reason !== 'restart' ||
        now - this.pendingReturn.returnedAt >= this.restartReturnDelayMs)
    ) {
      candidates.push(createReturnGreetingCandidate(this.pendingReturn))
    }

    const sceneDurationMs = this.sceneStartedAt > 0 ? now - this.sceneStartedAt : 0
    const focusScene = context.scene.scene === 'focus' || context.scene.scene === 'development'
    if (focusScene && isExternalScene(context.scene.scene)) {
      if (!this.focusLongSent && sceneDurationMs >= this.focusLongMs) {
        candidates.push(createFocusMilestoneCandidate('long'))
      } else if (!this.focusFirstSent && sceneDurationMs >= this.focusFirstMs) {
        candidates.push(createFocusMilestoneCandidate('first'))
      }
    }

    const dateKey = `${context.scene.localDate}:late-night`
    if (
      context.scene.timePeriod === 'late_night' &&
      isExternalScene(context.scene.scene) &&
      sceneDurationMs >= this.lateNightStableMs &&
      this.lateNightDateKey !== dateKey
    ) {
      candidates.push(createLateNightCandidate())
    }

    // 每小时至少问候一次：距上次开口超过 55 分钟时补一句。
    if (
      Number.isFinite(this.arbitrationState.lastSpeechAt) &&
      now - this.arbitrationState.lastSpeechAt >= 55 * 60_000
    ) {
      candidates.push(createHourlyGreetingCandidate(new Date(now).getHours()))
    }

    // 浏览器切到新页面时，主动问一句或评论一下。
    const page = this.options.getScreenContext?.()
    if (page?.url && page.url !== this.lastNoticedPageUrl) {
      this.lastNoticedPageUrl = page.url
      candidates.push(createPageNoticeCandidate(page))
    }

    if (context.pet.energy <= this.restEnergy) {
      candidates.push(createRestCandidate())
    }

    if (
      this.options.getScenePerformance &&
      candidates.length === 0 &&
      isExternalScene(context.scene.scene) &&
      sceneDurationMs >= this.scenePerformanceStableMs &&
      context.runtime.speechState === 'idle' &&
      now - context.runtime.lastInteractionAt >= this.interactionGraceMs
    ) {
      const sceneCandidate = this.options.getScenePerformance(context)
      if (sceneCandidate) {
        candidates.push(sceneCandidate)
      }
    }

    if (
      now - context.runtime.lastInteractionAt >=
        this.getEffectiveIdleMicroMs(context.runtime.intensity) &&
      isExternalScene(context.scene.scene)
    ) {
      if (
        context.runtime.intensity !== 'quiet' &&
        !isQuietScene(context.scene.scene) &&
        now - context.runtime.lastInteractionAt >= 60_000
      ) {
        candidates.push(createAutonomousWalkCandidate())
      }
      candidates.push(createIdleMicroCandidate())
    }

    return candidates
  }

  private applyDecision(decision: PresenceDecision, context: PresenceContextV1): void {
    this.lastDecision = decision
    this.decisionCount += 1
    this.telemetry.decisions += 1
    this.telemetry.sampledAt = context.now
    this.options.onDecision?.(decision, context)

    if (decision.kind === 'silent') {
      this.telemetry.silentDecisions += 1
      return
    }

    const { candidate } = decision
    this.lastPerformedRuleId = candidate.ruleId
    this.lastPerformedAt = decision.selectedAt
    this.arbitrationState.lastRuleUse[candidate.cooldownKey] = context.now
    if (candidate.speech !== 'none') {
      this.arbitrationState.lastSpeechAt = context.now
      this.arbitrationState.speechEvents = [
        ...this.arbitrationState.speechEvents.filter((event) => context.now - event.at < 3_600_000),
        { at: context.now, priority: candidate.priority },
      ]
    }
    if (this.mode === 'active' && this.memoryEnabled) {
      this.recordCandidateMemory(candidate, context)
    }
    this.markRuleConsumed(candidate, context)

    if (this.mode !== 'active') {
      return
    }

    if (this.shouldPlanProactiveAi(candidate, context)) {
      this.proactiveAiPlanning = true
      const generation = ++this.proactiveAiGeneration
      this.proactiveAiRequestTimes = [
        ...this.proactiveAiRequestTimes.filter((timestamp) => context.now - timestamp < 3_600_000),
        context.now,
      ]
      this.lastProactiveAiOutcome = 'pending'
      this.lastProactiveAiIntent = null
      this.telemetry.proactiveRequests += 1
      void this.planAndDeliver(candidate, context, generation, decision.eventEpoch)
      return
    }

    this.deliverCandidate(candidate, context, 'local', decision.eventEpoch)
  }

  private deliverCandidate(
    candidate: PresenceCandidate,
    context: PresenceContextV1,
    source: 'local' | 'proactive-ai',
    eventEpoch: number,
  ): void {
    if (candidate.speech !== 'none' && this.memoryEnabled) {
      this.recordDialogue(candidate, context.now)
      this.persistSession(context.now, true)
    }
    if (this.emotionEnabled) {
      this.emotion = applyPresenceEmotion(this.emotion, candidate, context.now)
      this.persistEmotion(context.now, true)
    }
    const relationship = this.emotionEnabled
      ? getRelationshipProfile(context.pet.affectionLevel)
      : null
    const voiceEmotion = this.emotionEnabled
      ? getVoiceEmotion(this.emotion, context.pet.affectionLevel, relationship ?? undefined)
      : null
    const deliveryId = candidate.speech === 'none' ? null : randomUUID()
    const performanceToken = randomUUID()
    if (
      candidate.speech === 'none' &&
      candidate.tags.includes('scene_comment') &&
      candidate.modelClip
    ) {
      this.lastIdleClip = { clip: candidate.modelClip, at: context.now }
    }
    this.deliveredCount += 1
    this.telemetry.performed += 1
    this.telemetry.rules[candidate.ruleId] = (this.telemetry.rules[candidate.ruleId] ?? 0) + 1
    if (candidate.speech !== 'none') {
      this.telemetry.speeches += 1
    }
    if (deliveryId) {
      this.handleDeliveryScheduled(deliveryId)
    }
    this.options.deliver({
      candidate,
      eventEpoch,
      deliveryId,
      performanceToken,
      emotion: this.emotionEnabled ? structuredClone(this.emotion) : null,
      relationship,
      selectedAt: context.now,
      source,
      voiceEmotion,
    })
  }

  private shouldPlanProactiveAi(candidate: PresenceCandidate, context: PresenceContextV1): boolean {
    if (
      !this.options.planProactiveAi ||
      candidate.speech === 'none' ||
      candidate.priority < 40 ||
      !this.isProactiveAiEnabled()
    ) {
      return false
    }
    const now = this.now()
    this.proactiveAiRequestTimes = this.proactiveAiRequestTimes.filter(
      (timestamp) => now - timestamp < 3_600_000,
    )
    if (
      this.proactiveAiRequestTimes.length >=
      this.getEffectiveMaximumProactiveAiPerHour(context.runtime.intensity)
    ) {
      this.lastProactiveAiOutcome = 'budget_exhausted'
      return false
    }
    return true
  }

  private async planAndDeliver(
    localCandidate: PresenceCandidate,
    context: PresenceContextV1,
    generation: number,
    eventEpoch: number,
  ): Promise<void> {
    const planner = this.options.planProactiveAi
    if (!planner) {
      this.proactiveAiPlanning = false
      this.lastProactiveAiOutcome = 'unavailable'
      this.telemetry.proactiveFallbacks += 1
      this.deliverCandidate(localCandidate, context, 'local', eventEpoch)
      return
    }
    const abortController = new AbortController()
    this.proactiveAiAbortController = abortController
    let timeout: NodeJS.Timeout | null = null
    try {
      const memories = this.retrieveRelevantMemories(5)
      const aiContext = this.buildProactiveAiContext(localCandidate, context, memories)
      const plan = await Promise.race([
        planner({
          context: aiContext,
          localCandidate,
          signal: abortController.signal,
        }),
        new Promise<null>((resolve) => {
          timeout = setTimeout(() => {
            abortController.abort()
            resolve(null)
          }, this.proactiveAiTimeoutMs)
        }),
      ])
      if (generation !== this.proactiveAiGeneration) {
        return
      }
      this.proactiveAiPlanning = false
      this.proactiveAiAbortController = null
      if (!plan) {
        this.lastProactiveAiOutcome = 'fallback'
        this.lastProactiveAiIntent = null
        this.telemetry.proactiveFallbacks += 1
        this.deliverCandidate(localCandidate, context, 'local', eventEpoch)
        return
      }
      this.lastProactiveAiIntent = plan.intent
      this.lastProactiveAiOutcome = plan.should_speak ? 'speaking' : 'silent'
      const plannedCandidate = planToPresenceCandidate(localCandidate, plan)
      if (
        plannedCandidate.speech === 'none' &&
        plannedCandidate.action === 'idle' &&
        (plannedCandidate.expression === undefined || plannedCandidate.expression === 'neutral')
      ) {
        return
      }
      if (plannedCandidate.speech !== 'none' && plannedCandidate.memoryReferenceIds?.length) {
        this.memoryState = markMemoriesReferenced(
          this.memoryState,
          plannedCandidate.memoryReferenceIds,
          context.now,
        )
        this.persistMemory(context.now, true)
      }
      this.deliverCandidate(plannedCandidate, context, 'proactive-ai', eventEpoch)
    } catch (error) {
      if (generation !== this.proactiveAiGeneration) {
        return
      }
      this.proactiveAiPlanning = false
      this.proactiveAiAbortController = null
      this.lastProactiveAiOutcome = 'fallback'
      this.lastProactiveAiIntent = null
      this.telemetry.proactiveFallbacks += 1
      console.error('Proactive AI planning failed; using local fallback:', error)
      this.deliverCandidate(localCandidate, context, 'local', eventEpoch)
    } finally {
      if (timeout) {
        clearTimeout(timeout)
      }
      if (generation === this.proactiveAiGeneration) {
        this.proactiveAiPlanning = false
        this.proactiveAiAbortController = null
      }
    }
  }

  private buildProactiveAiContext(
    candidate: PresenceCandidate,
    context: PresenceContextV1,
    memories: EpisodicMemory[],
  ): AiProactiveContext {
    const relationship = context.relationship ?? getRelationshipProfile(context.pet.affectionLevel)
    return {
      scene: context.scene.scene,
      timePeriod: context.scene.timePeriod,
      localTime: context.scene.localTime,
      isWeekend: context.scene.isWeekend,
      emotion:
        this.emotionEnabled && context.emotion
          ? {
              dominant: context.emotion.dominant,
              valence: context.emotion.valence,
              activation: context.emotion.activation,
              fatigue: context.emotion.fatigue,
              patience: context.emotion.patience,
              socialBattery: context.emotion.socialBattery,
            }
          : null,
      relationship: relationship.closeness,
      localTrigger: {
        ruleId: candidate.ruleId,
        reason: candidate.reason,
        tags: [...candidate.tags],
      },
      memories: memories.map((memory) => ({
        id: memory.id,
        summary: memory.summary,
        tags: [...memory.tags],
        importance: memory.importance,
      })),
    }
  }

  cancelProactiveAi(reason = 'settings'): void {
    if (!this.proactiveAiPlanning) {
      return
    }
    this.proactiveAiGeneration += 1
    this.proactiveAiPlanning = false
    this.proactiveAiAbortController?.abort()
    this.proactiveAiAbortController = null
    this.lastProactiveAiOutcome = `cancelled:${reason}`
    this.lastProactiveAiIntent = null
    this.telemetry.proactiveCancellations += 1
  }

  private recordCandidateMemory(candidate: PresenceCandidate, context: PresenceContextV1): void {
    let event: EpisodicMemoryEvent | null = null
    if (
      candidate.ruleId === 'focus-first-milestone' ||
      candidate.ruleId === 'focus-long-milestone'
    ) {
      event = {
        type: 'long_focus',
        eventId: randomUUID(),
        at: context.now,
        scene: context.scene,
        durationMs: Math.max(0, context.now - this.sceneStartedAt),
      }
    } else if (candidate.ruleId === 'late-night-first') {
      event = {
        type: 'late_night_work',
        eventId: randomUUID(),
        at: context.now,
        scene: context.scene,
      }
    } else if (candidate.ruleId === 'return-greeting' && this.pendingReturn) {
      event = {
        type: 'return',
        eventId: randomUUID(),
        at: context.now,
        awayMs: this.pendingReturn.awayMs,
      }
    }
    if (event) {
      this.recordMemory(event)
    }
  }

  private markRuleConsumed(candidate: PresenceCandidate, context: PresenceContextV1): void {
    if (candidate.ruleId === 'focus-first-milestone') {
      this.focusFirstSent = true
    }
    if (candidate.ruleId === 'focus-long-milestone') {
      this.focusFirstSent = true
      this.focusLongSent = true
    }
    if (candidate.ruleId === 'late-night-first') {
      this.lateNightDateKey = `${context.scene.localDate}:late-night`
    }
    if (candidate.ruleId === 'return-greeting') {
      if (this.pendingReturn) {
        this.pendingReturn = {
          ...this.pendingReturn,
          greeted: true,
        }
      }
      this.pendingReturn = null
    }
  }

  private getRecentSpeechCount(now: number): number {
    return this.arbitrationState.speechEvents.filter((event) => now - event.at < 3_600_000).length
  }

  private getEffectiveMinimumSpeechGapMs(intensity: PresenceIntensity): number {
    return (
      this.configuredMinimumSpeechGapMs ?? PRESENCE_INTENSITY_POLICY[intensity].minimumSpeechGapMs
    )
  }

  private getEffectiveMaximumSpeechPerHour(intensity: PresenceIntensity): number {
    return (
      this.configuredMaximumSpeechPerHour ??
      PRESENCE_INTENSITY_POLICY[intensity].maximumSpeechPerHour
    )
  }

  private getEffectiveMaximumProactiveAiPerHour(intensity: PresenceIntensity): number {
    return (
      this.configuredMaximumProactiveAiPerHour ??
      PRESENCE_INTENSITY_POLICY[intensity].maximumProactiveAiPerHour
    )
  }

  private getEffectiveIdleMicroMs(intensity: PresenceIntensity): number {
    return this.configuredIdleMicroMs ?? PRESENCE_INTENSITY_POLICY[intensity].idleMicroMs
  }

  private isCandidateSuppressedByHistory(candidate: PresenceCandidate, now: number): boolean {
    if (candidate.speech === 'none') {
      return false
    }
    const fingerprint = getDialogueFingerprint(candidate)
    if (
      fingerprint &&
      this.session.recentDialogues.some(
        (entry) => entry.textHash === fingerprint && now - entry.at < this.dialogueRepeatWindowMs,
      )
    ) {
      this.telemetry.repeatedDialoguesSuppressed += 1
      return true
    }
    const tagSuppressed = candidate.tags.some((tag) => {
      const lastUsedAt = this.session.tagLastUsedAt[tag]
      return lastUsedAt !== undefined && now - lastUsedAt < (this.tagCooldownMs[tag] ?? 0)
    })
    if (tagSuppressed) {
      this.telemetry.repeatedDialoguesSuppressed += 1
    }
    return tagSuppressed
  }

  private isIdleClipRepeated(candidate: PresenceCandidate, now: number): boolean {
    const repeated = Boolean(
      candidate.speech === 'none' &&
      candidate.tags.includes('scene_comment') &&
      candidate.modelClip &&
      this.lastIdleClip?.clip === candidate.modelClip &&
      now - this.lastIdleClip.at < this.idleClipRepeatMs,
    )
    if (repeated) {
      this.telemetry.repeatedIdleClipsSuppressed += 1
    }
    return repeated
  }

  private recordDialogue(candidate: PresenceCandidate, now: number): void {
    const fingerprint = getDialogueFingerprint(candidate)
    if (!fingerprint) {
      return
    }
    const entry: PresenceDialogueHistoryEntry = {
      at: now,
      dialogueId: candidate.ruleId,
      textHash: fingerprint,
      tags: [...candidate.tags],
    }
    this.session.recentDialogues = [
      ...this.session.recentDialogues.filter((item) => now - item.at < 24 * 60 * 60_000),
      entry,
    ].slice(-MAX_RECENT_PRESENCE_DIALOGUES)
    for (const tag of candidate.tags) {
      this.session.tagLastUsedAt[tag] = now
    }
    this.session.lastSeenAt = now
  }

  private recordMemory(event: EpisodicMemoryEvent): void {
    if (!this.memoryEnabled) {
      return
    }
    this.memoryState = recordEpisodicMemory(this.memoryState, event)
    this.persistMemory(event.at, true)
  }

  private persistSession(now: number, force = false): void {
    if (!this.memoryEnabled) {
      return
    }
    if (
      !force &&
      this.lastSessionPersistAt > 0 &&
      now - this.lastSessionPersistAt < this.sessionPersistIntervalMs
    ) {
      return
    }
    this.lastSessionPersistAt = now
    this.session.lastSeenAt = now
    this.options.onSessionChanged?.(structuredClone(this.session))
  }

  private persistEmotion(now: number, force = false): void {
    if (!this.emotionEnabled) {
      return
    }
    if (
      !force &&
      this.lastEmotionPersistAt > 0 &&
      now - this.lastEmotionPersistAt < this.emotionPersistIntervalMs
    ) {
      return
    }
    this.lastEmotionPersistAt = now
    this.emotion.updatedAt = now
    this.options.onEmotionChanged?.(structuredClone(this.emotion))
  }

  private persistMemory(now: number, force = false): void {
    if (!this.memoryEnabled) {
      return
    }
    if (
      !force &&
      this.lastMemoryPersistAt > 0 &&
      now - this.lastMemoryPersistAt < this.memoryPersistIntervalMs
    ) {
      return
    }
    this.lastMemoryPersistAt = now
    this.options.onMemoryChanged?.(structuredClone(this.memoryState))
  }

  private restoreSession(session: PresenceSessionState | undefined, now: number): void {
    const restored = normalizePresenceSession(session, now)
    const previousLastSeenAt = restored.lastSeenAt
    this.session = {
      ...restored,
      sessionStartedAt: now,
      lastSeenAt: now,
    }
    this.lastSessionPersistAt = 0
    this.pendingReturn = null
    if (previousLastSeenAt > 0 && now - previousLastSeenAt >= this.restartReturnAfterMs) {
      this.pendingReturn = {
        id: randomUUID(),
        awayStartedAt: previousLastSeenAt,
        returnedAt: now,
        awayMs: now - previousLastSeenAt,
        reason: 'restart',
        greeted: false,
      }
      this.lastReturnAwayMs = now - previousLastSeenAt
    }
  }

  private recordSilentDecision(now: number, reason: string): PresenceDecision {
    const decision: PresenceDecision = {
      kind: 'silent',
      reason,
      selectedAt: now,
      eventEpoch: this.eventEpoch,
    }
    this.lastDecision = decision
    this.decisionCount += 1
    this.telemetry.decisions += 1
    this.telemetry.silentDecisions += 1
    this.telemetry.sampledAt = now
    return decision
  }
}

function planToPresenceCandidate(
  local: PresenceCandidate,
  plan: AiProactivePlan,
): PresenceCandidate {
  const shouldSpeak = plan.should_speak
  return {
    ...local,
    ruleId: `proactive-ai:${plan.intent}`,
    performanceId: `presence:proactive-ai:${plan.intent}`,
    speech: shouldSpeak ? 'optional' : 'none',
    action: plan.action,
    expression: aiEmotionToPresenceExpression(plan.emotion),
    ...(shouldSpeak && plan.reply_zh ? { dialogue: plan.reply_zh } : {}),
    ...(shouldSpeak && plan.reply_ja ? { spokenText: plan.reply_ja } : {}),
    voice: undefined,
    ttsEmotion: plan.emotion,
    ttsSeed: undefined,
    aiIntent: plan.intent,
    memoryReferenceIds: [...plan.memory_reference_ids],
    reason: `主动 AI：${plan.intent}；${local.reason}`,
  }
}

function aiEmotionToPresenceExpression(
  emotion: AiProactivePlan['emotion'],
): PresenceCandidate['expression'] {
  if (emotion === 'tired') {
    return 'sleepy'
  }
  if (
    emotion === 'annoyed' ||
    emotion === 'stern' ||
    emotion === 'suspicious' ||
    emotion === 'warning' ||
    emotion === 'deadpan'
  ) {
    return 'annoyed'
  }
  if (emotion === 'embarrassed' || emotion === 'reluctant') {
    return 'embarrassed'
  }
  return 'neutral'
}

function getDialogueFingerprint(candidate: PresenceCandidate): string | null {
  const basis =
    candidate.dialogue?.trim() ||
    candidate.spokenText?.trim() ||
    candidate.voice?.trim() ||
    candidate.ruleId
  return createHash('sha256').update(`presence-v1:${basis}`).digest('hex')
}

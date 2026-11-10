import { describe, expect, it, vi } from 'vitest'
import type {
  DeliveryLifecycleEvent,
  PresenceCandidate,
  PresenceDecision,
} from '../../src/shared/presence'
import type { AiProactivePlan } from '../../src/shared/ai-context'
import { createTimeSceneContext } from '../../src/shared/time-scene'
import type { TimeSceneContext } from '../../src/shared/time-scene'
import {
  PresenceController,
  type PresenceControllerOptions,
  type PresenceDelivery,
} from '../../src/main/presence/presence-controller'
import { createEmptyPresenceSession } from '../../src/main/presence/presence-session-store'

const BASE_TIME = new Date('2026-10-25T15:00:00+08:00')

function scene(
  offsetMs: number,
  options: {
    app?: string
    idleSeconds?: number
    locked?: boolean
    suspended?: boolean
  } = {},
): TimeSceneContext {
  return createTimeSceneContext(
    new Date(BASE_TIME.getTime() + offsetMs),
    options.app ?? 'Visual Studio Code',
    options.idleSeconds ?? 0,
    {
      onBatteryPower: false,
      screenLocked: options.locked ?? false,
      suspended: options.suspended ?? false,
    },
  )
}

function createController(overrides: Partial<PresenceControllerOptions> = {}): {
  controller: PresenceController
  deliver: ReturnType<typeof vi.fn<(delivery: PresenceDelivery) => void>>
  decisions: PresenceDecision[]
} {
  const deliver = vi.fn<(delivery: PresenceDelivery) => void>()
  const decisions: PresenceDecision[] = []
  const controller = new PresenceController({
    mode: 'active',
    random: () => 0.5,
    interactionGraceMs: 0,
    minimumSpeechGapMs: 0,
    focusFirstMs: 1_000,
    focusLongMs: 2_000,
    returnAfterMs: 10_000,
    idleReturnAfterMs: 30_000,
    lateNightStableMs: 0,
    scenePerformanceStableMs: 1_000_000,
    idleMicroMs: 1_000_000,
    getRuntime: () => ({
      visible: true,
      dragging: false,
      clickThrough: false,
      interactionsPaused: false,
      randomVoiceEnabled: true,
      autonomyEnabled: true,
      intensity: 'balanced',
      energy: 70,
      mood: 60,
      affectionLevel: 4,
      lastInteractionAt: BASE_TIME.getTime(),
    }),
    deliver,
    onDecision: (decision) => decisions.push(decision),
    ...overrides,
  })
  return { controller, deliver, decisions }
}

function proactivePlan(overrides: Partial<AiProactivePlan> = {}): AiProactivePlan {
  return {
    should_speak: true,
    intent: 'notice',
    reply_zh: '老师，先喘口气。',
    reply_ja: '先生、少し息を整えて。',
    emotion: 'soft',
    action: 'look_at_cursor',
    memory_reference_ids: [],
    confidence: 1,
    ...overrides,
  }
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('presence controller', () => {
  it('delivers the focus milestone once per scene episode', () => {
    const { controller, deliver } = createController()

    controller.observeScene(scene(0))
    const first = controller.observeScene(scene(1_500))
    controller.observeScene(scene(1_700))

    expect(first).toMatchObject({
      kind: 'perform',
      candidate: { ruleId: 'focus-first-milestone' },
    })
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(deliver.mock.calls[0]?.[0].candidate.ruleId).toBe('focus-first-milestone')
  })

  it('routes a high-value milestone through the proactive AI planner', async () => {
    const planProactiveAi = vi.fn(async ({ context }) =>
      proactivePlan({
        memory_reference_ids: context.memories[0]?.id ? [context.memories[0].id] : [],
      }),
    )
    const { controller, deliver } = createController({
      now: () => BASE_TIME.getTime(),
      planProactiveAi,
      isProactiveAiEnabled: () => true,
    })

    controller.observeScene(scene(0))
    const decision = controller.observeScene(scene(1_500))

    expect(decision).toMatchObject({
      kind: 'perform',
      candidate: { ruleId: 'focus-first-milestone' },
    })
    expect(deliver).not.toHaveBeenCalled()
    await flushAsyncWork()

    expect(planProactiveAi).toHaveBeenCalledTimes(1)
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(deliver.mock.calls[0]?.[0]).toMatchObject({
      source: 'proactive-ai',
      candidate: {
        ruleId: 'proactive-ai:notice',
        dialogue: '老师，先喘口气。',
        spokenText: '先生、少し息を整えて。',
        ttsEmotion: 'soft',
      },
    })
    expect(controller.getDiagnostics()).toMatchObject({
      proactiveAiRequestsLastHour: 1,
      proactiveAiRequestLimit: 4,
      lastProactiveAiOutcome: 'speaking',
      lastProactiveAiIntent: 'notice',
    })
    expect(controller.getEpisodicMemories()[0]?.lastReferencedAt).toBe(scene(1_500).sampledAt)
  })

  it('does not call the proactive planner for low-priority motion', async () => {
    const planProactiveAi = vi.fn(async () => proactivePlan())
    const { controller, deliver } = createController({
      idleMicroMs: 1_000,
      getRuntime: () => ({
        visible: true,
        dragging: false,
        clickThrough: false,
        interactionsPaused: false,
        randomVoiceEnabled: true,
        autonomyEnabled: true,
        intensity: 'balanced',
        energy: 70,
        mood: 60,
        affectionLevel: 4,
        lastInteractionAt: BASE_TIME.getTime() - 120_000,
      }),
      planProactiveAi,
      isProactiveAiEnabled: () => true,
    })

    const decision = controller.observeScene(scene(0, { app: 'Google Chrome' }))
    await flushAsyncWork()

    expect(decision).toMatchObject({
      kind: 'perform',
      candidate: { ruleId: 'autonomous-walk', speech: 'none' },
    })
    expect(planProactiveAi).not.toHaveBeenCalled()
    expect(deliver.mock.calls[0]?.[0].source).toBe('local')
  })

  it('keeps quiet when the proactive planner chooses silence', async () => {
    const { controller, deliver } = createController({
      planProactiveAi: async () =>
        proactivePlan({
          should_speak: false,
          intent: 'quiet_company',
          reply_zh: undefined,
          reply_ja: undefined,
          emotion: 'calm',
          action: 'idle',
        }),
      isProactiveAiEnabled: () => true,
    })

    controller.observeScene(scene(0))
    controller.observeScene(scene(1_500))
    await flushAsyncWork()

    expect(deliver).not.toHaveBeenCalled()
    expect(controller.getDiagnostics()).toMatchObject({
      lastProactiveAiOutcome: 'silent',
      lastProactiveAiIntent: 'quiet_company',
    })
  })

  it('falls back to the local candidate when proactive planning times out', async () => {
    const { controller, deliver } = createController({
      planProactiveAi: () => new Promise<AiProactivePlan>(() => undefined),
      isProactiveAiEnabled: () => true,
      proactiveAiTimeoutMs: 5,
    })

    controller.observeScene(scene(0))
    controller.observeScene(scene(1_500))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(deliver).toHaveBeenCalledTimes(1)
    expect(deliver.mock.calls[0]?.[0]).toMatchObject({
      source: 'local',
      candidate: { ruleId: 'focus-first-milestone' },
    })
    expect(controller.getDiagnostics().lastProactiveAiOutcome).toBe('fallback')
  })

  it('discards a late proactive result after user interaction', async () => {
    let resolvePlan: ((plan: AiProactivePlan) => void) | undefined
    const planProactiveAi = vi.fn(
      () =>
        new Promise<AiProactivePlan>((resolve) => {
          resolvePlan = resolve
        }),
    )
    const { controller, deliver } = createController({
      planProactiveAi,
      isProactiveAiEnabled: () => true,
    })

    controller.observeScene(scene(0))
    controller.observeScene(scene(1_500))
    expect(planProactiveAi).toHaveBeenCalledTimes(1)

    controller.notifyInteraction({ kind: 'tap', area: 'head' })
    resolvePlan?.(proactivePlan())
    await flushAsyncWork()

    expect(deliver).not.toHaveBeenCalled()
    expect(controller.getDiagnostics().lastProactiveAiOutcome).toBe('cancelled:user')
  })

  it('discards a late proactive result after switching scenes', async () => {
    let resolvePlan: ((plan: AiProactivePlan) => void) | undefined
    const { controller, deliver } = createController({
      planProactiveAi: () =>
        new Promise<AiProactivePlan>((resolve) => {
          resolvePlan = resolve
        }),
      isProactiveAiEnabled: () => true,
    })

    controller.observeScene(scene(0))
    controller.observeScene(scene(1_500))
    controller.observeScene(scene(2_000, { app: 'Google Chrome' }))
    resolvePlan?.(proactivePlan())
    await flushAsyncWork()

    expect(deliver).not.toHaveBeenCalled()
    expect(controller.getDiagnostics().lastProactiveAiOutcome).toBe('cancelled:scene')
  })

  it('enforces the hourly proactive AI budget and uses local fallback', async () => {
    const now = BASE_TIME.getTime()
    const session = {
      ...createEmptyPresenceSession(now - 2 * 3_600_000),
      lastSeenAt: now - 2 * 3_600_000,
      lastInteractionAt: now - 2 * 3_600_000,
    }
    const planProactiveAi = vi.fn(async () => proactivePlan())
    const { controller, deliver } = createController({
      now: () => now,
      initialSession: session,
      restartReturnAfterMs: 60_000,
      restartReturnDelayMs: 0,
      planProactiveAi,
      isProactiveAiEnabled: () => true,
      maximumProactiveAiPerHour: 1,
    })

    controller.observeScene(scene(0))
    await flushAsyncWork()
    const firstDeliveryId = deliver.mock.calls[0]?.[0].deliveryId
    expect(firstDeliveryId).toBeTruthy()
    controller.handleDeliveryEvent({
      deliveryId: firstDeliveryId ?? '',
      type: 'speech_completed',
    })
    controller.observeScene(scene(1_500))

    expect(planProactiveAi).toHaveBeenCalledTimes(1)
    expect(deliver).toHaveBeenCalledTimes(2)
    expect(deliver.mock.calls.map((call) => call[0].source)).toEqual(['proactive-ai', 'local'])
    expect(controller.getDiagnostics()).toMatchObject({
      proactiveAiRequestsLastHour: 1,
      lastProactiveAiOutcome: 'budget_exhausted',
    })
  })

  it('does not call the proactive planner while the feature is disabled', async () => {
    const planProactiveAi = vi.fn(async () => proactivePlan())
    const { controller, deliver } = createController({
      planProactiveAi,
      isProactiveAiEnabled: () => false,
    })

    controller.observeScene(scene(0))
    controller.observeScene(scene(1_500))
    await flushAsyncWork()

    expect(planProactiveAi).not.toHaveBeenCalled()
    expect(deliver.mock.calls[0]?.[0].source).toBe('local')
  })

  it('silences autonomous behavior while leaving the controller observable', () => {
    const { controller, deliver } = createController({
      getRuntime: () => ({
        visible: true,
        dragging: false,
        clickThrough: false,
        interactionsPaused: false,
        randomVoiceEnabled: true,
        autonomyEnabled: false,
        intensity: 'balanced',
        energy: 70,
        mood: 60,
        affectionLevel: 4,
        lastInteractionAt: BASE_TIME.getTime(),
      }),
    })

    const decision = controller.observeScene(scene(0))

    expect(decision).toMatchObject({
      kind: 'silent',
      reason: '主动行为已关闭',
    })
    expect(deliver).not.toHaveBeenCalled()
    expect(controller.getTelemetry()).toMatchObject({
      sceneSamples: 1,
      decisions: 1,
      silentDecisions: 1,
      performed: 0,
    })
  })

  it('applies quiet, balanced and lively proactive budgets', () => {
    const limits = (['quiet', 'balanced', 'lively'] as const).map((intensity) => {
      const controller = createController({
        getRuntime: () => ({
          visible: true,
          dragging: false,
          clickThrough: false,
          interactionsPaused: false,
          randomVoiceEnabled: true,
          autonomyEnabled: true,
          intensity,
          energy: 70,
          mood: 60,
          affectionLevel: 4,
          lastInteractionAt: BASE_TIME.getTime(),
        }),
      }).controller
      return controller.getDiagnostics().proactiveAiRequestLimit
    })

    expect(limits).toEqual([2, 4, 6])
  })

  it('records bounded runtime telemetry for decisions and delivered rules', () => {
    const { controller } = createController()
    controller.observeScene(scene(0))
    controller.observeScene(scene(1_500))

    expect(controller.getTelemetry()).toMatchObject({
      sceneSamples: 2,
      decisions: 2,
      performed: 1,
      speeches: 1,
      rules: {
        'focus-first-milestone': 1,
      },
    })
  })

  it('uses shadow mode for decisions without delivering commands', () => {
    const { controller, deliver, decisions } = createController({ mode: 'shadow' })

    controller.observeScene(scene(0))
    controller.observeScene(scene(1_500))

    expect(decisions.at(-1)).toMatchObject({
      kind: 'perform',
      candidate: { ruleId: 'focus-first-milestone' },
    })
    expect(deliver).not.toHaveBeenCalled()
    expect(controller.getDiagnostics()).toMatchObject({
      mode: 'shadow',
      deliveredCount: 0,
      lastRuleId: 'focus-first-milestone',
    })
  })

  it('does not let legacy mode execute a new behavior', () => {
    const { controller, deliver } = createController({ mode: 'legacy' })

    controller.observeScene(scene(0))
    const decision = controller.observeScene(scene(1_500))

    expect(decision).toMatchObject({ kind: 'silent', reason: 'legacy 模式只保留旧调度器' })
    expect(deliver).not.toHaveBeenCalled()
  })

  it('keeps low-frequency autonomous walking in non-focus scenes', () => {
    const { controller, deliver } = createController({
      idleMicroMs: 60_000,
      getRuntime: () => ({
        visible: true,
        dragging: false,
        clickThrough: false,
        interactionsPaused: false,
        randomVoiceEnabled: true,
        autonomyEnabled: true,
        intensity: 'balanced',
        energy: 70,
        mood: 60,
        affectionLevel: 4,
        lastInteractionAt: BASE_TIME.getTime() - 120_000,
      }),
    })

    const decision = controller.observeScene(scene(0, { app: 'Google Chrome' }))

    expect(decision).toMatchObject({
      kind: 'perform',
      candidate: { ruleId: 'autonomous-walk', speech: 'none' },
    })
    expect(deliver.mock.calls[0]?.[0].candidate.ruleId).toBe('autonomous-walk')
  })

  it('tracks repeated head interactions through the emotion engine', () => {
    let now = BASE_TIME.getTime()
    const onEmotionChanged = vi.fn()
    const { controller } = createController({
      now: () => now,
      onEmotionChanged,
    })
    controller.observeScene(scene(0))
    const initial = controller.getEmotionState()
    expect(initial).not.toBeNull()

    for (let index = 0; index < 3; index += 1) {
      now += 1_000
      controller.notifyInteraction({ kind: 'tap', area: 'head' })
    }
    const updated = controller.getEmotionState()

    expect(updated?.patience).toBeLessThan(initial?.patience ?? 0)
    expect(updated?.causes.some((cause) => cause.source === 'tap:head')).toBe(true)
    expect(onEmotionChanged).toHaveBeenCalled()
  })

  it('does not expose or persist emotion state when emotion is disabled', () => {
    const onEmotionChanged = vi.fn()
    const { controller, deliver } = createController({
      emotionEnabled: false,
      onEmotionChanged,
    })

    controller.observeScene(scene(0))
    controller.observeScene(scene(1_500))

    expect(controller.getEmotionState()).toBeNull()
    expect(controller.getEmotionVoice()).toBeNull()
    expect(onEmotionChanged).not.toHaveBeenCalled()
    expect(deliver.mock.calls[0]?.[0].voiceEmotion).toBeNull()
  })

  it('creates structured episodic memory from a long-focus milestone', () => {
    const onMemoryChanged = vi.fn()
    const { controller } = createController({ onMemoryChanged })

    controller.observeScene(scene(0))
    controller.observeScene(scene(2_500))

    expect(controller.getEpisodicMemories()).toEqual([
      expect.objectContaining({
        kind: 'long_focus',
        tags: ['focus', 'rest'],
      }),
    ])
    expect(onMemoryChanged).toHaveBeenCalled()
  })

  it('creates a permanent relationship memory when affection level rises', () => {
    let affectionLevel = 3
    const { controller } = createController({
      getRuntime: () => ({
        visible: true,
        dragging: false,
        clickThrough: false,
        interactionsPaused: false,
        randomVoiceEnabled: true,
        autonomyEnabled: true,
        intensity: 'balanced',
        energy: 70,
        mood: 60,
        affectionLevel,
        lastInteractionAt: BASE_TIME.getTime(),
      }),
    })
    controller.observeScene(scene(0))
    affectionLevel = 4
    controller.observeScene(scene(100))

    expect(controller.getEpisodicMemories()).toEqual([
      expect.objectContaining({
        kind: 'relationship_milestone',
        expiresAt: null,
        summary: '与老师的关系达到了好感等级 4',
      }),
    ])
  })

  it('does not create episodic memory while continuous memory is disabled', () => {
    const onMemoryChanged = vi.fn()
    const { controller } = createController({
      memoryEnabled: false,
      onMemoryChanged,
    })

    controller.observeScene(scene(0))
    controller.observeScene(scene(2_500))

    expect(controller.getEpisodicMemories()).toEqual([])
    expect(onMemoryChanged).not.toHaveBeenCalled()
  })

  it('deletes and clears structured memories through the controller API', () => {
    const { controller } = createController()
    controller.observeScene(scene(0))
    controller.observeScene(scene(2_500))
    const memory = controller.getEpisodicMemories()[0]
    expect(memory).toBeTruthy()

    expect(controller.deleteEpisodicMemory(memory?.id ?? '')).toEqual([])

    const second = createController().controller
    second.observeScene(scene(0))
    second.observeScene(scene(2_500))
    expect(second.getEpisodicMemories().length).toBeGreaterThan(0)
    second.clearEpisodicMemories()
    expect(second.getEpisodicMemories()).toEqual([])
  })

  it('creates one return greeting after lock or sleep', () => {
    const { controller, deliver } = createController()

    controller.observeScene(scene(0, { locked: true }))
    const decision = controller.observeScene(scene(15_000))
    controller.observeScene(scene(20_000))

    expect(decision).toMatchObject({
      kind: 'perform',
      candidate: { ruleId: 'return-greeting' },
    })
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(controller.getDiagnostics().lastReturnAwayMs).toBeGreaterThanOrEqual(10_000)
  })

  it('creates a restart return from persisted last-seen time', () => {
    const now = BASE_TIME.getTime() + 3 * 3_600_000
    const session = {
      ...createEmptyPresenceSession(now - 2 * 3_600_000),
      lastSeenAt: now - 2 * 3_600_000,
      lastInteractionAt: now - 2 * 3_600_000,
    }
    const { controller, deliver } = createController({
      now: () => now,
      initialSession: session,
      restartReturnAfterMs: 60_000,
      restartReturnDelayMs: 0,
    })

    const decision = controller.observeScene(scene(3 * 3_600_000))

    expect(decision).toMatchObject({
      kind: 'perform',
      candidate: { ruleId: 'return-greeting' },
    })
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(controller.getDiagnostics().lastReturnAwayMs).toBeGreaterThanOrEqual(2 * 3_600_000)
  })

  it('suppresses a repeated proactive line across controller restarts', () => {
    const { controller: first } = createController({ mode: 'active' })
    first.observeScene(scene(0))
    first.observeScene(scene(1_500))
    const persisted = first.getSessionState()
    expect(persisted.recentDialogues).toHaveLength(1)

    const { controller: second, decisions } = createController({
      mode: 'active',
      initialSession: persisted,
      now: () => BASE_TIME.getTime() + 5_000,
      returnAfterMs: 60_000,
    })
    second.observeScene(scene(5_000))
    second.observeScene(scene(6_500))

    expect(
      decisions.some(
        (decision) =>
          decision.kind === 'perform' && decision.candidate.ruleId === 'focus-first-milestone',
      ),
    ).toBe(false)
  })

  it('uses persisted tag cooldown even when candidate text differs', () => {
    const session = createEmptyPresenceSession(BASE_TIME.getTime() - 1_000)
    session.tagLastUsedAt.focus = BASE_TIME.getTime() - 1_000
    const { controller, decisions } = createController({
      initialSession: session,
      tagCooldownMs: { focus: 60_000 },
    })

    controller.observeScene(scene(0))
    controller.observeScene(scene(1_500))

    expect(decisions.some((decision) => decision.kind === 'perform')).toBe(false)
  })

  it('ignores persisted memory when continuous memory is disabled', () => {
    const session = createEmptyPresenceSession(BASE_TIME.getTime() - 2 * 3_600_000)
    session.lastSeenAt = BASE_TIME.getTime() - 2 * 3_600_000
    session.tagLastUsedAt.focus = BASE_TIME.getTime() - 1_000
    const { controller, deliver } = createController({
      memoryEnabled: false,
      initialSession: session,
      restartReturnAfterMs: 60_000,
      restartReturnDelayMs: 0,
    })

    controller.observeScene(scene(0))
    const decision = controller.observeScene(scene(1_500))

    expect(decision).toMatchObject({
      kind: 'perform',
      candidate: { ruleId: 'focus-first-milestone' },
    })
    expect(controller.getSessionState().recentDialogues).toEqual([])
    expect(deliver).toHaveBeenCalled()
  })

  it('waits for speech to finish before delivering a pending milestone', () => {
    const { controller, deliver } = createController()

    controller.observeScene(scene(0))
    controller.handleDeliveryScheduled('delivery-1')
    expect(controller.observeScene(scene(1_500))).toMatchObject({
      kind: 'silent',
      reason: '没有通过冷却、预算或运行时过滤的候选',
    })

    controller.handleDeliveryEvent({
      deliveryId: 'delivery-1',
      type: 'speech_completed',
    })
    expect(controller.observeScene(scene(1_700))).toMatchObject({
      kind: 'perform',
      candidate: { ruleId: 'focus-first-milestone' },
    })
    expect(deliver).toHaveBeenCalledTimes(1)
  })

  it('ignores a late delivery event from an older speech request', () => {
    const { controller } = createController()
    const staleEvent: DeliveryLifecycleEvent = {
      deliveryId: 'old-delivery',
      type: 'speech_completed',
    }

    controller.handleDeliveryScheduled('new-delivery')
    controller.handleDeliveryEvent({
      deliveryId: 'new-delivery',
      type: 'speech_started',
    })

    expect(controller.handleDeliveryEvent(staleEvent)).toBe(false)
    expect(controller.getDiagnostics()).toMatchObject({
      speechState: 'speaking',
      activeDeliveryId: 'new-delivery',
    })
  })

  it('tracks action and recovery lifecycle events with token isolation', () => {
    const { controller } = createController()

    controller.handlePerformanceScheduled('performance-1')
    expect(controller.getDiagnostics()).toMatchObject({
      performanceState: 'preparing',
      activePerformanceToken: 'performance-1',
      lastPerformanceEvent: 'action_prepared',
    })

    expect(
      controller.handlePerformanceEvent({
        performanceToken: 'performance-1',
        type: 'action_started',
        durationMs: 1_200,
      }),
    ).toBe(true)
    expect(controller.getDiagnostics().performanceState).toBe('performing')

    controller.handlePerformanceEvent({
      performanceToken: 'performance-1',
      type: 'action_completed',
      durationMs: 1_200,
    })
    expect(controller.getDiagnostics().performanceState).toBe('recovering')

    expect(
      controller.handlePerformanceEvent({
        performanceToken: 'stale-performance',
        type: 'recovery_completed',
      }),
    ).toBe(false)
    expect(controller.getDiagnostics()).toMatchObject({
      performanceState: 'recovering',
      activePerformanceToken: 'performance-1',
    })

    controller.handlePerformanceEvent({
      performanceToken: 'performance-1',
      type: 'recovery_completed',
    })
    expect(controller.getDiagnostics()).toMatchObject({
      performanceState: 'idle',
      activePerformanceToken: null,
      lastPerformanceEvent: 'recovery_completed',
    })
  })

  it('allows overlay micro motion while speech remains active', () => {
    const { controller, deliver } = createController({
      idleMicroMs: 60_000,
      getRuntime: () => ({
        visible: true,
        dragging: false,
        clickThrough: false,
        interactionsPaused: false,
        randomVoiceEnabled: true,
        autonomyEnabled: true,
        intensity: 'balanced',
        energy: 70,
        mood: 60,
        affectionLevel: 4,
        lastInteractionAt: BASE_TIME.getTime() - 120_000,
      }),
    })
    controller.handleDeliveryScheduled('active-speech')

    const decision = controller.observeScene(scene(0, { app: 'Google Chrome' }))

    expect(decision).toMatchObject({
      kind: 'perform',
      candidate: {
        ruleId: 'idle-micro-motion',
        speech: 'none',
        bodyPolicy: 'overlay',
        canRunWhileSpeaking: true,
        microMotion: 'gaze_breath',
      },
    })
    expect(deliver.mock.calls[0]?.[0].candidate.microMotion).toBe('gaze_breath')
  })

  it('does not repeat the same idle full clip within five minutes', () => {
    const idleClip: PresenceCandidate = {
      ruleId: 'scene-comment-idle-clip',
      priority: 25,
      cooldownKey: 'scene-comment-idle-clip',
      cooldownMs: 0,
      speech: 'none',
      bodyPolicy: 'replace',
      canRunWhileSpeaking: false,
      action: 'look_at_cursor',
      modelClip: 'Cafe_Idle',
      reason: '测试待机 clip',
      tags: ['scene_comment'],
    }
    const { controller, deliver } = createController({
      getScenePerformance: () => idleClip,
      idleMicroMs: 1_000_000,
      scenePerformanceStableMs: 0,
    })

    controller.observeScene(scene(0))
    controller.observeScene(scene(500))

    expect(deliver).toHaveBeenCalledTimes(1)
    expect(controller.getDiagnostics().lastDecisionReason).toBe(
      '没有通过冷却、预算或运行时过滤的候选',
    )
  })
})

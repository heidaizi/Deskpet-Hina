import { describe, expect, it } from 'vitest'
import type {
  PresenceCandidate,
  PresenceContextV1,
  PresenceDecision,
} from '../../src/shared/presence'
import { arbitratePresence } from '../../src/main/presence/presence-arbiter'

function context(overrides: Partial<PresenceContextV1['runtime']> = {}): PresenceContextV1 {
  return {
    now: 100_000,
    scene: {
      sampledAt: 100_000,
      localDate: '2026-10-25',
      localTime: '15:00',
      timePeriod: 'afternoon',
      weekday: 0,
      isWeekend: true,
      foregroundApp: 'Visual Studio Code',
      scene: 'development',
      systemIdleSeconds: 0,
      onBatteryPower: false,
      screenLocked: false,
      suspended: false,
    },
    pet: {
      mood: 60,
      energy: 70,
      affectionLevel: 4,
    },
    runtime: {
      visible: true,
      dragging: false,
      clickThrough: false,
      interactionsPaused: false,
      randomVoiceEnabled: true,
      autonomyEnabled: true,
      intensity: 'balanced',
      speechState: 'idle',
      performanceState: 'idle',
      lastInteractionAt: 0,
      ...overrides,
    },
  }
}

function candidate(overrides: Partial<PresenceCandidate> = {}): PresenceCandidate {
  return {
    ruleId: 'test-rule',
    priority: 10,
    cooldownKey: 'test-rule',
    cooldownMs: 10_000,
    speech: 'optional',
    bodyPolicy: 'replace',
    canRunWhileSpeaking: false,
    dialogue: '测试',
    reason: 'test',
    tags: ['scene_comment'],
    ...overrides,
  }
}

function expectPerform(decision: PresenceDecision): Extract<PresenceDecision, { kind: 'perform' }> {
  expect(decision.kind).toBe('perform')
  return decision as Extract<PresenceDecision, { kind: 'perform' }>
}

describe('presence arbiter', () => {
  it('selects the higher-priority candidate', () => {
    const decision = expectPerform(
      arbitratePresence(
        [
          candidate({ ruleId: 'low', cooldownKey: 'low', priority: 10 }),
          candidate({ ruleId: 'high', cooldownKey: 'high', priority: 40 }),
        ],
        context(),
        { lastRuleUse: {}, lastSpeechAt: Number.NEGATIVE_INFINITY, speechEvents: [] },
        { random: () => 0.5 },
      ),
    )

    expect(decision.candidate.ruleId).toBe('high')
  })

  it('blocks replacement actions while speech is active', () => {
    const decision = arbitratePresence(
      [candidate()],
      context({ speechState: 'speaking' }),
      { lastRuleUse: {}, lastSpeechAt: Number.NEGATIVE_INFINITY, speechEvents: [] },
      { random: () => 0 },
    )

    expect(decision).toMatchObject({
      kind: 'silent',
      reason: '没有通过冷却、预算或运行时过滤的候选',
    })
  })

  it('allows overlay micro motions while speech is active', () => {
    const decision = expectPerform(
      arbitratePresence(
        [
          candidate({
            speech: 'none',
            bodyPolicy: 'overlay',
            canRunWhileSpeaking: true,
            dialogue: undefined,
          }),
        ],
        context({ speechState: 'speaking' }),
        { lastRuleUse: {}, lastSpeechAt: Number.NEGATIVE_INFINITY, speechEvents: [] },
        { random: () => 0 },
      ),
    )

    expect(decision.candidate.bodyPolicy).toBe('overlay')
  })

  it('suppresses proactive speech when random voice is disabled', () => {
    const decision = arbitratePresence(
      [candidate()],
      context({ randomVoiceEnabled: false }),
      { lastRuleUse: {}, lastSpeechAt: Number.NEGATIVE_INFINITY, speechEvents: [] },
      { random: () => 0 },
    )

    expect(decision.kind).toBe('silent')
  })

  it('respects rule cooldown and the global speech gap', () => {
    const cooledDown = arbitratePresence(
      [candidate({ cooldownMs: 20_000 })],
      context(),
      {
        lastRuleUse: { 'test-rule': 90_000 },
        lastSpeechAt: Number.NEGATIVE_INFINITY,
        speechEvents: [],
      },
      { random: () => 0 },
    )
    const speechTooRecent = arbitratePresence(
      [candidate()],
      context(),
      { lastRuleUse: {}, lastSpeechAt: 99_000, speechEvents: [] },
      { random: () => 0, minimumSpeechGapMs: 45_000 },
    )

    expect(cooledDown.kind).toBe('silent')
    expect(speechTooRecent.kind).toBe('silent')
  })

  it('enforces the hourly proactive speech budget', () => {
    const decision = arbitratePresence(
      [candidate()],
      context(),
      {
        lastRuleUse: {},
        lastSpeechAt: 99_000,
        speechEvents: [
          { at: 50_000, priority: 25 },
          { at: 55_000, priority: 25 },
          { at: 60_000, priority: 25 },
          { at: 65_000, priority: 25 },
          { at: 70_000, priority: 25 },
          { at: 75_000, priority: 25 },
        ],
      },
      {
        random: () => 0,
        minimumSpeechGapMs: 0,
        maximumSpeechPerHour: 6,
      },
    )

    expect(decision.kind).toBe('silent')
  })

  it('enforces interaction grace and hard runtime silence', () => {
    const recentInteraction = arbitratePresence(
      [candidate()],
      context({ lastInteractionAt: 90_000 }),
      { lastRuleUse: {}, lastSpeechAt: Number.NEGATIVE_INFINITY, speechEvents: [] },
      { random: () => 0, minimumInteractionGraceMs: 30_000 },
    )
    const dragging = arbitratePresence(
      [candidate()],
      context({ dragging: true }),
      { lastRuleUse: {}, lastSpeechAt: Number.NEGATIVE_INFINITY, speechEvents: [] },
      { random: () => 0 },
    )

    expect(recentInteraction.kind).toBe('silent')
    expect(dragging).toMatchObject({ kind: 'silent', reason: '正在拖拽' })
  })
})

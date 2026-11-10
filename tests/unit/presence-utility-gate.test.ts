import { describe, expect, it } from 'vitest'
import { arbitratePresence } from '../../src/main/presence/presence-arbiter'
import type { PresenceCandidate } from '../../src/shared/presence'

const baseContext = {
  now: 1_000_000,
  scene: {
    sampledAt: 1_000_000,
    localDate: '2026-11-04',
    localTime: '15:00:00',
    timePeriod: 'afternoon',
    weekday: 3,
    isWeekend: false,
    foregroundApp: 'Visual Studio Code',
    scene: 'development',
    systemIdleSeconds: 0,
    onBatteryPower: false,
    screenLocked: false,
    suspended: false,
  },
  pet: { mood: 60, energy: 80, affectionLevel: 4 },
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
    lastInteractionAt: 900_000,
  },
  emotion: null,
  relationship: null,
} as never

function candidate(ruleId: string, priority: number): PresenceCandidate {
  return {
    ruleId,
    priority,
    cooldownKey: ruleId,
    cooldownMs: 0,
    speech: 'required',
    bodyPolicy: 'overlay',
    canRunWhileSpeaking: false,
    dialogue: '测试',
    reason: 'test',
    tags: [],
  } as PresenceCandidate
}

const state = { lastRuleUse: {}, lastSpeechAt: 0, speechEvents: [] }

describe('utility gating in arbitration', () => {
  it('keeps the legacy behaviour when no utility scorer is provided', () => {
    const decision = arbitratePresence(
      [candidate('a', 50), candidate('b', 80)],
      baseContext,
      state,
      {
        minimumInteractionGraceMs: 0,
        random: () => 0,
      },
    )
    if (decision.kind !== 'perform') throw new Error('expected a perform decision')
    expect(decision.candidate.ruleId).toBe('b')
  })

  it('drops candidates below the utility threshold', () => {
    const decision = arbitratePresence(
      [candidate('a', 50), candidate('b', 80)],
      baseContext,
      state,
      {
        minimumInteractionGraceMs: 0,
        random: () => 0,
        utility: (item) => ({ score: item.ruleId === 'a' ? 0.7 : 0.2, threshold: 0.5 }),
      },
    )
    if (decision.kind !== 'perform') throw new Error('expected a perform decision')
    expect(decision.candidate.ruleId).toBe('a')
  })

  it('stays silent when every candidate is below the threshold', () => {
    const decision = arbitratePresence([candidate('a', 50)], baseContext, state, {
      minimumInteractionGraceMs: 0,
      random: () => 0,
      utility: () => ({ score: 0.1, threshold: 0.5 }),
    })
    expect(decision.kind).toBe('silent')
  })
})

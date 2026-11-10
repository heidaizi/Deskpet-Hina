import { describe, expect, it } from 'vitest'
import { decideManners } from '../../src/main/presence/manners'
import type { FeedbackEvent } from '../../src/main/domain/memory/feedback-store'

const now = new Date('2026-11-09T15:00:00+08:00').getTime()
const event = (kind: FeedbackEvent['kind'], at: number): FeedbackEvent => ({
  id: String(at),
  at,
  ruleId: 'test',
  scene: 'coding',
  kind,
  latencyMs: 1000,
})

function base(overrides: Partial<Parameters<typeof decideManners>[0]> = {}) {
  return {
    now,
    priority: 10,
    lastInteractionAt: now - 60 * 60 * 1000,
    recentEvents: [],
    focusPressure: 0.2,
    ...overrides,
  }
}

describe('presence manners', () => {
  it('allows a calm moment', () => {
    expect(decideManners(base()).suppress).toBe(false)
  })

  it('stays quiet right after an interaction', () => {
    expect(decideManners(base({ lastInteractionAt: now - 30_000 })).reason).toBe('just-interacted')
  })

  it('backs off after four consecutive ignores', () => {
    const events = [
      event('ignored', now - 1000),
      event('ignored', now - 2000),
      event('ignored', now - 3000),
      event('ignored', now - 4000),
    ]
    const decision = decideManners(base({ recentEvents: events }))
    expect(decision.suppress).toBe(true)
    expect(decision.reason).toBe('ignored-streak')
  })

  it('resets the streak after engagement', () => {
    const events = [
      event('ignored', now - 1000),
      event('ignored', now - 2000),
      event('engaged', now - 3000),
    ]
    expect(decideManners(base({ recentEvents: events })).suppress).toBe(false)
  })

  it('suppresses autonomous lines in the small hours', () => {
    const night = new Date('2026-11-10T01:00:00+08:00').getTime()
    expect(decideManners(base({ now: night })).reason).toBe('night')
  })

  it('suppresses when the user is deeply focused', () => {
    expect(decideManners(base({ focusPressure: 0.9 })).reason).toBe('focus')
  })

  it('never blocks interactive candidates', () => {
    expect(decideManners(base({ priority: 100, focusPressure: 0.95 })).suppress).toBe(false)
  })
})

describe('long silence', () => {
  it('lowers the bar to greet after a long quiet period', () => {
    const decision = decideManners(base({ lastInteractionAt: now - 90 * 60 * 1000 }))
    expect(decision.suppress).toBe(false)
    expect(decision.thresholdBoost).toBeLessThan(0)
  })
})

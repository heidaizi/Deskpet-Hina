import { describe, expect, it } from 'vitest'
import {
  computeFocusPressure,
  computeLateNightPenalty,
  computeRecentDisturbance,
  computeThreshold,
  scoreCandidate,
  type UtilityInput,
} from '../../src/main/presence/utility'

const base: UtilityInput = {
  priority: 60,
  sceneFit: 0.6,
  memoryHit: 0,
  affectionLevel: 4,
  focusPressure: 0,
  recentDisturbance: 0,
  lateNightPenalty: 0,
  repeatPressure: 0,
  cooldownPressure: 0,
}

describe('candidate utility', () => {
  it('rewards priority, scene fit, memory hit and relationship', () => {
    const low = scoreCandidate({ ...base, priority: 20 })
    const high = scoreCandidate({ ...base, priority: 90 })
    expect(high).toBeGreaterThan(low)

    const withMemory = scoreCandidate({ ...base, memoryHit: 1 })
    expect(withMemory).toBeGreaterThan(scoreCandidate(base))

    const close = scoreCandidate({ ...base, affectionLevel: 8 })
    expect(close).toBeGreaterThan(scoreCandidate({ ...base, affectionLevel: 1 }))
  })

  it('penalises focus, disturbance and late night', () => {
    const focused = scoreCandidate({ ...base, focusPressure: 1 })
    expect(focused).toBeLessThan(scoreCandidate(base))

    const disturbed = scoreCandidate({ ...base, recentDisturbance: 1 })
    expect(disturbed).toBeLessThan(scoreCandidate(base))

    const late = scoreCandidate({ ...base, lateNightPenalty: 1 })
    expect(late).toBeLessThan(scoreCandidate(base))
  })

  it('penalises repetition and cooldown more than a fresh rule', () => {
    const fresh = scoreCandidate(base)
    const repeated = scoreCandidate({ ...base, repeatPressure: 1, cooldownPressure: 1 })
    expect(fresh - repeated).toBeCloseTo(1)
  })

  it('clamps out-of-range inputs instead of exploding', () => {
    const clamped = scoreCandidate({
      ...base,
      priority: 9_999,
      memoryHit: 5,
      affectionLevel: 99,
      focusPressure: -3,
    })
    expect(Number.isFinite(clamped)).toBe(true)
    expect(clamped).toBeLessThanOrEqual(1)
  })
})

describe('threshold', () => {
  it('rises with focus pressure and recent disturbance', () => {
    const relaxed = computeThreshold(0, 0)
    expect(relaxed).toBeCloseTo(0.42)
    expect(computeThreshold(1, 0)).toBeCloseTo(0.67)
    expect(computeThreshold(0, 1)).toBeCloseTo(0.57)
  })
})

describe('late night penalty', () => {
  it('is full at night and decays during the evening ramp', () => {
    expect(computeLateNightPenalty(new Date(2026, 10, 4, 2, 0))).toBe(1)
    expect(computeLateNightPenalty(new Date(2026, 10, 4, 23, 30))).toBe(1)
    expect(computeLateNightPenalty(new Date(2026, 10, 4, 14, 0))).toBe(0)
    expect(computeLateNightPenalty(new Date(2026, 10, 4, 22, 0))).toBeCloseTo(0.5)
  })
})

describe('focus pressure', () => {
  it('grows with focus minutes and interaction density', () => {
    const idle = computeFocusPressure({ focusMinutes: 0, interactionDensity: 0, scene: 'other' })
    const deep = computeFocusPressure({
      focusMinutes: 60,
      interactionDensity: 10,
      scene: 'development',
    })
    expect(idle).toBe(0)
    expect(deep).toBeCloseTo(1)
  })

  it('weights the scene category', () => {
    const dev = computeFocusPressure({
      focusMinutes: 0,
      interactionDensity: 0,
      scene: 'development',
    })
    expect(dev).toBeCloseTo(0.2)
  })
})

describe('recent disturbance', () => {
  it('treats interruptions as negative and engagement as positive', () => {
    const now = 1_000_000
    expect(computeRecentDisturbance([{ at: now, kind: 'interrupted' }], now)).toBeCloseTo(0.8)
    expect(computeRecentDisturbance([{ at: now, kind: 'engaged' }], now)).toBe(0)
    expect(computeRecentDisturbance([], now)).toBe(0)
  })

  it('decays older events', () => {
    const now = 10_000_000
    const recent = computeRecentDisturbance([{ at: now - 60_000, kind: 'interrupted' }], now)
    const old = computeRecentDisturbance([{ at: now - 6 * 3_600_000, kind: 'ignored' }], now)
    expect(recent).toBeGreaterThan(old)
  })
})

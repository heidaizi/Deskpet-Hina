import { beforeEach, describe, expect, it } from 'vitest'
import {
  DECISION_PRIORITY,
  getActiveLease,
  observeDecision,
  releaseDecision,
  requestDecision,
  resetDecisionBus,
} from '../../src/main/behavior/decision-bus'

describe('decision bus arbitration', () => {
  beforeEach(() => {
    resetDecisionBus()
  })

  it('lets user interaction preempt every ambient source', () => {
    expect(requestDecision({ source: 'presence', now: 1000 }).granted).toBe(true)
    const interaction = requestDecision({ source: 'interaction', now: 1100 })
    expect(interaction.granted).toBe(true)
    expect(getActiveLease(1100)?.source).toBe('interaction')
  })

  it('blocks a lower priority source while a higher one holds the lease', () => {
    requestDecision({ source: 'presence', now: 1000, leaseMs: 5_000 })
    const scene = requestDecision({ source: 'scene', now: 1200 })
    expect(scene.granted).toBe(false)
    expect(scene.blockedBy?.source).toBe('presence')
  })

  it('allows a higher priority ambient source to preempt a lower one', () => {
    requestDecision({ source: 'autonomous', now: 1000, leaseMs: 5_000 })
    const presence = requestDecision({ source: 'presence', now: 1200 })
    expect(presence.granted).toBe(true)
    expect(getActiveLease(1200)?.source).toBe('presence')
  })

  it('renews instead of blocking the same source', () => {
    requestDecision({ source: 'presence', now: 1000, leaseMs: 1_000 })
    const renewed = requestDecision({ source: 'presence', now: 1_500, leaseMs: 1_000 })
    expect(renewed.granted).toBe(true)
    expect(getActiveLease(1_900)?.source).toBe('presence')
  })

  it('lets presence answer an interaction even though interaction is highest', () => {
    requestDecision({ source: 'interaction', now: 1000, leaseMs: 10_000 })
    const presence = requestDecision({ source: 'presence', now: 1100 })
    expect(presence.granted).toBe(true)
  })

  it('still blocks non-reactive ambient behaviours right after an interaction', () => {
    requestDecision({ source: 'interaction', now: 1000, leaseMs: 10_000 })
    expect(requestDecision({ source: 'autonomous', now: 1100 }).granted).toBe(false)
    expect(requestDecision({ source: 'scene', now: 1100 }).granted).toBe(false)
  })

  it('expires stale leases automatically', () => {
    requestDecision({ source: 'presence', now: 1000, leaseMs: 1_000 })
    expect(getActiveLease(1_500)?.source).toBe('presence')
    expect(getActiveLease(2_100)).toBeNull()
    expect(requestDecision({ source: 'autonomous', now: 2_100 }).granted).toBe(true)
  })

  it('releases only the matching source', () => {
    requestDecision({ source: 'presence', now: 1000 })
    releaseDecision('scene')
    expect(getActiveLease(1000)?.source).toBe('presence')
    releaseDecision('presence')
    expect(getActiveLease(1000)).toBeNull()
  })

  it('records a presence performance without gating on the bus', () => {
    requestDecision({ source: 'interaction', now: 1000, leaseMs: 10_000 })
    // Presence 走 observeDecision：不经过准入，直接记账。
    observeDecision({
      source: 'presence',
      reason: 'scene-companion:cafe',
      now: 1100,
      leaseMs: 5_000,
    })
    expect(getActiveLease(1100)?.source).toBe('presence')
    expect(getActiveLease(1100)?.reason).toBe('scene-companion:cafe')
    releaseDecision('presence')
    expect(getActiveLease(1100)).toBeNull()
  })

  it('keeps the documented priority ordering', () => {
    expect(DECISION_PRIORITY.interaction).toBeGreaterThan(DECISION_PRIORITY.presence)
    expect(DECISION_PRIORITY.presence).toBeGreaterThan(DECISION_PRIORITY.scene)
    expect(DECISION_PRIORITY.scene).toBeGreaterThan(DECISION_PRIORITY.autonomous)
  })
})

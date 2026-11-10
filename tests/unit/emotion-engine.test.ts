import { describe, expect, it } from 'vitest'
import type { PresenceCandidate } from '../../src/shared/presence'
import { createTimeSceneContext } from '../../src/shared/time-scene'
import {
  advanceEmotion,
  applyInteractionEmotion,
  applyPresenceEmotion,
  createDefaultEmotionState,
  getEmotionScoreAdjustment,
  getRelationshipProfile,
  getVoiceEmotion,
  getVoicePerformanceStyle,
  normalizeEmotionState,
} from '../../src/main/presence/emotion-engine'

const BASE_TIME = new Date('2026-10-25T15:00:00+08:00').getTime()

function scene(offsetMs = 0, app = 'Visual Studio Code') {
  return createTimeSceneContext(new Date(BASE_TIME + offsetMs), app, 0, {
    onBatteryPower: false,
    screenLocked: false,
    suspended: false,
  })
}

function candidate(overrides: Partial<PresenceCandidate> = {}): PresenceCandidate {
  return {
    ruleId: 'scene-companion:test',
    priority: 25,
    cooldownKey: 'scene-companion:test',
    cooldownMs: 0,
    speech: 'optional',
    bodyPolicy: 'replace',
    canRunWhileSpeaking: false,
    dialogue: '测试',
    reason: '测试',
    tags: ['scene_comment'],
    ...overrides,
  }
}

describe('emotion engine', () => {
  it('creates a bounded, explainable initial emotion state', () => {
    const emotion = createDefaultEmotionState(BASE_TIME, 42, 55, 4)

    expect(emotion).toMatchObject({
      schemaVersion: 1,
      fatigue: 58,
      dominant: 'calm',
    })
    expect(Object.values(emotion).filter((value) => typeof value === 'number')).toBeTruthy()
    expect(emotion.valence).toBeGreaterThanOrEqual(0)
    expect(emotion.socialBattery).toBeLessThanOrEqual(100)
  })

  it('reduces patience after repeated head taps without changing affection', () => {
    let emotion = createDefaultEmotionState(BASE_TIME, 78, 62, 4)
    const initialPatience = emotion.patience

    for (let index = 0; index < 3; index += 1) {
      emotion = applyInteractionEmotion(emotion, {
        now: BASE_TIME + index * 1_000,
        scene: scene(index * 1_000),
        energy: 78,
        mood: 62,
        affectionLevel: 4,
        kind: 'tap',
        area: 'head',
      })
    }

    expect(emotion.patience).toBeLessThan(initialPatience)
    expect(emotion.causes.filter((cause) => cause.source === 'tap:head')).toHaveLength(3)
    expect(emotion).not.toHaveProperty('affectionXp')
  })

  it('makes high affection less sensitive to the same negative interaction', () => {
    const low = applyInteractionEmotion(createDefaultEmotionState(BASE_TIME, 78, 62, 1), {
      now: BASE_TIME,
      scene: scene(),
      energy: 78,
      mood: 62,
      affectionLevel: 1,
      kind: 'tap',
      area: 'halo',
    })
    const high = applyInteractionEmotion(createDefaultEmotionState(BASE_TIME, 78, 62, 8), {
      now: BASE_TIME,
      scene: scene(),
      energy: 78,
      mood: 62,
      affectionLevel: 8,
      kind: 'tap',
      area: 'halo',
    })

    expect(high.patience).toBeGreaterThan(low.patience)
    expect(getRelationshipProfile(8).closeness).toBe('close')
  })

  it('bounds a single event and lets quiet time recover patience', () => {
    const stressed = {
      ...createDefaultEmotionState(BASE_TIME, 78, 62, 3),
      patience: 25,
      socialBattery: 15,
      valence: 35,
      updatedAt: BASE_TIME,
    }
    const calmed = advanceEmotion(stressed, {
      now: BASE_TIME + 30 * 60_000,
      scene: scene(30 * 60_000, 'Google Chrome'),
      energy: 80,
      mood: 65,
      affectionLevel: 3,
    })

    expect(calmed.patience).toBeGreaterThan(stressed.patience)
    expect(calmed.socialBattery).toBeGreaterThan(stressed.socialBattery)
    expect(calmed.valence).toBeGreaterThanOrEqual(stressed.valence)
    expect(Math.abs(calmed.valence - stressed.valence)).toBeLessThanOrEqual(6)
  })

  it('maps high fatigue toward rest while low social battery suppresses speech', () => {
    const tired = {
      ...createDefaultEmotionState(BASE_TIME),
      fatigue: 80,
      socialBattery: 20,
      patience: 25,
      valence: 35,
    }
    const rest = candidate({
      ruleId: 'rest-needed',
      speech: 'optional',
      tags: ['rest'],
    })
    const comment = candidate({ speech: 'optional', tags: ['scene_comment'] })
    const micro = candidate({
      ruleId: 'idle-micro-motion',
      speech: 'none',
      tags: ['scene_comment'],
    })
    const relationship = getRelationshipProfile(3)

    expect(getEmotionScoreAdjustment(rest, tired, relationship)).toBeGreaterThan(0)
    expect(getEmotionScoreAdjustment(comment, tired, relationship)).toBeLessThan(0)
    expect(getEmotionScoreAdjustment(micro, tired, relationship)).toBeGreaterThan(0)
    expect(getVoiceEmotion(tired, 3, relationship)).toBe('tired')
  })

  it('maps emotion and activation to a bounded voice duration scale', () => {
    const calm = createDefaultEmotionState(BASE_TIME)
    const tired = {
      ...calm,
      activation: 24,
      fatigue: 82,
    }
    const excited = {
      ...calm,
      activation: 86,
      fatigue: 5,
    }
    const relationship = getRelationshipProfile(6)
    const tiredStyle = getVoicePerformanceStyle(tired, 6, 'tired', relationship)
    const excitedStyle = getVoicePerformanceStyle(excited, 6, 'calm', relationship)

    expect(tiredStyle.emotion).toBe('tired')
    expect(tiredStyle.durationScale).toBeGreaterThan(1)
    expect(tiredStyle.durationScale).toBeLessThanOrEqual(1.12)
    expect(excitedStyle.durationScale).toBeLessThan(1)
    expect(excitedStyle.durationScale).toBeGreaterThanOrEqual(0.9)
    expect(excitedStyle.activationBucket).toBe(9)
  })

  it('updates emotion from a Presence outcome and normalizes expired causes', () => {
    const before = createDefaultEmotionState(BASE_TIME)
    const rested = applyPresenceEmotion(
      before,
      candidate({
        ruleId: 'focus-long-milestone',
        tags: ['focus', 'rest'],
      }),
      BASE_TIME + 1_000,
    )
    const normalized = normalizeEmotionState(
      {
        ...rested,
        valence: 140,
        causes: [
          {
            source: 'old',
            delta: 1,
            label: 'old',
            startedAt: BASE_TIME - 20_000,
            expiresAt: BASE_TIME - 1,
          },
        ],
      },
      rested,
    )

    expect(rested.fatigue).toBeLessThan(before.fatigue)
    expect(rested.socialBattery).toBeGreaterThan(before.socialBattery)
    expect(normalized.valence).toBe(100)
    expect(normalized.causes).toEqual([])
  })
})

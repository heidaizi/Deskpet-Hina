import { describe, expect, it } from 'vitest'
import type { PresenceCandidate, PresenceDecision } from '../../src/shared/presence'
import { createTimeSceneContext } from '../../src/shared/time-scene'
import { PresenceController } from '../../src/main/presence/presence-controller'

const BASE_MS = new Date('2026-10-25T09:00:00+08:00').getTime()
const TICK_MS = 15_000
const END_MS = 8 * 3_600_000

function sceneAt(offsetMs: number, app: string) {
  return createTimeSceneContext(new Date(BASE_MS + offsetMs), app, 0, {
    onBatteryPower: false,
    screenLocked: false,
    suspended: false,
  })
}

function sceneCandidate(now: number): PresenceCandidate {
  return {
    ruleId: 'scene-companion:audit',
    priority: 25,
    cooldownKey: 'scene-companion:audit',
    cooldownMs: 0,
    speech: 'optional',
    bodyPolicy: 'replace',
    canRunWhileSpeaking: false,
    action: 'look_at_cursor',
    expression: 'neutral',
    dialogue: '……在做什么？',
    reason: `场景审计 ${now}`,
    tags: ['scene_comment'],
  }
}

describe('presence shadow audit', () => {
  it('keeps an eight-hour decision stream inside speech budgets and milestone limits', () => {
    const decisions: PresenceDecision[] = []
    let nextScenePerformanceAt = 0
    const controller = new PresenceController({
      mode: 'shadow',
      random: () => 0.5,
      interactionGraceMs: 0,
      minimumSpeechGapMs: 45_000,
      maximumSpeechPerHour: 6,
      focusFirstMs: 40 * 60_000,
      focusLongMs: 90 * 60_000,
      returnAfterMs: 10 * 60_000,
      idleReturnAfterMs: 60 * 60_000,
      scenePerformanceStableMs: 0,
      lateNightStableMs: 0,
      idleMicroMs: 10 * 60_000,
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
        lastInteractionAt: BASE_MS,
      }),
      getScenePerformance: (context) => {
        if (context.now < nextScenePerformanceAt) {
          return null
        }
        nextScenePerformanceAt = context.now + 90_000
        return sceneCandidate(context.now)
      },
      deliver: () => {
        throw new Error('shadow mode must not deliver')
      },
      onDecision: (decision) => decisions.push(decision),
    })

    for (let offset = 0; offset <= END_MS; offset += TICK_MS) {
      const hour = Math.floor(offset / 3_600_000)
      const app =
        hour < 2 || (hour >= 3 && hour < 5) || hour >= 6
          ? 'Visual Studio Code'
          : hour < 3
            ? 'Google Chrome'
            : 'Discord'
      controller.observeScene(sceneAt(offset, app))
    }

    const performed = decisions.filter(
      (decision): decision is Extract<PresenceDecision, { kind: 'perform' }> =>
        decision.kind === 'perform',
    )
    const speech = performed.filter((decision) => decision.candidate.speech !== 'none')
    const speechPerHour = new Map<number, number>()
    for (const decision of speech) {
      const hour = Math.floor((decision.selectedAt - BASE_MS) / 3_600_000)
      speechPerHour.set(hour, (speechPerHour.get(hour) ?? 0) + 1)
    }

    expect(Math.max(...speechPerHour.values())).toBeLessThanOrEqual(8)
    expect(
      performed.filter((decision) => decision.candidate.ruleId === 'focus-first-milestone'),
    ).toHaveLength(3)
    expect(
      performed.filter((decision) => decision.candidate.ruleId === 'focus-long-milestone'),
    ).toHaveLength(3)
    expect(controller.getDiagnostics()).toMatchObject({
      mode: 'shadow',
      deliveredCount: 0,
    })
  })
})

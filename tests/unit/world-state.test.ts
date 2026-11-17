import { describe, expect, it } from 'vitest'
import { buildWorldState, buildWorldStatePrompt } from '../../src/main/domain/world-state'
import type { SettingsSnapshot } from '../../src/shared/types'
import type { TimeSceneContext } from '../../src/shared/time-scene'

const snapshot = {
  settings: { rendererId: 'hina-dress', rendererMode: '3d' },
  state: { affectionLevel: 5, affectionTitle: '亲密' },
  character: {
    renderers: [
      { id: 'hina-swimsuit', label: '泳装', mode: '3d', status: 'available' },
      { id: 'hina-dress', label: '礼服', mode: '3d', status: 'available' },
    ],
  },
} as unknown as SettingsSnapshot

const scene = {
  scene: 'development',
  timePeriod: 'afternoon',
  localDate: '2026-11-16',
  localTime: '14:20',
  isWeekend: false,
} as unknown as TimeSceneContext

describe('shared world state', () => {
  it('resolves the current outfit and emotion labels', () => {
    const world = buildWorldState({
      now: 1_000,
      scene,
      snapshot,
      emotion: {
        schemaVersion: 1,
        valence: 10,
        activation: 20,
        fatigue: 30,
        patience: 80,
        socialBattery: 70,
        dominant: 'embarrassed',
        causes: [],
        updatedAt: 1_000,
      },
      routine: {
        pomodoroPhase: 'work',
        pomodoroMinutesLeft: 18,
        waterReminderEnabled: true,
        sleepTime: '23:30',
      },
      schedule: [],
      media: null,
    })
    expect(world.outfit).toMatchObject({ id: 'hina-dress', label: '礼服', mode: '3d' })
    expect(world.emotion?.label).toBe('害羞')
    expect(world.relationship).toEqual({ level: 5, title: '亲密' })
    expect(buildWorldStatePrompt(world)).toContain('当前服装：礼服')
    expect(buildWorldStatePrompt(world)).toContain('剩 18 分钟')
    expect(buildWorldStatePrompt(world)).toContain('疲劳 30/100')
  })

  it('falls back to an unknown outfit without throwing', () => {
    const world = buildWorldState({
      now: 1_000,
      scene,
      snapshot: {
        ...snapshot,
        settings: { rendererId: '', rendererMode: '2d' },
      } as SettingsSnapshot,
      emotion: null,
      routine: {
        pomodoroPhase: null,
        pomodoroMinutesLeft: null,
        waterReminderEnabled: false,
        sleepTime: '23:30',
      },
      schedule: [],
      media: null,
    })
    expect(world.outfit.mode).toBe('2d')
    expect(world.emotion).toBeNull()
    expect(buildWorldStatePrompt(world)).toContain('当前服装')
  })
})

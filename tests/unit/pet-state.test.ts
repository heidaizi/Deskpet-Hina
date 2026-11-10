import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadContent } from '../../src/main/domain/content-loader'
import {
  createDefaultPetState,
  getAffectionLevel,
  refreshDailyState,
  toPetStateView,
} from '../../src/main/domain/pet-state'

const bundle = loadContent(join(process.cwd(), 'content'))

describe('affection balance and progression', () => {
  it('uses the final eight-level curve with configured unlock labels', () => {
    const level = getAffectionLevel(104, bundle.affection.levels)

    expect(level).toMatchObject({
      level: 5,
      title: '习惯依靠',
      nextLevelXp: 152,
      nextLevelTitle: '不必逞强',
    })
    expect(level.unlockedContent).toContain('信赖长按对白')
    expect(level.unlockedContent).toContain('高好感陪伴对白')
    expect(level.nextLevelUnlocks).toEqual(['深夜关心对白'])
  })

  it('recovers mood and energy once when the local day changes', () => {
    const state = createDefaultPetState(bundle.affection, '2026-10-23')
    state.mood = 20
    state.energy = 10

    const nextDay = refreshDailyState(state, '2026-10-24', bundle.affection.dailyRecovery)

    expect(nextDay.mood).toBe(26)
    expect(nextDay.energy).toBe(28)
    expect(nextDay.dailyGains).toEqual({
      date: '2026-10-24',
      affectionXp: 0,
      interactions: 0,
    })
  })

  it('exposes cooldown and next-level unlock information to the settings UI', () => {
    const state = createDefaultPetState(bundle.affection, '2026-10-24')
    state.affectionXp = 64
    state.affectionLevel = 4

    const view = toPetStateView(state, bundle.affection)

    expect(view.affectionLevel).toBe(4)
    expect(view.nextLevelTitle).toBe('习惯依靠')
    expect(view.nextLevelUnlocks).toEqual(['高好感陪伴对白'])
    expect(view.affectionGainCooldownMs).toBe(60_000)
  })
})

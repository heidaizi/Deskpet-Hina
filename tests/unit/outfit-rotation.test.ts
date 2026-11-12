import { describe, expect, it } from 'vitest'
import { pickNextOutfit, rotationDue } from '../../src/main/domain/outfit-rotation'
import type { CharacterRendererOption } from '../../src/shared/types'

const renderers: CharacterRendererOption[] = [
  { id: '2d-placeholder', label: '2D', mode: '2d', status: 'available' },
  { id: 'swim', label: '泳装', mode: '3d', status: 'available' },
  { id: 'dress', label: '礼服', mode: '3d', status: 'available' },
  { id: 'normal', label: '常服', mode: '3d', status: 'available' },
]

describe('outfit rotation', () => {
  it('cycles through 3D outfits', () => {
    expect(pickNextOutfit(renderers, 'swim')).toBe('dress')
    expect(pickNextOutfit(renderers, 'dress')).toBe('normal')
    expect(pickNextOutfit(renderers, 'normal')).toBe('swim')
  })

  it('falls back to the first outfit when none is selected', () => {
    expect(pickNextOutfit(renderers, '')).toBe('swim')
  })

  it('returns null when there is nothing to rotate', () => {
    expect(pickNextOutfit(renderers.slice(0, 2), 'swim')).toBeNull()
  })

  it('becomes due after the configured number of days', () => {
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    expect(rotationDue(now - 2 * day, 3, now)).toBe(false)
    expect(rotationDue(now - 3 * day, 3, now)).toBe(true)
    expect(rotationDue(now - 100 * day, 0, now)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { isEntryAllowedForOutfit } from '../../src/main/domain/dialogue-service'

const base = { id: 'x', text: '台词' }

describe('outfit dialogue filtering', () => {
  it('allows generic lines for every outfit', () => {
    expect(isEntryAllowedForOutfit(base, 'hina-swimsuit')).toBe(true)
    expect(isEntryAllowedForOutfit(base, 'hina-normal')).toBe(true)
  })

  it('keeps swimsuit-only lines out of other outfits', () => {
    const entry = { ...base, outfits: ['hina-swimsuit'] }
    expect(isEntryAllowedForOutfit(entry, 'hina-swimsuit')).toBe(true)
    expect(isEntryAllowedForOutfit(entry, 'hina-dress')).toBe(false)
    expect(isEntryAllowedForOutfit(entry, 'hina-normal')).toBe(false)
  })

  it('supports outfit-specific lines', () => {
    const entry = { ...base, outfits: ['hina-normal'] }
    expect(isEntryAllowedForOutfit(entry, 'hina-normal')).toBe(true)
    expect(isEntryAllowedForOutfit(entry, 'hina-dress')).toBe(false)
  })
})

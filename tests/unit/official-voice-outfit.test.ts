import { describe, expect, it } from 'vitest'
import { getOfficialVoiceLine } from '../../src/shared/official-voices'

describe('official voice outfits', () => {
  it('resolves the clip path for each outfit', () => {
    const swimsuit = getOfficialVoiceLine('Cafe_monolog_1', 'hina-swimsuit')
    const dress = getOfficialVoiceLine('Cafe_monolog_1', 'hina-dress')
    const normal = getOfficialVoiceLine('Lobby_2', 'hina-normal')
    expect(swimsuit?.path).toContain('/outfit/swimsuit/')
    expect(dress?.path).toContain('/outfit/dress/')
    expect(normal?.path).toContain('/outfit/normal/')
  })

  it('returns undefined instead of borrowing another outfit voice', () => {
    expect(getOfficialVoiceLine('Cafe_monolog_1', 'hina-normal')).toBeUndefined()
    expect(getOfficialVoiceLine('Cafe_monolog_1')?.path).toContain('/official-denoise45/')
  })

  it('keeps text and action metadata', () => {
    const line = getOfficialVoiceLine('Lobby_4', 'hina-dress')
    expect(line?.text).toContain('老师')
    expect(line?.action).toBeTruthy()
  })
})

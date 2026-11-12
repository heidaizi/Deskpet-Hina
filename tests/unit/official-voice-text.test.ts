import { describe, expect, it } from 'vitest'
import { getOfficialVoiceText } from '../../src/shared/official-voices'

describe('official voice text', () => {
  it('uses the outfit-specific translation', () => {
    expect(getOfficialVoiceText('Cafe_monolog_1', 'hina-dress')).toContain('礼服')
    expect(getOfficialVoiceText('Lobby_3', 'hina-normal')).toContain('能不能别摸')
    expect(getOfficialVoiceText('Cafe_monolog_1', 'hina-swimsuit')).toContain('泳装')
  })

  it('returns undefined when the outfit has no text', () => {
    expect(getOfficialVoiceText('Cafe_monolog_1', 'hina-normal')).toBeUndefined()
  })
})

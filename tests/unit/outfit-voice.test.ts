import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getOutfitGreeting } from '../../src/main/domain/outfit-voice'

const contentDir = resolve('content')

describe('outfit voice', () => {
  it('has login and return lines for all three outfits', () => {
    for (const id of ['hina-swimsuit', 'hina-dress', 'hina-normal']) {
      const login = getOutfitGreeting(contentDir, id, 'login')
      const back = getOutfitGreeting(contentDir, id, 'return')
      expect(login?.voice).toContain(id.replace('hina-', ''))
      expect(login?.spokenText.length).toBeGreaterThan(3)
      expect(login?.dialogue.length).toBeGreaterThan(2)
      expect(back?.voice.endsWith('.ogg')).toBe(true)
    }
  })

  it('returns null for unknown outfits', () => {
    expect(getOutfitGreeting(contentDir, 'hina-unknown', 'login')).toBeNull()
  })
})

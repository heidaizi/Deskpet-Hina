import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HINA_SWIMSUIT_ANIMATIONS } from '../../src/shared/model-animations'
import {
  OFFICIAL_VOICE_LINES,
  getOfficialVoiceLine,
  pickRandomOfficialVoiceLine,
} from '../../src/shared/official-voices'

describe('official voice catalog', () => {
  it('maps every voice line to a local official clip and model animation', () => {
    expect(OFFICIAL_VOICE_LINES).toHaveLength(13)
    const modelClips = new Set(HINA_SWIMSUIT_ANIMATIONS.map((animation) => animation.clip))

    for (const voice of OFFICIAL_VOICE_LINES) {
      expect(existsSync(join(process.cwd(), voice.path))).toBe(true)
      expect(voice.path.endsWith('.wav')).toBe(true)
      expect(modelClips.has(voice.modelClip)).toBe(true)
    }
  })

  it('avoids repeating the previous random voice clip', () => {
    const selected = pickRandomOfficialVoiceLine(() => 0, 'Cafe_monolog_1')
    expect(selected.clip).not.toBe('Cafe_monolog_1')
  })

  it('keeps official Chinese bubbles and Japanese transcripts complete', () => {
    const dialogues = JSON.parse(
      readFileSync(join(process.cwd(), 'content/dialogues.json'), 'utf8'),
    ) as {
      pools: Record<
        string,
        {
          entries: Array<{
            text: string
            outfits?: string[]
            source?: { clip: string; japanese: string }
          }>
        }
      >
    }
    const training = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          'assets/characters/hina-swimsuit/private/audio/training/hina-training-expanded.json',
        ),
        'utf8',
      ),
    ) as { entries: Array<{ clip: string; text: string }> }
    const transcripts = new Map(training.entries.map((entry) => [entry.clip, entry.text]))
    const sourced = Object.values(dialogues.pools)
      .flatMap((pool) => pool.entries)
      .filter(
        (entry) =>
          entry.source &&
          transcripts.has(entry.source.clip) &&
          (!entry.outfits || entry.outfits.includes('hina-swimsuit')),
      )

    expect(sourced.length).toBeGreaterThanOrEqual(13)
    for (const entry of sourced) {
      const source = entry.source!
      const voice = getOfficialVoiceLine(source.clip)
      expect(voice, source.clip).toBeDefined()
      expect(entry.text, source.clip).toBe(voice?.text)
      expect(normalizeWhitespace(source.japanese), source.clip).toBe(
        normalizeWhitespace(transcripts.get(source.clip) ?? ''),
      )
    }
  })
})

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

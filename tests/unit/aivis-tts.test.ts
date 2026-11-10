import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AivisTtsService,
  pickAivisStyleId,
  resolveAivisStyle,
  type AivisSpeaker,
} from '../../src/main/domain/aivis-tts-service'

const speakers: AivisSpeaker[] = [
  {
    name: 'hina',
    styles: [
      { name: 'annoyed', id: 11 },
      { name: 'neutral', id: 12 },
      { name: 'soft', id: 13 },
    ],
  },
  { name: 'まお', styles: [{ name: 'ノーマル', id: 21 }] },
]

describe('aivis style mapping', () => {
  it('maps emotions to the three supported styles', () => {
    expect(resolveAivisStyle('angry')).toBe('annoyed')
    expect(resolveAivisStyle('stern')).toBe('annoyed')
    expect(resolveAivisStyle('embarrassed')).toBe('soft')
    expect(resolveAivisStyle('tired')).toBe('neutral')
    expect(resolveAivisStyle('reluctant')).toBe('annoyed')
    expect(resolveAivisStyle('neutral')).toBe('neutral')
    expect(resolveAivisStyle(undefined)).toBe('neutral')
    expect(resolveAivisStyle('unknown-emotion')).toBe('neutral')
  })

  it('prefers the configured model and falls back to the first one', () => {
    expect(pickAivisStyleId(speakers, 'hina', 'soft')).toBe(13)
    expect(pickAivisStyleId(speakers, 'missing', 'annoyed')).toBe(11)
    expect(pickAivisStyleId([], 'hina', 'soft')).toBeNull()
  })

  it('falls back to the first style when the name is localized', () => {
    expect(pickAivisStyleId(speakers, 'まお', 'soft')).toBe(21)
  })
})

describe('aivis client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('runs audio_query then synthesis and returns wav bytes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ accent_phrases: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      })
    vi.stubGlobal('fetch', fetchMock)

    const service = new AivisTtsService('http://engine', 'hina')
    const audio = await service.synthesize('先生', 12)

    expect(audio).toEqual(new Uint8Array([1, 2, 3]))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/audio_query?text=')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/synthesis?speaker=12')
  })

  it('returns null when the engine is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const service = new AivisTtsService('http://engine', 'hina')
    expect(await service.synthesize('先生', 12)).toBeNull()
    expect(await service.listSpeakers()).toEqual([])
  })

  it('returns null for blank text without calling the engine', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const service = new AivisTtsService('http://engine', 'hina')
    expect(await service.synthesize('   ', 12)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

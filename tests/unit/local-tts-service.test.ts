import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  LocalTtsService,
  chooseLocalTtsVoice,
  deriveEmotionSeed,
  isJapaneseTtsText,
  isSpeakableText,
} from '../../src/main/domain/local-tts-service'
import { AUTONOMOUS_DIALOGUES } from '../../src/shared/autonomous-dialogues'

describe('local TTS routing', () => {
  it('selects Kyoko for Japanese kana and Tingting for Chinese text', () => {
    expect(chooseLocalTtsVoice('先生、お疲れさま。')).toBe('Kyoko')
    expect(chooseLocalTtsVoice('老师，今天也辛苦了。')).toBe('Tingting')
  })

  it('skips punctuation-only dialogue', () => {
    expect(isSpeakableText('……')).toBe(false)
    expect(isSpeakableText('老师？')).toBe(true)
    expect(isJapaneseTtsText('别一直戳。')).toBe(false)
    expect(isJapaneseTtsText('突かないで。')).toBe(true)
  })

  it('derives stable but distinct seeds for emotion variants', () => {
    const first = deriveEmotionSeed('revision', '少しだけ。', '控えめな声', 0)
    const repeat = deriveEmotionSeed('revision', '少しだけ。', '控えめな声', 0)
    const second = deriveEmotionSeed('revision', '少しだけ。', '控えめな声', 1)

    expect(first).toBe(repeat)
    expect(second).not.toBe(first)
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(2 ** 31)
    expect(second).toBeGreaterThanOrEqual(0)
    expect(second).toBeLessThan(2 ** 31)
  })

  it('does not prewarm in E2E and follows enable, suspend, and resume states', () => {
    const previousE2E = process.env.DESKPET_E2E
    const userDataPath = mkdtempSync(join(tmpdir(), 'deskpet-tts-lifecycle-'))
    process.env.DESKPET_E2E = '1'
    try {
      const service = new LocalTtsService(userDataPath)
      expect(service.getStatus().state).toBe('unloaded')

      service.prewarm()
      expect(service.getStatus()).toMatchObject({
        enabled: true,
        state: 'unloaded',
      })

      service.suspend()
      expect(service.getStatus().state).toBe('suspended')

      service.resume(true)
      expect(service.getStatus().state).toBe('unloaded')

      service.setEnabled(false)
      expect(service.getStatus().state).toBe('disabled')
      service.suspend()
      expect(service.getStatus().state).toBe('disabled')

      service.resume(false)
      expect(service.getStatus()).toMatchObject({
        enabled: false,
        state: 'disabled',
      })
    } finally {
      if (previousE2E === undefined) {
        delete process.env.DESKPET_E2E
      } else {
        process.env.DESKPET_E2E = previousE2E
      }
      rmSync(userDataPath, { recursive: true, force: true })
    }
  })

  it('provides Japanese spoken text for every dialogue that needs local TTS', () => {
    const root = process.cwd()
    const dialogueConfig = JSON.parse(
      readFileSync(join(root, 'content/dialogues.json'), 'utf8'),
    ) as {
      pools: Record<string, { entries: Array<{ text: string; source?: { clip?: string } }> }>
    }
    const spokenLines = JSON.parse(readFileSync(join(root, 'content/tts-ja.json'), 'utf8')) as {
      captions: Record<string, string>
      emotionSeedVariants: Record<string, number>
      lines: Record<string, string | { text: string; emotion?: string }>
    }
    const officialClips = new Set([
      'Battle_Damage_2',
      'Battle_Move_2',
      'Cafe_monolog_1',
      'Cafe_monolog_2',
      'EventLobby_3',
      'ExSkill_Level_1',
      'Lobby_2',
      'Lobby_3',
      'Lobby_4',
      'Lobby_5',
      'LogIn_1',
      'Relationship_Up_1',
      'Season_Birthday_2',
    ])
    const hasSpokenLine = (text: string): boolean => {
      const line = spokenLines.lines[text]
      return typeof line === 'string' ? Boolean(line.trim()) : Boolean(line?.text.trim())
    }
    const spokenLineText = (text: string): string => {
      const line = spokenLines.lines[text]
      return typeof line === 'string' ? line : (line?.text ?? '')
    }
    const missing = Object.values(dialogueConfig.pools)
      .flatMap((pool) => pool.entries)
      .filter(
        (entry) =>
          isSpeakableText(entry.text) &&
          !(entry.source?.clip && officialClips.has(entry.source.clip)) &&
          !hasSpokenLine(entry.text),
      )
      .map((entry) => entry.text)

    expect(missing).toEqual([])
    expect(
      Object.values(AUTONOMOUS_DIALOGUES).filter(
        (text) => !hasSpokenLine(text) || !isJapaneseTtsText(spokenLineText(text)),
      ),
    ).toEqual([])
    const missingEmotionCaptions = Object.entries(spokenLines.lines)
      .filter(([, line]) => typeof line !== 'string' && line.emotion)
      .filter(([, line]) => {
        const emotion = typeof line === 'string' ? undefined : line.emotion
        return !emotion || !spokenLines.captions[emotion]?.trim()
      })

    expect(missingEmotionCaptions).toEqual([])
    expect(
      Object.keys(spokenLines.captions).filter(
        (emotion) => (spokenLines.emotionSeedVariants[emotion] ?? 0) < 2,
      ),
    ).toEqual([])
  })

  it('sends the configured LoRA adapter to the local Irodori service', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'deskpet-tts-lora-'))
    const configPath = join(userDataPath, 'tts.json')
    const adapter =
      '~/.local/share/deskpet-tts/outputs/hina-emotion-lora-caption-run2/checkpoint_0000275'
    writeFileSync(
      configPath,
      JSON.stringify({
        voice: 'hina-swimsuit',
        modelRevision: 'test-lora-revision',
        loraAdapter: adapter,
        defaultSeedVariants: 1,
        lines: {
          测试台词: {
            text: '少しだけ。',
            emotion: 'soft',
          },
        },
        captions: {
          soft: '柔らかく話す。',
        },
      }),
      'utf8',
    )
    const service = new LocalTtsService(userDataPath, configPath)
    const internal = service as unknown as { irodoriReady: boolean }
    internal.irodoriReady = true
    let requestBody: Record<string, unknown> | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return new Response(new Uint8Array([82, 73, 70, 70]))
      }),
    )

    try {
      await service.synthesize('测试台词')
      expect(service.getLoraAdapter()).toBe(join(homedir(), adapter.slice(2)))
      expect(requestBody?.irodori).toMatchObject({
        lora_adapter: join(homedir(), adapter.slice(2)),
        num_steps: 16,
      })
    } finally {
      service.stop()
      vi.unstubAllGlobals()
      rmSync(userDataPath, { recursive: true, force: true })
    }
  })

  it('returns bundled dialogue audio without starting the TTS service', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'deskpet-prebuilt-tts-'))
    const audioPath = join(directory, 'line.wav')
    const manifestPath = join(directory, 'prebuilt.json')
    writeFileSync(audioPath, 'RIFF-prebuilt')
    writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        entries: [{ text: '固定台词', path: 'line.wav' }],
      }),
      'utf8',
    )
    const service = new LocalTtsService(directory, undefined, undefined, manifestPath, directory)
    try {
      const result = await service.synthesize('固定台词', {
        emotion: 'neutral',
      })
      expect(result?.source).toBe('prebuilt-tts')
      expect(Buffer.from(result?.audio ?? []).toString('utf8')).toBe('RIFF-prebuilt')
      expect(service.getStatus().state).toBe('unloaded')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('has a bundled WAV for every current local-TTS dialogue', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'content/prebuilt-tts-ja.json'), 'utf8'),
    ) as { entries: Array<{ text: string; path: string }> }
    const localLines = JSON.parse(
      readFileSync(join(process.cwd(), 'content/tts-ja.json'), 'utf8'),
    ) as { lines: Record<string, unknown> }
    const bundled = new Set(manifest.entries.map((entry) => entry.text))
    expect(Object.keys(localLines.lines).every((text) => bundled.has(text))).toBe(true)
    expect(bundled.has('……让我看一下。')).toBe(true)
    for (const entry of manifest.entries) {
      expect(existsSync(join(process.cwd(), entry.path)), entry.text).toBe(true)
    }
  })
})

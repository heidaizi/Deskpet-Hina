import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SceneCompanion,
  getSceneCompanionDialogueTexts,
  type SceneCompanionContext,
} from '../../src/shared/scene-companion'
import { OFFICIAL_VOICE_LINES } from '../../src/shared/official-voices'

function context(overrides: Partial<SceneCompanionContext> = {}): SceneCompanionContext {
  return {
    scene: 'development',
    timePeriod: 'afternoon',
    energy: 70,
    mood: 60,
    affectionLevel: 3,
    now: 1_000,
    visible: true,
    dragging: false,
    clickThrough: false,
    screenLocked: false,
    suspended: false,
    systemIdleSeconds: 5,
    randomVoiceEnabled: true,
    ...overrides,
  }
}

describe('scene companion', () => {
  it('requires a stable scene and then observes cooldown', () => {
    const companion = new SceneCompanion(() => 0, {
      stableMs: 20_000,
      cooldownMs: 120_000,
    })
    expect(companion.observe(context({ now: 1_000 }))).toBeNull()
    expect(companion.observe(context({ now: 15_000 }))).toBeNull()
    const selected = companion.observe(context({ now: 22_000 }))
    expect(selected).toMatchObject({ scene: 'development', speak: true })
    expect(selected?.dialogue).toBeTruthy()
    expect(companion.observe(context({ now: 50_000 }))).toBeNull()
  })

  it('resets the stability window after switching scenes', () => {
    const companion = new SceneCompanion(() => 0)
    companion.observe(context({ now: 1_000 }))
    companion.observe(context({ now: 25_000 }))
    expect(companion.observe(context({ scene: 'focus', now: 150_000 }))).toBeNull()
    expect(companion.observe(context({ scene: 'focus', now: 169_000 }))).toBeNull()
    expect(companion.observe(context({ scene: 'focus', now: 171_000 }))?.scene).toBe('focus')
  })

  it('suppresses inactive, obscured, and system contexts', () => {
    const companion = new SceneCompanion()
    expect(companion.observe(context({ dragging: true }))).toBeNull()
    expect(companion.observe(context({ randomVoiceEnabled: false }))).toBeNull()
    expect(companion.observe(context({ scene: 'system' }))).toBeNull()
    expect(companion.observe(context({ screenLocked: true }))).toBeNull()
  })

  it('uses only bundled low-latency dialogue audio', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'content/prebuilt-tts-ja.json'), 'utf8'),
    ) as { entries: Array<{ text: string }> }
    const bundled = new Set(manifest.entries.map((entry) => entry.text))
    const official = new Set(OFFICIAL_VOICE_LINES.map((entry) => entry.text))
    expect(
      getSceneCompanionDialogueTexts().every((text) => bundled.has(text) || official.has(text)),
    ).toBe(true)
  })

  it('offers scene-specific dialogue variation without repeating immediately', () => {
    const companion = new SceneCompanion(() => 0, {
      stableMs: 1_000,
      cooldownMs: 1_000,
    })
    companion.observe(context({ scene: 'browser', now: 1_000 }))
    const first = companion.observe(context({ scene: 'browser', now: 2_100 }))
    const second = companion.observe(context({ scene: 'browser', now: 3_200 }))
    expect(companion.observe(context({ scene: 'development', now: 4_300 }))).toBeNull()
    const development = companion.observe(context({ scene: 'development', now: 5_400 }))

    expect(first?.scene).toBe('browser')
    expect(second?.scene).toBe('browser')
    expect(second?.dialogue).not.toBe(first?.dialogue)
    expect(development?.scene).toBe('development')
  })

  it('rotates through multiple actions while recent dialogue is fresh', () => {
    const companion = new SceneCompanion(() => 0, {
      stableMs: 1_000,
      cooldownMs: 1_000,
    })
    companion.observe(context({ now: 1_000 }))
    const actions = new Set<string>()
    for (let index = 0; index < 8; index += 1) {
      const selected = companion.observe(context({ now: 2_100 + index * 1_100 }))
      if (selected) {
        actions.add(selected.action)
      }
    }
    expect(actions.size).toBeGreaterThanOrEqual(3)
  })

  it('uses a randomized long cooldown in production mode', () => {
    const companion = new SceneCompanion(() => 0.5, {
      stableMs: 1_000,
      minCooldownMs: 70_000,
      maxCooldownMs: 180_000,
    })
    companion.observe(context({ now: 1_000 }))
    expect(companion.observe(context({ now: 2_100 }))).not.toBeNull()
    expect(companion.observe(context({ now: 120_000 }))).toBeNull()
    expect(companion.observe(context({ now: 128_000 }))).not.toBeNull()
  })
})

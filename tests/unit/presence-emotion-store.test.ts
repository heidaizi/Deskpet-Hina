import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PresenceEmotionStore } from '../../src/main/presence/presence-emotion-store'
import { createDefaultEmotionState } from '../../src/main/presence/emotion-engine'

const directories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'deskpet-emotion-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('presence emotion persistence', () => {
  it('creates and restores a private emotion file', () => {
    const filePath = join(temporaryDirectory(), 'presence-emotion.json')
    const fallback = createDefaultEmotionState(1_000, 78, 62, 3)
    const store = new PresenceEmotionStore(filePath)

    expect(store.load(fallback)).toEqual(fallback)
    expect(existsSync(filePath)).toBe(true)
    expect(statSync(filePath).mode & 0o777).toBe(0o600)

    store.save({
      ...fallback,
      patience: 23,
      valence: 31,
      dominant: 'annoyed',
      updatedAt: 2_000,
    })

    expect(store.load(fallback)).toMatchObject({
      patience: 23,
      valence: 31,
      dominant: 'annoyed',
      updatedAt: 2_000,
    })
  })

  it('backs up a corrupt emotion file and restores safe defaults', () => {
    const directory = temporaryDirectory()
    const filePath = join(directory, 'presence-emotion.json')
    const fallback = createDefaultEmotionState(3_000, 70, 60, 2)
    writeFileSync(filePath, '{broken json', 'utf8')

    const restored = new PresenceEmotionStore(filePath).load(fallback)

    expect(restored).toEqual(fallback)
    expect(readdirSync(directory).some((name) => name.includes('.corrupt-'))).toBe(true)
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      updatedAt: 3_000,
    })
  })

  it('clamps malformed numeric emotion fields', () => {
    const filePath = join(temporaryDirectory(), 'presence-emotion.json')
    const fallback = createDefaultEmotionState(4_000)
    writeFileSync(
      filePath,
      JSON.stringify({
        schemaVersion: 1,
        valence: 999,
        activation: -4,
        fatigue: 'bad',
        patience: 45,
        socialBattery: 72,
        dominant: 'unsafe',
        causes: [],
        updatedAt: 4_500,
      }),
      'utf8',
    )

    expect(new PresenceEmotionStore(filePath).load(fallback)).toMatchObject({
      valence: 100,
      activation: 0,
      fatigue: fallback.fatigue,
      patience: 45,
      socialBattery: 72,
      updatedAt: 4_500,
    })
  })
})

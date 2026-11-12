import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadContent } from '../../src/main/domain/content-loader'
import {
  createDefaultPetState,
  formatLocalDateKey,
  normalizePetState,
} from '../../src/main/domain/pet-state'
import { PetStateStore, SettingsStore } from '../../src/main/domain/persistent-stores'

const bundle = loadContent(join(process.cwd(), 'content'))
const temporaryDirectories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'deskpet-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('pet state persistence', () => {
  it('creates, saves, and restores pet state', () => {
    const filePath = join(temporaryDirectory(), 'pet-state.json')
    const store = new PetStateStore(filePath, bundle)
    const initial = store.load()
    expect(initial.schemaVersion).toBe(1)
    expect(existsSync(filePath)).toBe(true)

    store.save({
      ...initial,
      affectionXp: 7,
      mood: 71,
    })
    const restored = store.load()
    expect(restored.affectionXp).toBe(7)
    expect(restored.mood).toBe(71)
  })

  it('migrates an old partial save by filling missing fields', () => {
    const dateKey = formatLocalDateKey(new Date())
    const migrated = normalizePetState(
      {
        schemaVersion: 0,
        affectionXp: 3,
        mood: 140,
      },
      bundle.affection,
      dateKey,
    )

    expect(migrated.schemaVersion).toBe(1)
    expect(migrated.affectionXp).toBe(3)
    expect(migrated.mood).toBe(100)
    expect(migrated.energy).toBe(bundle.affection.starting.energy)
    expect(migrated.dailyGains.date).toBe(dateKey)
  })

  it('writes a recomputed level back when loading an older balance curve', () => {
    const filePath = join(temporaryDirectory(), 'pet-state.json')
    const store = new PetStateStore(filePath, bundle)
    const initial = store.load()
    store.save({
      ...initial,
      affectionXp: 36,
      affectionLevel: 4,
    })

    const restored = store.load()

    expect(restored.affectionLevel).toBe(3)
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toMatchObject({
      affectionXp: 36,
      affectionLevel: 3,
    })
  })

  it('backs up a corrupt save and replaces it with safe defaults', () => {
    const directory = temporaryDirectory()
    const filePath = join(directory, 'pet-state.json')
    writeFileSync(filePath, '{broken json', 'utf8')

    const store = new PetStateStore(filePath, bundle)
    const recovered = store.load(new Date('2026-10-22T12:00:00+08:00'))
    expect(recovered).toEqual(
      createDefaultPetState(
        bundle.affection,
        formatLocalDateKey(new Date('2026-10-22T12:00:00+08:00')),
      ),
    )
    expect(readdirSync(directory).some((name) => name.includes('.corrupt-'))).toBe(true)
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      affectionXp: 0,
    })
  })
})

describe('settings persistence', () => {
  it('persists boolean settings and repairs malformed values', () => {
    const directory = temporaryDirectory()
    const filePath = join(directory, 'settings.json')
    const store = new SettingsStore(filePath)
    const initial = store.load()
    expect(initial).toEqual({
      schemaVersion: 11,
      alwaysOnTop: true,
      interactionsPaused: false,
      rendererMode: '2d',
      rendererId: '',
      outfitRotationEnabled: true,
      outfitRotationDays: 3,
      modelScale: 1,
      randomVoiceEnabled: true,
      localTtsEnabled: true,
      presenceMemoryEnabled: true,
      presenceEmotionEnabled: true,
      presenceAutonomyEnabled: true,
      presenceIntensity: 'balanced',
      aiEnabled: false,
      aiProactiveEnabled: false,
      aiWindowTitleEnabled: false,
      aiSelectedTextEnabled: false,
      screenPerceptionEnabled: false,
      screenPerceptionPaused: false,
      conversationMemoryEnabled: true,
      intelligenceLevel: 'basic',
      ttsQuality: 'quality',
      ttsEngine: 'irodori',
    })

    store.save({
      schemaVersion: 11,
      alwaysOnTop: false,
      interactionsPaused: true,
      rendererMode: '3d',
      rendererId: 'hina-3d',
      outfitRotationEnabled: true,
      outfitRotationDays: 3,
      modelScale: 1.1,
      randomVoiceEnabled: false,
      localTtsEnabled: false,
      presenceMemoryEnabled: false,
      presenceEmotionEnabled: false,
      presenceAutonomyEnabled: false,
      presenceIntensity: 'lively',
      aiEnabled: true,
      aiProactiveEnabled: true,
      aiWindowTitleEnabled: true,
      aiSelectedTextEnabled: true,
      screenPerceptionEnabled: true,
      screenPerceptionPaused: false,
      conversationMemoryEnabled: true,
      intelligenceLevel: 'basic',
      ttsQuality: 'quality',
      ttsEngine: 'irodori',
    })
    expect(store.load()).toMatchObject({
      alwaysOnTop: false,
      interactionsPaused: true,
      rendererMode: '3d',
      modelScale: 1,
      randomVoiceEnabled: false,
      localTtsEnabled: false,
      presenceMemoryEnabled: false,
      presenceEmotionEnabled: false,
      presenceAutonomyEnabled: false,
      presenceIntensity: 'lively',
      aiEnabled: true,
      aiProactiveEnabled: true,
      aiWindowTitleEnabled: true,
      aiSelectedTextEnabled: true,
      conversationMemoryEnabled: true,
      intelligenceLevel: 'basic',
      ttsQuality: 'quality',
      ttsEngine: 'irodori',
    })

    writeFileSync(
      filePath,
      JSON.stringify({
        schemaVersion: 1,
        alwaysOnTop: false,
        interactionsPaused: true,
      }),
      'utf8',
    )
    expect(store.load()).toEqual({
      schemaVersion: 11,
      alwaysOnTop: false,
      interactionsPaused: true,
      rendererMode: '2d',
      rendererId: '',
      outfitRotationEnabled: true,
      outfitRotationDays: 3,
      modelScale: 1,
      randomVoiceEnabled: true,
      localTtsEnabled: true,
      presenceMemoryEnabled: true,
      presenceEmotionEnabled: true,
      presenceAutonomyEnabled: true,
      presenceIntensity: 'balanced',
      aiEnabled: false,
      aiProactiveEnabled: false,
      aiWindowTitleEnabled: false,
      aiSelectedTextEnabled: false,
      screenPerceptionEnabled: false,
      screenPerceptionPaused: false,
      conversationMemoryEnabled: true,
      intelligenceLevel: 'basic',
      ttsQuality: 'quality',
      ttsEngine: 'irodori',
    })

    writeFileSync(
      filePath,
      JSON.stringify({ alwaysOnTop: 'yes', interactionsPaused: 1, modelScale: 9 }),
      'utf8',
    )
    expect(store.load()).toEqual({
      schemaVersion: 11,
      alwaysOnTop: true,
      interactionsPaused: false,
      rendererMode: '2d',
      rendererId: '',
      outfitRotationEnabled: true,
      outfitRotationDays: 3,
      modelScale: 1,
      randomVoiceEnabled: true,
      localTtsEnabled: true,
      presenceMemoryEnabled: true,
      presenceEmotionEnabled: true,
      presenceAutonomyEnabled: true,
      presenceIntensity: 'balanced',
      aiEnabled: false,
      aiProactiveEnabled: false,
      aiWindowTitleEnabled: false,
      aiSelectedTextEnabled: false,
      screenPerceptionEnabled: false,
      screenPerceptionPaused: false,
      conversationMemoryEnabled: true,
      intelligenceLevel: 'basic',
      ttsQuality: 'quality',
      ttsEngine: 'irodori',
    })
  })

  it('clamps model scale to the 30%-100% range', () => {
    const filePath = join(temporaryDirectory(), 'settings.json')
    const store = new SettingsStore(filePath)

    writeFileSync(filePath, JSON.stringify({ modelScale: 0.1 }), 'utf8')
    expect(store.load().modelScale).toBe(0.3)

    writeFileSync(filePath, JSON.stringify({ modelScale: 1.1 }), 'utf8')
    expect(store.load().modelScale).toBe(1)
  })
})

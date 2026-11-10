import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BehaviorEngine } from '../../src/main/domain/behavior-engine'
import { loadContent } from '../../src/main/domain/content-loader'
import { DialogueService } from '../../src/main/domain/dialogue-service'
import { PetController } from '../../src/main/domain/pet-controller'
import { createDefaultPetState, formatLocalDateKey } from '../../src/main/domain/pet-state'
import { PetStateStore, SettingsStore } from '../../src/main/domain/persistent-stores'

const bundle = loadContent(join(process.cwd(), 'content'))
const temporaryDirectories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'deskpet-idle-recovery-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('idle rest recovery', () => {
  it('restores low energy gradually without allowing rapid farming', () => {
    const directory = temporaryDirectory()
    const statePath = join(directory, 'pet-state.json')
    const settingsPath = join(directory, 'settings.json')
    const now = Date.now()
    const state = createDefaultPetState(bundle.affection, formatLocalDateKey(new Date(now)))
    state.energy = 0
    state.mood = 20
    writeFileSync(statePath, JSON.stringify(state), 'utf8')

    const controller = new PetController(
      bundle,
      new PetStateStore(statePath, bundle),
      new SettingsStore(settingsPath),
      new BehaviorEngine(bundle),
      new DialogueService(bundle),
      {
        version: 'test',
        now: () => now,
      },
    )

    try {
      expect(controller.recoverFromRest(now)).toEqual({
        energy: bundle.affection.idleRecovery.energy,
        mood: bundle.affection.idleRecovery.mood,
      })
      expect(controller.getSettingsSnapshot().state).toMatchObject({
        energy: bundle.affection.idleRecovery.energy,
        mood: 20 + bundle.affection.idleRecovery.mood,
      })
      expect(controller.recoverFromRest(now + 1_000)).toEqual({ energy: 0, mood: 0 })
      expect(controller.recoverFromRest(now + bundle.affection.idleRecovery.intervalMs)).toEqual({
        energy: bundle.affection.idleRecovery.energy,
        mood: bundle.affection.idleRecovery.mood,
      })
    } finally {
      controller.flush()
    }
  })
})

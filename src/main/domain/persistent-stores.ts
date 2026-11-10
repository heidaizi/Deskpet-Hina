import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  createDefaultPetState,
  defaultSettings,
  formatLocalDateKey,
  normalizePetState,
  normalizeSettings,
} from './pet-state'
import type { BehaviorBundle, PetSettings, PetState } from './types'

export function backupBrokenFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  try {
    renameSync(filePath, `${filePath}.corrupt-${timestamp}`)
  } catch {
    // The original file remains in place if the backup cannot be created.
  }
}

export function writeJsonAtomic(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temporaryPath, filePath)
}

export class PetStateStore {
  constructor(
    private readonly filePath: string,
    private readonly bundle: BehaviorBundle,
  ) {}

  load(now = new Date()): PetState {
    const dateKey = formatLocalDateKey(now)
    const fallback = createDefaultPetState(this.bundle.affection, dateKey)
    if (!existsSync(this.filePath)) {
      this.save(fallback)
      return fallback
    }

    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      const normalized = normalizePetState(raw, this.bundle.affection, dateKey)
      this.save(normalized)
      return normalized
    } catch (error) {
      console.error('Pet state was invalid and has been reset:', error)
      backupBrokenFile(this.filePath)
      this.save(fallback)
      return fallback
    }
  }

  save(state: PetState): void {
    writeJsonAtomic(this.filePath, state)
  }

  reset(now = new Date()): PetState {
    const state = createDefaultPetState(this.bundle.affection, formatLocalDateKey(now))
    this.save(state)
    return state
  }
}

export class SettingsStore {
  constructor(private readonly filePath: string) {}

  load(): PetSettings {
    if (!existsSync(this.filePath)) {
      const settings = defaultSettings()
      this.save(settings)
      return settings
    }

    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      const settings = normalizeSettings(raw)
      this.save(settings)
      return settings
    } catch (error) {
      console.error('Settings were invalid and have been reset:', error)
      backupBrokenFile(this.filePath)
      const settings = defaultSettings()
      this.save(settings)
      return settings
    }
  }

  save(settings: PetSettings): void {
    writeJsonAtomic(this.filePath, settings)
  }
}

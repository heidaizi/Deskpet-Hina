import { chmodSync, existsSync, readFileSync } from 'node:fs'
import type { EmotionState } from '../../shared/presence'
import { backupBrokenFile, writeJsonAtomic } from '../domain/persistent-stores'
import { normalizeEmotionState } from './emotion-engine'

export class PresenceEmotionStore {
  constructor(private readonly filePath: string) {}

  load(fallback: EmotionState): EmotionState {
    if (!existsSync(this.filePath)) {
      this.save(fallback)
      return fallback
    }
    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      const emotion = normalizeEmotionState(raw, fallback)
      this.save(emotion)
      return emotion
    } catch (error) {
      console.error('Presence emotion state was invalid and has been reset:', error)
      backupBrokenFile(this.filePath)
      this.save(fallback)
      return fallback
    }
  }

  save(emotion: EmotionState): void {
    writeJsonAtomic(this.filePath, normalizeEmotionState(emotion, emotion))
    try {
      chmodSync(this.filePath, 0o600)
    } catch {
      // The state remains usable even if the filesystem does not support chmod.
    }
  }
}

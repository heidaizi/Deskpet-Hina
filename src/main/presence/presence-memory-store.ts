import { chmodSync, existsSync, readFileSync } from 'node:fs'
import { backupBrokenFile, writeJsonAtomic } from '../domain/persistent-stores'
import { normalizeEpisodicMemoryState, type MemoryStateWithSignals } from './episodic-memory'

export class PresenceMemoryStore {
  constructor(private readonly filePath: string) {}

  load(now = Date.now()): MemoryStateWithSignals {
    if (!existsSync(this.filePath)) {
      const memory = normalizeEpisodicMemoryState(undefined, now)
      this.save(memory)
      return memory
    }
    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      const memory = normalizeEpisodicMemoryState(raw, now)
      this.save(memory)
      return memory
    } catch (error) {
      console.error('Episodic memory was invalid and has been reset:', error)
      backupBrokenFile(this.filePath)
      const memory = normalizeEpisodicMemoryState(undefined, now)
      this.save(memory)
      return memory
    }
  }

  save(memory: MemoryStateWithSignals): void {
    writeJsonAtomic(this.filePath, normalizeEpisodicMemoryState(memory, Date.now()))
    try {
      chmodSync(this.filePath, 0o600)
    } catch {
      // The memory remains usable even if the filesystem does not support chmod.
    }
  }
}

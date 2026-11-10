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
import {
  createEmptyEpisodicMemoryState,
  recordEpisodicMemory,
} from '../../src/main/presence/episodic-memory'
import { PresenceMemoryStore } from '../../src/main/presence/presence-memory-store'

const directories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'deskpet-memory-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('episodic memory persistence', () => {
  it('creates a private file and restores structured memories', () => {
    const filePath = join(temporaryDirectory(), 'presence-memory.json')
    const store = new PresenceMemoryStore(filePath)
    const initial = store.load(1_000)
    expect(initial).toEqual(createEmptyEpisodicMemoryState())
    expect(existsSync(filePath)).toBe(true)
    expect(statSync(filePath).mode & 0o777).toBe(0o600)

    const memory = recordEpisodicMemory(initial, {
      type: 'relationship_milestone',
      eventId: 'relationship-4',
      at: 2_000,
      affectionLevel: 4,
    })
    store.save(memory)

    expect(store.load(3_000).memories[0]).toMatchObject({
      kind: 'relationship_milestone',
      summary: '与老师的关系达到了好感等级 4',
    })
  })

  it('backs up corrupt memory and recreates a safe empty state', () => {
    const directory = temporaryDirectory()
    const filePath = join(directory, 'presence-memory.json')
    writeFileSync(filePath, '{broken json', 'utf8')

    const restored = new PresenceMemoryStore(filePath).load(5_000)

    expect(restored.memories).toEqual([])
    expect(readdirSync(directory).some((name) => name.includes('.corrupt-'))).toBe(true)
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      memories: [],
    })
  })
})

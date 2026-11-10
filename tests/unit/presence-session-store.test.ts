import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createEmptyPresenceSession,
  MAX_RECENT_PRESENCE_DIALOGUES,
  normalizePresenceSession,
  PresenceSessionStore,
} from '../../src/main/presence/presence-session-store'

const temporaryDirectories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'deskpet-presence-session-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('presence session persistence', () => {
  it('creates, saves, and restores session history with private permissions', () => {
    const filePath = join(temporaryDirectory(), 'presence-session.json')
    const store = new PresenceSessionStore(filePath)
    const initial = store.load(1_000)
    expect(initial.schemaVersion).toBe(1)
    expect(existsSync(filePath)).toBe(true)

    store.save({
      ...initial,
      lastSeenAt: 20_000,
      lastInteractionAt: 19_000,
      recentDialogues: [
        {
          at: 18_000,
          dialogueId: 'focus-first-milestone',
          textHash: 'a'.repeat(64),
          tags: ['focus'],
        },
      ],
      tagLastUsedAt: {
        focus: 18_000,
      },
    })

    expect(store.load(30_000)).toMatchObject({
      lastSeenAt: 20_000,
      lastInteractionAt: 19_000,
      recentDialogues: [{ dialogueId: 'focus-first-milestone' }],
      tagLastUsedAt: { focus: 18_000 },
    })
    expect(statSync(filePath).mode & 0o777).toBe(0o600)
  })

  it('caps, filters, and orders persisted dialogue history', () => {
    const recentDialogues = Array.from(
      { length: MAX_RECENT_PRESENCE_DIALOGUES + 5 },
      (_, index) => ({
        at: 10_000 + index,
        dialogueId: `dialogue-${index}`,
        textHash: String(index).padStart(64, '0'),
        tags: index % 2 === 0 ? ['focus'] : ['unknown'],
      }),
    )

    const normalized = normalizePresenceSession(
      {
        schemaVersion: 1,
        recentDialogues: [...recentDialogues].reverse(),
        tagLastUsedAt: {
          focus: 10_000,
          invalid: 20_000,
        },
      },
      40_000,
    )

    expect(normalized.recentDialogues).toHaveLength(MAX_RECENT_PRESENCE_DIALOGUES)
    expect(normalized.recentDialogues[0]?.dialogueId).toBe('dialogue-5')
    expect(normalized.tagLastUsedAt).toEqual({ focus: 10_000 })
  })

  it('backs up a corrupt file and recreates safe defaults', () => {
    const directory = temporaryDirectory()
    const filePath = join(directory, 'presence-session.json')
    writeFileSync(filePath, '{broken json', 'utf8')
    const store = new PresenceSessionStore(filePath)

    expect(store.load(50_000)).toEqual(createEmptyPresenceSession(50_000))
    expect(readdirSync(directory).some((name) => name.includes('.corrupt-'))).toBe(true)
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      lastSeenAt: 50_000,
      recentDialogues: [],
    })
  })
})

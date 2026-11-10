import { chmodSync, existsSync, readFileSync } from 'node:fs'
import { backupBrokenFile, writeJsonAtomic } from '../domain/persistent-stores'
import {
  PRESENCE_TAGS,
  type PresenceDialogueHistoryEntry,
  type PresenceSessionState,
  type PresenceTag,
} from '../../shared/presence'
import { SCENE_KINDS, TIME_PERIODS, type SceneKind, type TimePeriod } from '../../shared/time-scene'

export const MAX_RECENT_PRESENCE_DIALOGUES = 30

export function createEmptyPresenceSession(now = Date.now()): PresenceSessionState {
  return {
    schemaVersion: 1,
    sessionStartedAt: now,
    lastSeenAt: now,
    lastInteractionAt: null,
    lastExternalScene: null,
    lastTimePeriod: null,
    recentDialogues: [],
    tagLastUsedAt: {},
  }
}

export function normalizePresenceSession(raw: unknown, now = Date.now()): PresenceSessionState {
  const fallback = createEmptyPresenceSession(now)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fallback
  }
  const value = raw as Partial<PresenceSessionState>
  return {
    schemaVersion: 1,
    sessionStartedAt: finiteTimestamp(value.sessionStartedAt) ?? now,
    lastSeenAt: finiteTimestamp(value.lastSeenAt) ?? now,
    lastInteractionAt: finiteTimestamp(value.lastInteractionAt),
    lastExternalScene: isSceneKind(value.lastExternalScene) ? value.lastExternalScene : null,
    lastTimePeriod: isTimePeriod(value.lastTimePeriod) ? value.lastTimePeriod : null,
    recentDialogues: normalizeRecentDialogues(value.recentDialogues),
    tagLastUsedAt: normalizeTagTimestamps(value.tagLastUsedAt),
  }
}

export class PresenceSessionStore {
  constructor(private readonly filePath: string) {}

  load(now = Date.now()): PresenceSessionState {
    if (!existsSync(this.filePath)) {
      const session = createEmptyPresenceSession(now)
      this.save(session)
      return session
    }
    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      const session = normalizePresenceSession(raw, now)
      this.save(session)
      return session
    } catch (error) {
      console.error('Presence session was invalid and has been reset:', error)
      backupBrokenFile(this.filePath)
      const session = createEmptyPresenceSession(now)
      this.save(session)
      return session
    }
  }

  save(session: PresenceSessionState): void {
    writeJsonAtomic(this.filePath, normalizePresenceSession(session, session.lastSeenAt))
    try {
      chmodSync(this.filePath, 0o600)
    } catch {
      // The data remains usable even if the filesystem does not support chmod.
    }
  }
}

function normalizeRecentDialogues(value: unknown): PresenceDialogueHistoryEntry[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .flatMap((entry): PresenceDialogueHistoryEntry[] => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return []
      }
      const candidate = entry as Partial<PresenceDialogueHistoryEntry>
      const at = finiteTimestamp(candidate.at)
      if (
        at === null ||
        typeof candidate.dialogueId !== 'string' ||
        typeof candidate.textHash !== 'string' ||
        !candidate.textHash ||
        !Array.isArray(candidate.tags)
      ) {
        return []
      }
      return [
        {
          at,
          dialogueId: candidate.dialogueId.slice(0, 160),
          textHash: candidate.textHash.slice(0, 128),
          tags: candidate.tags.filter(isPresenceTag).slice(0, PRESENCE_TAGS.length),
        },
      ]
    })
    .sort((left, right) => left.at - right.at)
    .slice(-MAX_RECENT_PRESENCE_DIALOGUES)
}

function normalizeTagTimestamps(value: unknown): Partial<Record<PresenceTag, number>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([tag, timestamp]) => {
      const at = finiteTimestamp(timestamp)
      return isPresenceTag(tag) && at !== null ? [[tag, at]] : []
    }),
  )
}

function finiteTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function isPresenceTag(value: unknown): value is PresenceTag {
  return typeof value === 'string' && PRESENCE_TAGS.includes(value as PresenceTag)
}

function isSceneKind(value: unknown): value is SceneKind {
  return typeof value === 'string' && SCENE_KINDS.includes(value as SceneKind)
}

function isTimePeriod(value: unknown): value is TimePeriod {
  return typeof value === 'string' && TIME_PERIODS.includes(value as TimePeriod)
}

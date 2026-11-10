import {
  EPISODIC_MEMORY_KINDS,
  PRESENCE_TAGS,
  type EpisodicMemory,
  type EpisodicMemoryKind,
  type EpisodicMemoryState,
  type PresenceTag,
} from '../../shared/presence'
import type { SceneKind, TimeSceneContext } from '../../shared/time-scene'

export const MAX_EPISODIC_MEMORIES = 100
export const DEFAULT_MEMORY_RETENTION_MS = 30 * 24 * 60 * 60_000
const RETURN_MEMORY_WINDOW_MS = 7 * 24 * 60 * 60_000
const MAX_RETURN_SIGNALS = 20

export interface MemoryStateWithSignals extends EpisodicMemoryState {
  recentReturnTimes: number[]
}

export type EpisodicMemoryEvent =
  | {
      type: 'long_focus'
      eventId: string
      at: number
      scene: TimeSceneContext
      durationMs: number
    }
  | {
      type: 'late_night_work'
      eventId: string
      at: number
      scene: TimeSceneContext
    }
  | {
      type: 'return'
      eventId: string
      at: number
      awayMs: number
    }
  | {
      type: 'relationship_milestone'
      eventId: string
      at: number
      affectionLevel: number
    }

export function createEmptyEpisodicMemoryState(): MemoryStateWithSignals {
  return {
    schemaVersion: 1,
    memories: [],
    recentReturnTimes: [],
  }
}

export function normalizeEpisodicMemoryState(
  raw: unknown,
  now = Date.now(),
): MemoryStateWithSignals {
  const fallback = createEmptyEpisodicMemoryState()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fallback
  }
  const value = raw as Partial<MemoryStateWithSignals>
  const memories = Array.isArray(value.memories)
    ? value.memories
        .flatMap((entry) => normalizeMemory(entry))
        .filter((entry) => entry.expiresAt === null || entry.expiresAt > now)
        .sort(compareMemoryPriority)
        .slice(0, MAX_EPISODIC_MEMORIES)
    : []
  const recentReturnTimes = Array.isArray(value.recentReturnTimes)
    ? value.recentReturnTimes
        .filter(
          (timestamp): timestamp is number =>
            typeof timestamp === 'number' &&
            Number.isFinite(timestamp) &&
            timestamp > 0 &&
            now - timestamp < RETURN_MEMORY_WINDOW_MS,
        )
        .sort((left, right) => left - right)
        .slice(-MAX_RETURN_SIGNALS)
    : []
  return {
    schemaVersion: 1,
    memories,
    recentReturnTimes,
  }
}

export function recordEpisodicMemory(
  state: MemoryStateWithSignals,
  event: EpisodicMemoryEvent,
): MemoryStateWithSignals {
  const normalized = normalizeEpisodicMemoryState(state, event.at)
  if (event.type === 'return') {
    normalized.recentReturnTimes = [
      ...normalized.recentReturnTimes.filter(
        (timestamp) => event.at - timestamp < RETURN_MEMORY_WINDOW_MS,
      ),
      event.at,
    ].slice(-MAX_RETURN_SIGNALS)
    if (normalized.recentReturnTimes.length < 3) {
      return normalized
    }
  }

  const descriptor = describeMemoryEvent(
    event,
    event.type === 'return' ? normalized.recentReturnTimes.length : 0,
  )
  const existing = normalized.memories.find((memory) => memory.dedupeKey === descriptor.dedupeKey)
  const expiresAt =
    descriptor.kind === 'relationship_milestone'
      ? null
      : Math.max(event.at + DEFAULT_MEMORY_RETENTION_MS, existing?.expiresAt ?? 0)
  const sources = [...(existing?.sourceEventIds ?? []), event.eventId].slice(-12)
  const evidenceCount =
    event.type === 'return'
      ? Math.min(99, normalized.recentReturnTimes.length)
      : Math.min(99, (existing?.evidenceCount ?? 0) + 1)
  const memory: EpisodicMemory = {
    id: existing?.id ?? descriptor.id,
    kind: descriptor.kind,
    dedupeKey: descriptor.dedupeKey,
    summary: descriptor.summary(evidenceCount),
    tags: descriptor.tags,
    importance: Math.min(1, descriptor.importance + (evidenceCount - 1) * 0.04),
    createdAt: existing?.createdAt ?? event.at,
    updatedAt: event.at,
    lastReferencedAt: existing?.lastReferencedAt ?? null,
    expiresAt,
    sourceEventIds: [...new Set(sources)],
    evidenceCount,
  }
  const memories = existing
    ? normalized.memories.map((entry) => (entry.id === existing.id ? memory : entry))
    : [...normalized.memories, memory]
  return {
    ...normalized,
    memories: memories.sort(compareMemoryPriority).slice(0, MAX_EPISODIC_MEMORIES),
  }
}

export function pruneEpisodicMemories(
  state: MemoryStateWithSignals,
  now = Date.now(),
): MemoryStateWithSignals {
  return normalizeEpisodicMemoryState(state, now)
}

export function retrieveEpisodicMemories(
  state: MemoryStateWithSignals,
  query: {
    now: number
    tags: PresenceTag[]
    limit?: number
    markReferenced?: boolean
  },
): {
  state: MemoryStateWithSignals
  memories: EpisodicMemory[]
} {
  const normalized = pruneEpisodicMemories(state, query.now)
  const queryTags = new Set(query.tags)
  const scored = normalized.memories
    .map((memory) => {
      const overlap = memory.tags.filter((tag) => queryTags.has(tag)).length
      const tagMatch = overlap / Math.max(1, new Set([...memory.tags, ...query.tags]).size)
      const ageDays = Math.max(0, (query.now - memory.updatedAt) / 86_400_000)
      const recency = Math.max(0, 1 - ageDays / 30)
      const novelty =
        memory.lastReferencedAt === null
          ? 1
          : Math.max(0, 1 - (query.now - memory.lastReferencedAt) / (7 * 86_400_000))
      return {
        memory,
        score: 0.45 * tagMatch + 0.3 * recency + 0.2 * memory.importance + 0.05 * novelty,
      }
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, query.limit ?? 5))
  if (query.markReferenced) {
    const selectedIds = new Set(scored.map((entry) => entry.memory.id))
    normalized.memories = normalized.memories.map((memory) =>
      selectedIds.has(memory.id) ? { ...memory, lastReferencedAt: query.now } : memory,
    )
  }
  return {
    state: normalized,
    memories: scored.map((entry) => structuredClone(entry.memory)),
  }
}

export function markMemoriesReferenced(
  state: MemoryStateWithSignals,
  ids: readonly string[],
  now = Date.now(),
): MemoryStateWithSignals {
  if (ids.length === 0) {
    return state
  }
  const referencedIds = new Set(ids)
  return {
    ...state,
    memories: state.memories.map((memory) =>
      referencedIds.has(memory.id) ? { ...memory, lastReferencedAt: now } : memory,
    ),
  }
}

export function deleteEpisodicMemory(
  state: MemoryStateWithSignals,
  id: string,
): MemoryStateWithSignals {
  return {
    ...state,
    memories: state.memories.filter((memory) => memory.id !== id),
  }
}

export function clearEpisodicMemories(_state: MemoryStateWithSignals): MemoryStateWithSignals {
  return createEmptyEpisodicMemoryState()
}

function describeMemoryEvent(
  event: EpisodicMemoryEvent,
  returnSignalCount = 0,
): {
  id: string
  kind: EpisodicMemoryKind
  dedupeKey: string
  importance: number
  tags: PresenceTag[]
  summary: (evidenceCount: number) => string
} {
  if (event.type === 'long_focus') {
    const minutes = Math.max(30, Math.round(event.durationMs / 60_000))
    return {
      id: `memory:long-focus:${event.scene.localDate}:${event.scene.scene}`,
      kind: 'long_focus',
      dedupeKey: `long_focus:${event.scene.localDate}:${event.scene.scene}`,
      importance: 0.55,
      tags: ['focus', 'rest'],
      summary: (count) =>
        `老师在${sceneLabel(event.scene.scene)}中持续专注约 ${minutes} 分钟` +
        (count > 1 ? `（已观察 ${count} 次）` : ''),
    }
  }
  if (event.type === 'late_night_work') {
    return {
      id: `memory:late-night:${event.scene.localDate}`,
      kind: 'late_night_work',
      dedupeKey: `late_night:${event.scene.localDate}`,
      importance: 0.7,
      tags: ['late_night', 'rest'],
      summary: (count) =>
        `老师曾在深夜继续使用${sceneLabel(event.scene.scene)}` +
        (count > 1 ? `（已记录 ${count} 次）` : ''),
    }
  }
  if (event.type === 'return') {
    return {
      id: 'memory:frequent-return-week',
      kind: 'frequent_return',
      dedupeKey: 'frequent_return:week',
      importance: 0.45,
      tags: ['return'],
      summary: (count) =>
        Math.max(count, returnSignalCount) >= 3
          ? `本周老师已有 ${Math.max(count, returnSignalCount)} 次较长时间离开后返回`
          : '老师在一次较长时间离开后回到了电脑前',
    }
  }
  return {
    id: `memory:relationship:${event.affectionLevel}`,
    kind: 'relationship_milestone',
    dedupeKey: `relationship:${event.affectionLevel}`,
    importance: 0.9,
    tags: ['affection'],
    summary: () => `与老师的关系达到了好感等级 ${event.affectionLevel}`,
  }
}

function normalizeMemory(raw: unknown): EpisodicMemory[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return []
  }
  const value = raw as Partial<EpisodicMemory>
  if (
    typeof value.id !== 'string' ||
    !isMemoryKind(value.kind) ||
    typeof value.dedupeKey !== 'string' ||
    typeof value.summary !== 'string' ||
    !Array.isArray(value.tags) ||
    typeof value.createdAt !== 'number' ||
    !Number.isFinite(value.createdAt) ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt)
  ) {
    return []
  }
  const expiresAt =
    value.expiresAt === null
      ? null
      : typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt)
        ? value.expiresAt
        : value.updatedAt + DEFAULT_MEMORY_RETENTION_MS
  return [
    {
      id: value.id.slice(0, 160),
      kind: value.kind,
      dedupeKey: value.dedupeKey.slice(0, 200),
      summary: value.summary.replace(/\s+/gu, ' ').trim().slice(0, 240),
      tags: value.tags.filter(isPresenceTag).slice(0, PRESENCE_TAGS.length),
      importance:
        typeof value.importance === 'number' && Number.isFinite(value.importance)
          ? Math.min(1, Math.max(0, value.importance))
          : 0.5,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      lastReferencedAt:
        typeof value.lastReferencedAt === 'number' && Number.isFinite(value.lastReferencedAt)
          ? value.lastReferencedAt
          : null,
      expiresAt,
      sourceEventIds: Array.isArray(value.sourceEventIds)
        ? value.sourceEventIds
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
            .slice(-12)
        : [],
      evidenceCount:
        typeof value.evidenceCount === 'number' && Number.isFinite(value.evidenceCount)
          ? Math.max(1, Math.min(99, Math.floor(value.evidenceCount)))
          : 1,
    },
  ]
}

function compareMemoryPriority(left: EpisodicMemory, right: EpisodicMemory): number {
  if (right.importance !== left.importance) {
    return right.importance - left.importance
  }
  return right.updatedAt - left.updatedAt
}

function sceneLabel(scene: SceneKind): string {
  const labels: Record<SceneKind, string> = {
    browser: '浏览器',
    focus: '文档与笔记',
    development: '开发工作',
    communication: '沟通应用',
    media: '影音应用',
    desktop: '桌面',
    system: '系统设置',
    other: '其他应用',
    unknown: '未知场景',
  }
  return labels[scene]
}

function isMemoryKind(value: unknown): value is EpisodicMemoryKind {
  return typeof value === 'string' && EPISODIC_MEMORY_KINDS.includes(value as EpisodicMemoryKind)
}

function isPresenceTag(value: unknown): value is PresenceTag {
  return typeof value === 'string' && PRESENCE_TAGS.includes(value as PresenceTag)
}

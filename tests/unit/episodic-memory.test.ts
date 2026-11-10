import { describe, expect, it } from 'vitest'
import { createTimeSceneContext } from '../../src/shared/time-scene'
import {
  createEmptyEpisodicMemoryState,
  MAX_EPISODIC_MEMORIES,
  markMemoriesReferenced,
  normalizeEpisodicMemoryState,
  recordEpisodicMemory,
  retrieveEpisodicMemories,
} from '../../src/main/presence/episodic-memory'

const BASE_TIME = new Date('2026-10-25T23:00:00+08:00').getTime()

function scene(offsetMs = 0, app = 'Visual Studio Code') {
  return createTimeSceneContext(new Date(BASE_TIME + offsetMs), app, 0, {
    onBatteryPower: false,
    screenLocked: false,
    suspended: false,
  })
}

describe('episodic memory', () => {
  it('creates and merges a structured long-focus memory without raw app text', () => {
    const first = recordEpisodicMemory(createEmptyEpisodicMemoryState(), {
      type: 'long_focus',
      eventId: 'event-1',
      at: BASE_TIME,
      scene: scene(),
      durationMs: 95 * 60_000,
    })
    const merged = recordEpisodicMemory(first, {
      type: 'long_focus',
      eventId: 'event-2',
      at: BASE_TIME + 60_000,
      scene: scene(60_000),
      durationMs: 110 * 60_000,
    })

    expect(merged.memories).toHaveLength(1)
    expect(merged.memories[0]).toMatchObject({
      kind: 'long_focus',
      evidenceCount: 2,
      tags: ['focus', 'rest'],
    })
    expect(merged.memories[0]?.summary).toContain('开发工作')
    expect(merged.memories[0]?.summary).not.toContain('Visual Studio Code')
    expect(merged.memories[0]?.importance).toBeGreaterThan(first.memories[0]?.importance ?? 0)
  })

  it('only creates frequent-return memory after three recent returns', () => {
    let state = createEmptyEpisodicMemoryState()
    state = recordEpisodicMemory(state, {
      type: 'return',
      eventId: 'return-1',
      at: BASE_TIME,
      awayMs: 20 * 60_000,
    })
    state = recordEpisodicMemory(state, {
      type: 'return',
      eventId: 'return-2',
      at: BASE_TIME + 1_000,
      awayMs: 30 * 60_000,
    })
    expect(state.memories).toHaveLength(0)

    state = recordEpisodicMemory(state, {
      type: 'return',
      eventId: 'return-3',
      at: BASE_TIME + 2_000,
      awayMs: 40 * 60_000,
    })

    expect(state.memories[0]).toMatchObject({
      kind: 'frequent_return',
      evidenceCount: 3,
    })
    expect(state.memories[0]?.summary).toContain('3 次')
  })

  it('keeps relationship milestones permanent and prunes ordinary memories', () => {
    const relationship = recordEpisodicMemory(createEmptyEpisodicMemoryState(), {
      type: 'relationship_milestone',
      eventId: 'relationship-5',
      at: BASE_TIME,
      affectionLevel: 5,
    })
    expect(relationship.memories[0]?.expiresAt).toBeNull()

    const expired = normalizeEpisodicMemoryState(
      {
        schemaVersion: 1,
        recentReturnTimes: [],
        memories: [
          {
            ...relationship.memories[0],
            id: 'expired',
            kind: 'late_night_work',
            dedupeKey: 'expired',
            expiresAt: BASE_TIME - 1,
          },
        ],
      },
      BASE_TIME,
    )
    expect(expired.memories).toEqual([])
  })

  it('retrieves by tag, recency and importance and can mark references', () => {
    let state = recordEpisodicMemory(createEmptyEpisodicMemoryState(), {
      type: 'late_night_work',
      eventId: 'late',
      at: BASE_TIME,
      scene: scene(),
    })
    state = recordEpisodicMemory(state, {
      type: 'relationship_milestone',
      eventId: 'relationship',
      at: BASE_TIME + 1_000,
      affectionLevel: 6,
    })

    const result = retrieveEpisodicMemories(state, {
      now: BASE_TIME + 2_000,
      tags: ['late_night'],
      limit: 2,
      markReferenced: true,
    })

    expect(result.memories[0]?.kind).toBe('late_night_work')
    expect(
      result.state.memories.find((memory) => memory.kind === 'late_night_work')?.lastReferencedAt,
    ).toBe(BASE_TIME + 2_000)
  })

  it('marks only explicitly referenced memories', () => {
    let state = recordEpisodicMemory(createEmptyEpisodicMemoryState(), {
      type: 'late_night_work',
      eventId: 'late',
      at: BASE_TIME,
      scene: scene(),
    })
    state = recordEpisodicMemory(state, {
      type: 'relationship_milestone',
      eventId: 'relationship',
      at: BASE_TIME + 1_000,
      affectionLevel: 6,
    })
    const referencedId = state.memories.find((memory) => memory.kind === 'late_night_work')?.id

    const marked = markMemoriesReferenced(
      state,
      referencedId ? [referencedId] : [],
      BASE_TIME + 5_000,
    )

    expect(marked.memories.find((memory) => memory.id === referencedId)?.lastReferencedAt).toBe(
      BASE_TIME + 5_000,
    )
    expect(
      marked.memories.find((memory) => memory.kind === 'relationship_milestone')?.lastReferencedAt,
    ).toBeNull()
  })

  it('caps normalized memory count at one hundred', () => {
    const memories = Array.from({ length: 120 }, (_, index) => ({
      id: `memory-${index}`,
      kind: 'late_night_work' as const,
      dedupeKey: `key-${index}`,
      summary: `记忆 ${index}`,
      tags: ['late_night' as const],
      importance: index / 120,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME + index,
      lastReferencedAt: null,
      expiresAt: BASE_TIME + 30 * 24 * 60 * 60_000,
      sourceEventIds: [`event-${index}`],
      evidenceCount: 1,
    }))

    expect(
      normalizeEpisodicMemoryState({ schemaVersion: 1, memories, recentReturnTimes: [] }, BASE_TIME)
        .memories,
    ).toHaveLength(MAX_EPISODIC_MEMORIES)
  })
})

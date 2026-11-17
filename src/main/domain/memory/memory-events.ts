import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  MEMORY_EVENT_KINDS,
  type MemoryEventKind,
  type MemoryEventView,
} from '../../../shared/memory'

const MAX_EVENTS = 500

interface StoredMemoryEvent extends MemoryEventView {}

interface MemoryEventFile {
  schemaVersion: number
  events: StoredMemoryEvent[]
}

function isEventKind(value: unknown): value is MemoryEventKind {
  return typeof value === 'string' && (MEMORY_EVENT_KINDS as readonly string[]).includes(value)
}

function normalizeEvent(value: unknown): StoredMemoryEvent | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const event = value as Partial<StoredMemoryEvent>
  if (
    typeof event.id !== 'string' ||
    !isEventKind(event.kind) ||
    typeof event.at !== 'number' ||
    typeof event.summary !== 'string' ||
    !event.summary.trim()
  ) {
    return null
  }
  return {
    id: event.id,
    kind: event.kind,
    at: event.at,
    summary: Array.from(event.summary.trim()).slice(0, 120).join(''),
    importance:
      typeof event.importance === 'number' && Number.isFinite(event.importance)
        ? Math.min(5, Math.max(1, Math.round(event.importance)))
        : 1,
  }
}

/** 跨模块的统一记忆事件流：换装、专注、提醒、贴纸都写进这里。 */
export class MemoryEventStore {
  private readonly filePath: string
  private events: StoredMemoryEvent[] = []

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'memory', 'events.json')
    this.load()
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return
    }
    try {
      const data = JSON.parse(readFileSync(this.filePath, 'utf8')) as MemoryEventFile
      this.events = Array.isArray(data.events)
        ? data.events.map(normalizeEvent).filter((event): event is StoredMemoryEvent => !!event)
        : []
    } catch {
      this.events = []
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(
      this.filePath,
      JSON.stringify({ schemaVersion: 1, events: this.events }, null, 2) + '\n',
    )
  }

  record(input: {
    kind: MemoryEventKind
    summary: string
    at?: number
    importance?: number
  }): MemoryEventView | null {
    const event = normalizeEvent({
      id: randomUUID(),
      kind: input.kind,
      at: input.at ?? Date.now(),
      summary: input.summary,
      importance: input.importance ?? 1,
    })
    if (!event) {
      return null
    }
    this.events = [...this.events, event].slice(-MAX_EVENTS)
    this.persist()
    return event
  }

  list(limit = 200): MemoryEventView[] {
    return this.events.slice(-Math.max(0, limit)).reverse()
  }

  clear(): void {
    this.events = []
    this.persist()
  }
}

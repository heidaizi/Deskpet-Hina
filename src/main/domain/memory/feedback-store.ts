import { existsSync, readFileSync } from 'node:fs'
import { backupBrokenFile, writeJsonAtomic } from '../persistent-stores'

const MAX_EVENTS = 500
export const FEEDBACK_WINDOW_MS = 30_000

export type FeedbackKind = 'engaged' | 'ignored' | 'interrupted'

export interface FeedbackEvent {
  id: string
  at: number
  ruleId: string
  scene: string
  kind: FeedbackKind
  latencyMs: number
}

interface FeedbackFile {
  schemaVersion: 1
  events: FeedbackEvent[]
}

interface PendingDelivery {
  ruleId: string
  scene: string
  at: number
  deadline: number
}

function isEvent(value: unknown): value is FeedbackEvent {
  if (!value || typeof value !== 'object') {
    return false
  }
  const event = value as Partial<FeedbackEvent>
  return (
    typeof event.id === 'string' &&
    typeof event.at === 'number' &&
    typeof event.ruleId === 'string' &&
    typeof event.scene === 'string' &&
    (event.kind === 'engaged' || event.kind === 'ignored' || event.kind === 'interrupted') &&
    typeof event.latencyMs === 'number'
  )
}

/**
 * 反馈采集（阶段 1 只记录，不影响决策）。
 *
 * 每次主动演出都会建立一个 30 秒的观察窗口：
 * - 窗口内用户有交互 → engaged
 * - 语音被用户打断 → interrupted
 * - 窗口结束仍无反应 → ignored
 */
export class FeedbackStore {
  private events: FeedbackEvent[] = []
  private pending: PendingDelivery | null = null

  constructor(private readonly filePath: string) {
    this.load()
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return
    }
    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      const file = raw as Partial<FeedbackFile>
      this.events = Array.isArray(file.events) ? file.events.filter(isEvent).slice(-MAX_EVENTS) : []
    } catch (error) {
      console.error('Feedback history was invalid and has been reset:', error)
      backupBrokenFile(this.filePath)
      this.events = []
    }
  }

  private persist(): void {
    try {
      writeJsonAtomic(this.filePath, {
        schemaVersion: 1,
        events: this.events,
      } satisfies FeedbackFile)
    } catch (error) {
      console.error('Failed to persist feedback history:', error)
    }
  }

  noteDelivery(ruleId: string, scene: string, now = Date.now()): void {
    this.settleExpired(now)
    this.pending = {
      ruleId,
      scene,
      at: now,
      deadline: now + FEEDBACK_WINDOW_MS,
    }
  }

  noteInteraction(now = Date.now()): void {
    if (!this.pending) {
      return
    }
    this.record(this.pending, 'engaged', now)
    this.pending = null
  }

  noteInterruption(now = Date.now()): void {
    if (!this.pending) {
      return
    }
    this.record(this.pending, 'interrupted', now)
    this.pending = null
  }

  settleExpired(now = Date.now()): void {
    if (!this.pending || now < this.pending.deadline) {
      return
    }
    this.record(this.pending, 'ignored', this.pending.deadline)
    this.pending = null
  }

  private record(pending: PendingDelivery, kind: FeedbackKind, at: number): void {
    this.events.push({
      id: `${at}-${this.events.length}`,
      at,
      ruleId: pending.ruleId,
      scene: pending.scene,
      kind,
      latencyMs: Math.max(0, at - pending.at),
    })
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS)
    }
    this.persist()
  }

  list(limit = 50): FeedbackEvent[] {
    return this.events.slice(-limit)
  }

  summary(): { engaged: number; ignored: number; interrupted: number; total: number } {
    const summary = { engaged: 0, ignored: 0, interrupted: 0, total: this.events.length }
    for (const event of this.events) {
      summary[event.kind] += 1
    }
    return summary
  }

  clear(): void {
    this.events = []
    this.pending = null
    this.persist()
  }
}

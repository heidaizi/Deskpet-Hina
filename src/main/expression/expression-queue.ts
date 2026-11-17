import { randomUUID } from 'node:crypto'
import type { RendererCommand } from '../../shared/types'

export type ExpressionSource = 'system' | 'chat' | 'routine' | 'greeting' | 'presence'

export const EXPRESSION_PRIORITY: Record<ExpressionSource, number> = {
  system: 100,
  chat: 90,
  routine: 70,
  greeting: 50,
  presence: 40,
}

export interface ExpressionSegment {
  command: Omit<RendererCommand, 'deliveryId'> & { deliveryId?: string }
  /** 极端情况下没有收到播放完成事件时的兜底。 */
  fallbackMs?: number
}

export interface ExpressionRequest {
  source: ExpressionSource
  priority?: number
  segments: ExpressionSegment[]
  ttlMs?: number
  interruptible?: boolean
  onSegmentStart?: (index: number) => void
  onFinished?: () => void
}

interface PendingRequest {
  id: string
  request: ExpressionRequest
  createdAt: number
}

interface ActiveRequest extends PendingRequest {
  index: number
  deliveryId: string | null
  fallbackTimer: NodeJS.Timeout | null
}

function segmentFallbackMs(command: ExpressionSegment['command']): number {
  const text = command.spokenText ?? command.dialogue ?? ''
  return Math.min(15_000, Math.max(2_000, 1_500 + Array.from(text).length * 180))
}

/** 主进程唯一的语音/气泡出口：一次只让一个模块说话。 */
export class ExpressionQueue {
  private current: ActiveRequest | null = null
  private pending: PendingRequest[] = []
  private gapTimer: NodeJS.Timeout | null = null
  private generation = 0

  constructor(
    private readonly send: (command: RendererCommand) => void,
    private readonly gapMs = 700,
  ) {}

  enqueue(request: ExpressionRequest): void {
    if (request.segments.length === 0) {
      return
    }
    const item: PendingRequest = {
      id: randomUUID(),
      request,
      createdAt: Date.now(),
    }
    const priority = request.priority ?? EXPRESSION_PRIORITY[request.source]
    if (!this.current) {
      this.start(item)
      return
    }
    const currentPriority =
      this.current.request.priority ?? EXPRESSION_PRIORITY[this.current.request.source]
    if (priority > currentPriority && request.interruptible !== false) {
      this.stopCurrent()
      this.start(item)
      return
    }
    this.pending.push(item)
    this.pending.sort((a, b) => {
      const priorityA = a.request.priority ?? EXPRESSION_PRIORITY[a.request.source]
      const priorityB = b.request.priority ?? EXPRESSION_PRIORITY[b.request.source]
      return priorityB - priorityA || a.createdAt - b.createdAt
    })
  }

  /** 渲染进程或 Presence 在真实播放结束后调用。 */
  settle(deliveryId: string): void {
    const current = this.current
    if (!current || current.deliveryId !== deliveryId) {
      return
    }
    if (current.fallbackTimer) {
      clearTimeout(current.fallbackTimer)
      current.fallbackTimer = null
    }
    if (this.gapTimer) {
      clearTimeout(this.gapTimer)
    }
    this.gapTimer = setTimeout(() => {
      this.gapTimer = null
      this.advance()
    }, this.gapMs)
  }

  cancel(source?: ExpressionSource): void {
    this.generation += 1
    if (this.gapTimer) {
      clearTimeout(this.gapTimer)
      this.gapTimer = null
    }
    if (this.current && (!source || this.current.request.source === source)) {
      this.stopCurrent()
    }
    if (source) {
      this.pending = this.pending.filter((item) => item.request.source !== source)
    } else {
      this.pending = []
    }
    if (!this.current) {
      this.startNext()
    }
  }

  /** 语音被外部命令/用户打断：清掉当前与待播，避免继续插话。 */
  interrupt(deliveryId: string): void {
    if (this.current?.deliveryId !== deliveryId) {
      return
    }
    if (this.gapTimer) {
      clearTimeout(this.gapTimer)
      this.gapTimer = null
    }
    this.stopCurrent()
    this.pending = []
  }

  isBusy(): boolean {
    return this.current !== null
  }

  private stopCurrent(): void {
    if (!this.current) {
      return
    }
    if (this.current.fallbackTimer) {
      clearTimeout(this.current.fallbackTimer)
    }
    this.current = null
  }

  private start(item: PendingRequest): void {
    if (item.request.ttlMs && Date.now() - item.createdAt > item.request.ttlMs) {
      this.startNext()
      return
    }
    const active: ActiveRequest = {
      ...item,
      index: 0,
      deliveryId: null,
      fallbackTimer: null,
    }
    this.current = active
    this.startSegment()
  }

  private startSegment(): void {
    const active = this.current
    if (!active) {
      return
    }
    const segment = active.request.segments[active.index]
    if (!segment) {
      this.finishCurrent()
      return
    }
    const deliveryId = segment.command.deliveryId ?? `expr:${active.id}:${active.index}`
    active.deliveryId = deliveryId
    active.fallbackTimer = setTimeout(
      () => this.settle(deliveryId),
      segment.fallbackMs ?? segmentFallbackMs(segment.command),
    )
    active.fallbackTimer.unref?.()
    active.request.onSegmentStart?.(active.index)
    try {
      this.send({ ...segment.command, deliveryId })
    } catch {
      this.settle(deliveryId)
    }
  }

  private advance(): void {
    const active = this.current
    if (!active || this.generation < 0) {
      return
    }
    if (active.fallbackTimer) {
      clearTimeout(active.fallbackTimer)
      active.fallbackTimer = null
    }
    active.index += 1
    if (active.index >= active.request.segments.length) {
      this.finishCurrent()
      return
    }
    this.startSegment()
  }

  private finishCurrent(): void {
    const active = this.current
    if (!active) {
      return
    }
    if (active.fallbackTimer) {
      clearTimeout(active.fallbackTimer)
    }
    this.current = null
    active.request.onFinished?.()
    this.startNext()
  }

  private startNext(): void {
    while (this.pending.length > 0) {
      const next = this.pending.shift()!
      if (next.request.ttlMs && Date.now() - next.createdAt > next.request.ttlMs) {
        continue
      }
      this.start(next)
      return
    }
  }
}

let queue: ExpressionQueue | null = null

export function configureExpressionQueue(send: (command: RendererCommand) => void): void {
  queue = new ExpressionQueue(send)
}

export function enqueueExpression(request: ExpressionRequest): void {
  queue?.enqueue(request)
}

export function settleExpressionDelivery(deliveryId: string): void {
  queue?.settle(deliveryId)
}

export function interruptExpression(deliveryId: string): void {
  queue?.interrupt(deliveryId)
}

export function cancelExpressions(source?: ExpressionSource): void {
  queue?.cancel(source)
}

export function expressionQueueBusy(): boolean {
  return queue?.isBusy() ?? false
}

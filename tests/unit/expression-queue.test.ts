import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExpressionQueue, EXPRESSION_PRIORITY } from '../../src/main/expression/expression-queue'
import type { RendererCommand } from '../../src/shared/types'

const segment = (dialogue: string) => ({
  command: { action: 'idle' as const, dialogue, spokenText: dialogue },
})

describe('expression queue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-16T12:00:00+08:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('plays segments one by one after real completion events', () => {
    const sent: RendererCommand[] = []
    const queue = new ExpressionQueue((command) => sent.push(command), 700)
    queue.enqueue({
      source: 'chat',
      segments: [segment('第一段'), segment('第二段')],
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].dialogue).toBe('第一段')

    queue.settle(sent[0].deliveryId!)
    vi.advanceTimersByTime(699)
    expect(sent).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(sent).toHaveLength(2)
    expect(sent[1].dialogue).toBe('第二段')

    queue.settle(sent[1].deliveryId!)
    vi.advanceTimersByTime(700)
    expect(queue.isBusy()).toBe(false)
  })

  it('lets chat preempt a speaking presence line', () => {
    const sent: RendererCommand[] = []
    const queue = new ExpressionQueue((command) => sent.push(command), 700)
    queue.enqueue({ source: 'presence', segments: [segment('陪伴')] })
    expect(sent).toHaveLength(1)

    queue.enqueue({
      source: 'chat',
      priority: EXPRESSION_PRIORITY.chat,
      segments: [segment('聊天')],
    })
    expect(sent).toHaveLength(2)
    expect(sent[1].dialogue).toBe('聊天')
  })

  it('queues lower priority lines instead of interrupting chat', () => {
    const sent: RendererCommand[] = []
    const queue = new ExpressionQueue((command) => sent.push(command), 700)
    queue.enqueue({ source: 'chat', segments: [segment('聊天')] })
    queue.enqueue({ source: 'routine', segments: [segment('提醒')] })
    expect(sent).toHaveLength(1)

    queue.settle(sent[0].deliveryId!)
    vi.advanceTimersByTime(700)
    expect(sent).toHaveLength(2)
    expect(sent[1].dialogue).toBe('提醒')
  })

  it('drops expired queued reminders', () => {
    const sent: RendererCommand[] = []
    const queue = new ExpressionQueue((command) => sent.push(command), 700)
    queue.enqueue({ source: 'chat', segments: [segment('聊天')] })
    queue.enqueue({ source: 'routine', ttlMs: 100, segments: [segment('过期提醒')] })
    vi.advanceTimersByTime(200)
    queue.settle(sent[0].deliveryId!)
    vi.advanceTimersByTime(700)
    expect(sent).toHaveLength(1)
    expect(queue.isBusy()).toBe(false)
  })

  it('drops current and pending when an external command interrupts', () => {
    const sent: RendererCommand[] = []
    const queue = new ExpressionQueue((command) => sent.push(command), 700)
    queue.enqueue({ source: 'chat', segments: [segment('聊天')] })
    queue.enqueue({ source: 'routine', segments: [segment('提醒')] })
    queue.interrupt(sent[0].deliveryId!)
    vi.advanceTimersByTime(2_000)
    expect(queue.isBusy()).toBe(false)
    expect(sent).toHaveLength(1)
  })

  it('cancels only the requested source', () => {
    const sent: RendererCommand[] = []
    const queue = new ExpressionQueue((command) => sent.push(command), 700)
    queue.enqueue({ source: 'chat', segments: [segment('聊天 A')] })
    queue.enqueue({ source: 'chat', segments: [segment('聊天 B')] })
    queue.cancel('chat')
    vi.advanceTimersByTime(1_000)
    expect(queue.isBusy()).toBe(false)
    expect(sent).toHaveLength(1)
  })
})

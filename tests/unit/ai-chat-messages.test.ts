import { describe, expect, it } from 'vitest'
import {
  buildChatMessages,
  buildChatRequestMessages,
  buildProactiveRequestMessages,
} from '../../src/main/domain/deepseek-client'

const context = {
  scene: 'development' as const,
  timePeriod: 'afternoon' as const,
  localTime: '2026-11-04T15:20:00',
  isWeekend: false,
  selectedText: 'const timer = setTimeout(() => save(), 300)',
}

describe('chat message assembly', () => {
  it('sends system + current context without history', () => {
    const messages = buildChatMessages(context)
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toContain('approved_context')
  })

  it('places history between the system prompt and the current turn', () => {
    const messages = buildChatMessages(context, [
      { role: 'user', content: '上一轮的问题' },
      { role: 'assistant', content: '上一轮的回答' },
    ])
    expect(messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(messages[1].content).toBe('上一轮的问题')
    expect(messages[2].content).toBe('上一轮的回答')
    expect(messages[3].content).toContain('approved_context')
  })

  it('keeps the history overhead under 30% of the base request', () => {
    const base = buildChatMessages(context)
    const baseChars = base.reduce((sum, message) => sum + Array.from(message.content).length, 0)

    const history = Array.from({ length: 4 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: '讨论过的内容'.repeat(6),
    }))
    const withHistory = buildChatMessages(context, history)
    const withHistoryChars = withHistory.reduce(
      (sum, message) => sum + Array.from(message.content).length,
      0,
    )

    expect(withHistoryChars - baseChars).toBeLessThanOrEqual(baseChars * 0.3)
  })

  it('does not leak unrelated fields into the request', () => {
    const messages = buildChatMessages(context, [])
    expect(messages[1].content).not.toContain('apiKey')
  })
})

describe('chat request assembly', () => {
  it('keeps history inside the user payload instead of assistant turns', () => {
    const messages = buildChatRequestMessages(
      '刚才那段代码是做什么的？',
      [
        { role: 'user', content: '帮我看下防抖' },
        { role: 'assistant', content: '是一个 300ms 的防抖。' },
      ],
      context,
    )

    expect(messages.map((message) => message.role)).toEqual(['system', 'user'])
    const payload = JSON.parse(messages[1].content) as {
      history: Array<{ speaker: string; text: string }>
      message: string
    }
    expect(payload.history).toEqual([
      { speaker: '老师', text: '帮我看下防抖' },
      { speaker: '日奈', text: '是一个 300ms 的防抖。' },
    ])
    expect(payload.message).toBe('刚才那段代码是做什么的？')
  })

  it('truncates an overlong message to 500 characters', () => {
    const long = '啰'.repeat(700)
    const messages = buildChatRequestMessages(long, [], context)
    const payload = JSON.parse(messages[1].content) as { message: string }
    expect(Array.from(payload.message)).toHaveLength(500)
  })
})

describe('json_object precondition', () => {
  // DeepSeek 在使用 response_format=json_object 时，会要求 prompt 中出现 "json"，
  // 否则直接返回 HTTP 400。三条请求链路都必须满足这个前置条件。
  const proactiveContext = {
    scene: 'development',
    timePeriod: 'afternoon',
    localTime: '15:20:00',
    isWeekend: false,
    emotion: null,
    relationship: 'neutral',
    localTrigger: { ruleId: 'focus-first-milestone', reason: '专注 20 分钟', tags: ['focus'] },
    memories: [],
  } as unknown as Parameters<typeof buildProactiveRequestMessages>[0]

  const builders: Array<[string, () => Array<{ role: string; content: string }>]> = [
    ['reply', () => buildChatMessages(context)],
    ['chat', () => buildChatRequestMessages('在吗', [], context)],
    ['proactive', () => buildProactiveRequestMessages(proactiveContext)],
  ]

  it.each(builders)('%s request keeps the word json in its system prompt', (_name, build) => {
    const messages = build()
    const system = messages.find((message) => message.role === 'system')
    expect(system?.content.toLowerCase()).toContain('json')
  })
})

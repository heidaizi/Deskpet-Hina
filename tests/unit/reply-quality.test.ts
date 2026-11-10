import { describe, expect, it } from 'vitest'
import {
  inspectJapaneseReply,
  qualityRetryInstruction,
  sanitizeJapaneseReply,
} from '../../src/main/domain/reply-quality'

const entries = [
  {
    zh: '空崎日奈',
    ja: '空崎ヒナ',
    aliases: ['日奈'],
    category: 'character' as const,
    confidence: 'high' as const,
  },
]

describe('japanese reply inspection', () => {
  it('accepts a natural short reply', () => {
    expect(inspectJapaneseReply('もう遅いよ。そろそろ寝なさい。', '已经很晚了，去睡吧。')).toEqual(
      [],
    )
  })

  it('flags a leading ellipsis', () => {
    const issues = inspectJapaneseReply('……何してるの？', '在做什么？')
    expect(issues.map((issue) => issue.code)).toContain('leading-ellipsis')
  })

  it('flags leading fillers', () => {
    const issues = inspectJapaneseReply('あの、先生。', '老师。')
    expect(issues.map((issue) => issue.code)).toContain('leading-filler')
  })

  it('flags over-formal short replies', () => {
    const issues = inspectJapaneseReply(
      '先生は何をしているのですか。私は大丈夫です。今日は静かです。',
      '老师在做什么，我没事，今天很安静。',
    )
    expect(issues.map((issue) => issue.code)).toContain('too-formal')
  })

  it('flags replies much longer than the chinese source', () => {
    const issues = inspectJapaneseReply('あ'.repeat(40), '嗯。')
    expect(issues.map((issue) => issue.code)).toContain('too-long')
  })

  it('flags glossary mismatches', () => {
    const issues = inspectJapaneseReply('空崎陽菜はここにいる。', '空崎日奈在这里。', entries)
    expect(issues.map((issue) => issue.code)).toContain('glossary')
  })
})

describe('sanitizing', () => {
  it('strips a leading ellipsis and filler', () => {
    expect(sanitizeJapaneseReply('……あの、何してるの？')).toBe('何してるの？')
    expect(sanitizeJapaneseReply('  ん、そう。')).toBe('そう。')
  })

  it('builds a retry instruction listing the issues', () => {
    const text = qualityRetryInstruction([{ code: 'leading-ellipsis', detail: '句首不能有省略号' }])
    expect(text).toContain('句首不能有省略号')
    expect(text).toContain('JSON')
  })
})

describe('client retry', () => {
  it('retries once when the first japanese reply is unusable', async () => {
    const { DeepSeekClient } = await import('../../src/main/domain/deepseek-client')
    const replies = [
      {
        reply_zh: '在做什么？',
        reply_ja: '……何してるの？',
        emotion: 'neutral',
        action: 'idle',
        confidence: 0.8,
      },
      {
        reply_zh: '在做什么？',
        reply_ja: '何してるの？',
        emotion: 'neutral',
        action: 'idle',
        confidence: 0.8,
      },
    ]
    let call = 0
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(replies[Math.min(call++, 1)]) } }],
      }),
    })) as never

    const client = new DeepSeekClient({ apiKey: 'test', fetchImpl })
    const result = await client.chatReply('在做什么？', [], {} as never)

    expect(result.reply_ja).toBe('何してるの？')
    expect(call).toBe(2)
  })
})

import { describe, expect, it } from 'vitest'
import { buildCapabilityPrompt } from '../../src/main/chat/capability-prompt'

describe('capability prompt', () => {
  it('includes real screen and page data', () => {
    const prompt = buildCapabilityPrompt({
      capabilities: ['screen', 'page'],
      now: new Date('2026-11-10T10:06:00+08:00'),
      screen: {
        app: 'Google Chrome',
        title: '一个视频',
        excerpt: '这是视频简介',
        at: Date.now(),
      },
      vision: { activity: 'video', summary: '正在看科普视频', at: Date.now() },
    })
    expect(prompt).toContain('正在看科普视频')
    expect(prompt).toContain('一个视频')
    expect(prompt).toContain('不要编造')
  })

  it('admits when nothing is available', () => {
    const prompt = buildCapabilityPrompt({ capabilities: ['media'] })
    expect(prompt).toContain('没读到数据')
    expect(prompt).toContain('坦白')
  })

  it('returns empty without capabilities', () => {
    expect(buildCapabilityPrompt({ capabilities: [] })).toBe('')
  })
})

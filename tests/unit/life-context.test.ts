import { describe, expect, it } from 'vitest'
import { buildMediaPrompt, buildSchedulePrompt } from '../../src/main/perception/life-context'

describe('media prompt', () => {
  it('mentions the current track without repeating it', () => {
    const prompt = buildMediaPrompt({ app: 'Music', title: '白日', artist: 'King Gnu' })
    expect(prompt).toContain('白日')
    expect(prompt).toContain('King Gnu')
    expect(prompt).toContain('自然地聊一句')
  })

  it('is empty when nothing is playing', () => {
    expect(buildMediaPrompt(null)).toBe('')
  })
})

describe('schedule prompt', () => {
  it('summarizes events and reminders', () => {
    const prompt = buildSchedulePrompt(
      [
        { kind: 'event', title: '周会', when: '11月10日 10:00' },
        { kind: 'reminder', title: '交周报' },
      ],
      new Date('2026-11-09T12:00:00+08:00'),
    )
    expect(prompt).toContain('11 月 9 日')
    expect(prompt).toContain('周会')
    expect(prompt).toContain('交周报')
    expect(prompt).toContain('不要逐条念')
  })

  it('is empty without items', () => {
    expect(buildSchedulePrompt([], new Date())).toBe('')
  })
})

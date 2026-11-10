import { describe, expect, it } from 'vitest'
import { createHourlyGreetingCandidate } from '../../src/main/presence/presence-rules'

describe('hourly greeting', () => {
  it('greets differently by time of day', () => {
    expect(createHourlyGreetingCandidate(8).spokenText).toContain('おはよう')
    expect(createHourlyGreetingCandidate(12).spokenText).toContain('お昼')
    expect(createHourlyGreetingCandidate(19).spokenText).toContain('お疲れ')
    expect(createHourlyGreetingCandidate(2).spokenText).toContain('起きてる')
  })

  it('stays a low-priority candidate so manners can suppress it', () => {
    const candidate = createHourlyGreetingCandidate(9)
    expect(candidate.priority).toBeLessThanOrEqual(15)
    expect(candidate.cooldownMs).toBeGreaterThanOrEqual(50 * 60_000)
  })
})

describe('page notice', () => {
  it('asks a question about the current page', async () => {
    const { createPageNoticeCandidate } = await import('../../src/main/presence/presence-rules')
    const candidate = createPageNoticeCandidate({
      app: 'Google Chrome',
      title: '为什么一定不能错过2027年',
      url: 'https://example.com/v',
    })
    expect(candidate.dialogue).toContain('2027')
    expect(candidate.priority).toBeGreaterThan(15)
  })
})

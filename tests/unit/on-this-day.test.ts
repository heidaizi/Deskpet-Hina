import { describe, expect, it } from 'vitest'
import { findOnThisDay } from '../../src/main/domain/memory/on-this-day'

const now = new Date(2026, 10, 15, 10, 0).getTime()
const memory = (
  text: string,
  year: number,
  month: number,
  day: number,
): { text: string; at: number } => ({
  text,
  at: new Date(year, month, day, 12, 0).getTime(),
})

describe('on this day', () => {
  it('finds a memory from the same month and day in a previous year', () => {
    expect(
      findOnThisDay([memory('去年的今天', 2025, 10, 15), memory('普通的一天', 2025, 10, 14)], now)
        ?.text,
    ).toBe('去年的今天')
  })

  it('ignores this year and ignores other days', () => {
    expect(findOnThisDay([memory('今年', 2026, 10, 15)], now)).toBeNull()
    expect(findOnThisDay([memory('昨天', 2025, 10, 14)], now)).toBeNull()
  })

  it('prefers the most recent matching year', () => {
    expect(
      findOnThisDay([memory('前年', 2024, 10, 15), memory('去年', 2025, 10, 15)], now)?.text,
    ).toBe('去年')
  })
})

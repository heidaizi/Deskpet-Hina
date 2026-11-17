import { describe, expect, it } from 'vitest'
import {
  calendarThreshold,
  nextSleepDelayMs,
  onThisDayDue,
  sleepDue,
  waterDue,
} from '../../src/main/domain/routine-service'

const at = (hour: number, minute = 0): number => new Date(2026, 10, 15, hour, minute).getTime()

describe('routine timing', () => {
  it('reminds about water only during the day and after the interval', () => {
    expect(waterDue(at(10), at(10) - 89 * 60_000, true)).toBe(false)
    expect(waterDue(at(10), at(10) - 91 * 60_000, true)).toBe(true)
    expect(waterDue(at(10), at(10) - 91 * 60_000, false)).toBe(false)
    expect(waterDue(at(23), at(20), true)).toBe(false)
    expect(waterDue(at(8), at(5), true)).toBe(false)
  })

  it('triggers the sleep reminder once per day after the target time', () => {
    expect(sleepDue(at(23, 29), '23:30', '')).toBe(false)
    expect(sleepDue(at(23, 30), '23:30', '')).toBe(true)
    expect(sleepDue(at(23, 45), '23:30', '2026-11-15')).toBe(false)
    expect(sleepDue(at(1, 10), '23:30', '')).toBe(true)
  })

  it('hits calendar thresholds only once', () => {
    expect(calendarThreshold(59, new Set())).toBe(60)
    expect(calendarThreshold(59, new Set([60]))).toBeNull()
    expect(calendarThreshold(12, new Set([60]))).toBe(15)
    expect(calendarThreshold(-10, new Set())).toBeNull()
  })

  it('checks memories of previous years once a day after 9am', () => {
    expect(onThisDayDue(undefined, at(8))).toBe(false)
    expect(onThisDayDue(undefined, at(9))).toBe(true)
    expect(onThisDayDue('2026-11-15', at(10))).toBe(false)
  })

  it('computes delay until next sleep time', () => {
    expect(nextSleepDelayMs(at(22, 0), '23:30')).toBe(90 * 60_000)
    expect(nextSleepDelayMs(at(23, 45), '23:30')).toBe(23.75 * 60 * 60_000)
  })
})

import { describe, expect, it } from 'vitest'
import { TimeSceneMonitor } from '../../src/main/time-scene-monitor'
import {
  classifyForegroundScene,
  classifyTimePeriod,
  createTimeSceneContext,
  getTimePeriodGreeting,
  isQuietScene,
  isRestfulTime,
} from '../../src/shared/time-scene'

describe('time and scene awareness', () => {
  it('classifies local time periods at their boundaries', () => {
    expect(classifyTimePeriod(0)).toBe('late_night')
    expect(classifyTimePeriod(4)).toBe('late_night')
    expect(classifyTimePeriod(5)).toBe('early_morning')
    expect(classifyTimePeriod(8)).toBe('morning')
    expect(classifyTimePeriod(11)).toBe('afternoon')
    expect(classifyTimePeriod(17)).toBe('evening')
    expect(classifyTimePeriod(22)).toBe('night')
    expect(classifyTimePeriod(23)).toBe('night')
  })

  it('classifies common foreground applications into coarse scenes', () => {
    expect(classifyForegroundScene('Google Chrome')).toBe('browser')
    expect(classifyForegroundScene('Visual Studio Code')).toBe('development')
    expect(classifyForegroundScene('Obsidian')).toBe('focus')
    expect(classifyForegroundScene('WeChat')).toBe('communication')
    expect(classifyForegroundScene('Spotify')).toBe('media')
    expect(classifyForegroundScene('Finder')).toBe('desktop')
    expect(classifyForegroundScene('Custom App')).toBe('other')
    expect(classifyForegroundScene(null)).toBe('unknown')
  })

  it('builds local time, weekend, power, and privacy-safe idle context', () => {
    const context = createTimeSceneContext(new Date(2026, 9, 24, 23, 7), 'Google Chrome', 42.4, {
      onBatteryPower: true,
      screenLocked: false,
      suspended: false,
    })

    expect(context).toMatchObject({
      localDate: '2026-10-24',
      localTime: '23:07',
      timePeriod: 'night',
      weekday: 6,
      isWeekend: true,
      foregroundApp: 'Google Chrome',
      scene: 'browser',
      systemIdleSeconds: 42,
      onBatteryPower: true,
    })

    expect(
      createTimeSceneContext(new Date(2026, 9, 24, 23, 7), 'Google Chrome', 42, {
        onBatteryPower: false,
        screenLocked: true,
        suspended: false,
      }),
    ).toMatchObject({
      foregroundApp: null,
      scene: 'unknown',
      screenLocked: true,
    })
  })

  it('marks focus-oriented contexts and night as quieter periods', () => {
    expect(isQuietScene('focus')).toBe(true)
    expect(isQuietScene('development')).toBe(true)
    expect(isQuietScene('communication')).toBe(true)
    expect(isQuietScene('browser')).toBe(false)
    expect(isRestfulTime('night')).toBe(true)
    expect(isRestfulTime('afternoon')).toBe(false)
  })

  it('provides restrained period greetings without runtime translation', () => {
    expect(getTimePeriodGreeting('late_night', false)).toContain('别熬太久')
    expect(getTimePeriodGreeting('early_morning', true)).toContain('周末')
    expect(getTimePeriodGreeting('evening', false)).toContain('辛苦了')
    expect(getTimePeriodGreeting('night', false)).toContain('休息')
  })

  it('samples foreground context and suppresses it while the screen is locked', async () => {
    let power = {
      onBatteryPower: false,
      screenLocked: false,
      suspended: false,
    }
    let foregroundReads = 0
    const emitted: string[] = []
    const monitor = new TimeSceneMonitor({
      getForegroundApp: async () => {
        foregroundReads += 1
        return 'Visual Studio Code'
      },
      getSystemIdleSeconds: () => 12,
      getPowerState: () => power,
      onChanged: (context) => {
        emitted.push(`${context.scene}:${context.foregroundApp ?? 'none'}`)
      },
      now: () => new Date(2026, 9, 23, 9, 30),
    })

    await monitor.refresh()
    expect(monitor.getContext()).toMatchObject({
      foregroundApp: 'Visual Studio Code',
      scene: 'development',
      systemIdleSeconds: 12,
    })
    expect(emitted.at(-1)).toBe('development:Visual Studio Code')

    power = { ...power, screenLocked: true }
    await monitor.refresh()
    expect(foregroundReads).toBe(1)
    expect(monitor.getContext()).toMatchObject({
      foregroundApp: null,
      scene: 'unknown',
      screenLocked: true,
    })
  })
})

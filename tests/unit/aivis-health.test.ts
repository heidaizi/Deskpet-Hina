import { afterEach, describe, expect, it, vi } from 'vitest'
import { startAivisHealthMonitor } from '../../src/main/domain/aivis-health'

afterEach(() => {
  vi.useRealTimers()
})

describe('aivis health monitor', () => {
  it('revives the engine when the check fails', async () => {
    vi.useFakeTimers()
    const revive = vi.fn(async () => true)
    const stop = startAivisHealthMonitor({
      shouldRun: () => true,
      isReady: async () => false,
      revive,
      intervalMs: 1000,
    })
    await vi.advanceTimersByTimeAsync(1000)
    expect(revive).toHaveBeenCalledTimes(1)
    stop()
  })

  it('does nothing while the engine is healthy', async () => {
    vi.useFakeTimers()
    const revive = vi.fn(async () => true)
    const stop = startAivisHealthMonitor({
      shouldRun: () => true,
      isReady: async () => true,
      revive,
      intervalMs: 1000,
    })
    await vi.advanceTimersByTimeAsync(3000)
    expect(revive).not.toHaveBeenCalled()
    stop()
  })

  it('skips checks when disabled', async () => {
    vi.useFakeTimers()
    const revive = vi.fn(async () => true)
    const stop = startAivisHealthMonitor({
      shouldRun: () => false,
      isReady: async () => false,
      revive,
      intervalMs: 1000,
    })
    await vi.advanceTimersByTimeAsync(2000)
    expect(revive).not.toHaveBeenCalled()
    stop()
  })
})

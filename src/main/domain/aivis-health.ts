import { isAivisEngineReady } from './aivis-engine'

/**
 * 定期检查 AivisSpeech 引擎是否还活着。
 *
 * 引擎是独立进程，可能被系统因内存压力回收；这里每 10 分钟探一次，
 * 失联且当前确实在用 Aivis 时重新拉起。
 */
export interface AivisHealthOptions {
  shouldRun: () => boolean
  revive: () => Promise<boolean>
  isReady?: () => Promise<boolean>
  intervalMs?: number
  log?: (message: string) => void
}

export function startAivisHealthMonitor(options: AivisHealthOptions): () => void {
  const intervalMs = options.intervalMs ?? 10 * 60 * 1000
  const isReady = options.isReady ?? (() => isAivisEngineReady())
  let running = false

  const check = async (): Promise<void> => {
    if (running || !options.shouldRun()) {
      return
    }
    running = true
    try {
      if (await isReady()) {
        return
      }
      options.log?.('AivisSpeech 引擎失联，尝试重启')
      const ok = await options.revive()
      options.log?.(ok ? 'AivisSpeech 引擎已恢复' : 'AivisSpeech 引擎重启失败')
    } catch (error) {
      options.log?.(`AivisSpeech 健康检查异常：${String(error)}`)
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => {
    void check()
  }, intervalMs)

  return () => {
    clearInterval(timer)
  }
}

import { createTimeSceneContext, type TimeSceneContext } from '../shared/time-scene'
import type { SystemPowerState } from '../shared/types'

interface TimeSceneMonitorOptions {
  getForegroundApp: () => Promise<string | null>
  getSystemIdleSeconds: () => number
  getPowerState: () => SystemPowerState
  onChanged: (context: TimeSceneContext) => void
  now?: () => Date
  intervalMs?: number
}

export class TimeSceneMonitor {
  private readonly now: () => Date
  private readonly intervalMs: number
  private timer: NodeJS.Timeout | null = null
  private refreshing: Promise<void> | null = null
  private context: TimeSceneContext

  constructor(private readonly options: TimeSceneMonitorOptions) {
    this.now = options.now ?? (() => new Date())
    this.intervalMs = options.intervalMs ?? 15_000
    this.context = createTimeSceneContext(this.now(), null, 0, options.getPowerState())
  }

  start(): void {
    if (this.timer) {
      return
    }
    void this.refresh()
    this.timer = setInterval(() => {
      void this.refresh()
    }, this.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  getContext(): TimeSceneContext {
    return structuredClone(this.context)
  }

  refresh(): Promise<void> {
    if (this.refreshing) {
      return this.refreshing
    }
    this.refreshing = this.doRefresh().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async doRefresh(): Promise<void> {
    const power = this.options.getPowerState()
    let foregroundApp: string | null = null
    if (!power.screenLocked && !power.suspended) {
      try {
        foregroundApp = await this.options.getForegroundApp()
      } catch {
        foregroundApp = null
      }
    }

    this.context = createTimeSceneContext(
      this.now(),
      foregroundApp,
      this.options.getSystemIdleSeconds(),
      power,
    )
    this.options.onChanged(this.getContext())
  }
}

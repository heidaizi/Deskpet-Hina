import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { PetExpression } from '../../shared/types'
import type { ScheduleItem } from '../perception/life-context'

const WATER_INTERVAL_MS = 90 * 60_000
const POMODORO_WORK_MS = 25 * 60_000
const POMODORO_BREAK_MS = 5 * 60_000
const CALENDAR_THRESHOLDS = [60, 15] as const
const DAY_MS = 24 * 60 * 60 * 1000

export interface RoutineLine {
  zh: string
  ja: string
  emotion: string
  expression: PetExpression
}

interface RoutineFile {
  schemaVersion: number
  lastWaterAt: number
  lastSleepDate: string
  lastOnThisDayDate?: string
  notifiedEvents: Record<string, number>
}

export interface RoutineSettings {
  waterReminderEnabled: boolean
  calendarReminderEnabled: boolean
  sleepReminderEnabled: boolean
  sleepTime: string
}

interface RoutineOptions {
  contentDir: string
  userDataDir: string
  getSettings: () => RoutineSettings
  deliver: (line: RoutineLine) => void
  getSchedule: () => Promise<readonly ScheduleItem[]>
  getOnThisDay?: () => Promise<string | null>
  onEvent?: (event: { summary: string; importance?: number }) => void
  isAvailable?: () => boolean
  now?: () => number
}

function localDateKey(now: number): string {
  const date = new Date(now)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function minutesOfDay(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

export function waterDue(now: number, lastWaterAt: number, enabled: boolean): boolean {
  if (!enabled) {
    return false
  }
  const hour = new Date(now).getHours()
  if (hour < 9 || hour >= 23) {
    return false
  }
  return now - lastWaterAt >= WATER_INTERVAL_MS
}

export function sleepDue(now: number, sleepTime: string, lastSleepDate: string): boolean {
  const key = localDateKey(now)
  if (lastSleepDate === key) {
    return false
  }
  const date = new Date(now)
  const minutes = date.getHours() * 60 + date.getMinutes()
  const target = minutesOfDay(sleepTime)
  // 睡前提醒在设定时间之后、凌晨 3 点之前只触发一次。
  if (date.getHours() < 3) {
    return true
  }
  return minutes >= target
}

export function calendarThreshold(
  minutesUntil: number,
  notified: ReadonlySet<number>,
): number | null {
  for (const threshold of CALENDAR_THRESHOLDS) {
    if (minutesUntil <= threshold && minutesUntil >= -5 && !notified.has(threshold)) {
      return threshold
    }
  }
  return null
}

export class RoutineService {
  private readonly filePath: string
  private readonly lines: Record<string, RoutineLine>
  private readonly now: () => number
  private data: RoutineFile
  private pomodoro: { phase: 'work' | 'break'; endsAt: number } | null = null
  private timer: NodeJS.Timeout | null = null
  private calendarTimer: NodeJS.Timeout | null = null
  private onThisDayInFlight = false
  private onThisDayReadyAt = 0
  private initialTimer: NodeJS.Timeout | null = null

  constructor(private readonly options: RoutineOptions) {
    this.filePath = join(options.userDataDir, 'routine.json')
    this.now = options.now ?? Date.now
    this.lines = this.loadLines(options.contentDir)
    this.data = this.load()
  }

  private loadLines(contentDir: string): Record<string, RoutineLine> {
    const path = join(contentDir, 'routine-lines.json')
    if (!existsSync(path)) {
      return {}
    }
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
        lines: Record<string, RoutineLine>
      }
      return parsed.lines ?? {}
    } catch {
      return {}
    }
  }

  private load(): RoutineFile {
    if (existsSync(this.filePath)) {
      try {
        return JSON.parse(readFileSync(this.filePath, 'utf8')) as RoutineFile
      } catch {
        // 损坏时重建
      }
    }
    return { schemaVersion: 1, lastWaterAt: this.now(), lastSleepDate: '', notifiedEvents: {} }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2) + '\n')
  }

  private record(summary: string, importance = 1): void {
    this.options.onEvent?.({ summary, importance })
  }

  private deliver(key: string, dialogueOverride?: string): void {
    const line = this.lines[key]
    if (!line || this.options.isAvailable?.() === false) {
      return
    }
    this.options.deliver(dialogueOverride ? { ...line, zh: dialogueOverride } : line)
  }

  start(): void {
    // 避开启动问候，稍后再检查「往年今日」。
    this.onThisDayReadyAt = this.now() + 20_000
    this.tick()
    this.initialTimer = setTimeout(() => this.tick(), 21_000)
    this.initialTimer.unref?.()
    this.timer = setInterval(() => this.tick(), 60_000)
    this.timer.unref?.()
    this.calendarTimer = setInterval(() => void this.checkCalendar(), 5 * 60_000)
    this.calendarTimer.unref?.()
  }

  getSnapshot(now = this.now()): {
    pomodoroPhase: 'work' | 'break' | null
    pomodoroMinutesLeft: number | null
    waterReminderEnabled: boolean
    sleepTime: string
  } {
    const settings = this.options.getSettings()
    return {
      pomodoroPhase: this.pomodoro?.phase ?? null,
      pomodoroMinutesLeft: this.pomodoro
        ? Math.max(0, Math.ceil((this.pomodoro.endsAt - now) / 60_000))
        : null,
      waterReminderEnabled: settings.waterReminderEnabled,
      sleepTime: settings.sleepTime,
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.calendarTimer) {
      clearInterval(this.calendarTimer)
      this.calendarTimer = null
    }
    if (this.initialTimer) {
      clearTimeout(this.initialTimer)
      this.initialTimer = null
    }
  }

  private tick(): void {
    const now = this.now()
    const settings = this.options.getSettings()

    if (waterDue(now, this.data.lastWaterAt, settings.waterReminderEnabled)) {
      this.data.lastWaterAt = now
      this.persist()
      this.record('喝水提醒', 1)
      this.deliver('water')
    }

    if (
      settings.sleepReminderEnabled &&
      sleepDue(now, settings.sleepTime, this.data.lastSleepDate)
    ) {
      this.data.lastSleepDate = localDateKey(now)
      this.persist()
      this.record('睡前提醒', 2)
      this.deliver('sleep')
    }

    void this.checkOnThisDay()

    if (this.pomodoro) {
      if (now >= this.pomodoro.endsAt) {
        if (this.pomodoro.phase === 'work') {
          this.pomodoro = { phase: 'break', endsAt: now + POMODORO_BREAK_MS }
          this.record('完成一段 25 分钟专注', 2)
          this.deliver('pomodoroEnd')
        } else {
          this.pomodoro = null
          this.record('专注休息结束', 1)
          this.deliver('breakEnd')
        }
      }
    }
  }

  /** 聊天里识别「开始工作 / 休息一下」等指令。 */
  handleChatCommand(text: string, now = this.now()): { line: RoutineLine } | null {
    if (/(开始工作|开始专注|番茄钟|专注一下)/u.test(text)) {
      void this.checkOnThisDay()

      if (this.pomodoro) {
        return { line: { ...this.lines.breakEnd, zh: '已经在计时了。先专心吧。' } }
      }
      this.pomodoro = { phase: 'work', endsAt: now + POMODORO_WORK_MS }
      this.record('开始专注，25 分钟', 2)
      const line = this.lines.pomodoroStart
      if (line) {
        this.deliver('pomodoroStart')
        return { line }
      }
    }
    if (/(结束工作|停止番茄|不工作了|停止专注)/u.test(text)) {
      if (!this.pomodoro) {
        return { line: { ...this.lines.breakEnd, zh: '现在没有在计时。' } }
      }
      this.pomodoro = null
      this.record('提前结束专注', 1)
      return { line: { ...this.lines.breakEnd, zh: '好，先到这里。……辛苦了。' } }
    }
    return null
  }

  private async checkOnThisDay(): Promise<void> {
    if (this.onThisDayInFlight || !this.options.getOnThisDay) {
      return
    }
    if (this.now() < this.onThisDayReadyAt) {
      return
    }
    if (!onThisDayDue(this.data.lastOnThisDayDate, this.now())) {
      return
    }
    if (this.options.isAvailable?.() === false) {
      return
    }
    this.onThisDayInFlight = true
    try {
      const memory = await this.options.getOnThisDay()
      this.data.lastOnThisDayDate = localDateKey(this.now())
      this.persist()
      if (memory) {
        this.record('回想起往年今日', 2)
        this.deliver('onThisDay', `老师，往年的今天……我们说过「${memory}」。还记得吗？`)
      }
    } catch {
      // 读取回忆失败时下次再试
    } finally {
      this.onThisDayInFlight = false
    }
  }

  private async checkCalendar(): Promise<void> {
    const settings = this.options.getSettings()
    if (!settings.calendarReminderEnabled || this.options.isAvailable?.() === false) {
      return
    }
    const now = this.now()
    const hour = new Date(now).getHours()
    if (hour < 7 || hour >= 23) {
      return
    }
    try {
      const events = await this.options.getSchedule()
      const dateKey = localDateKey(now)
      for (const event of events) {
        if (event.kind !== 'event' || event.minutesUntil === undefined) {
          continue
        }
        const key = `${dateKey}:${event.title}`
        const notified = new Set(
          Object.entries(this.data.notifiedEvents)
            .filter(([existing]) => existing.startsWith(`${key}:`))
            .map(([, threshold]) => threshold),
        )
        const threshold = calendarThreshold(event.minutesUntil, notified)
        if (threshold === null) {
          continue
        }
        this.data.notifiedEvents[`${key}:${threshold}`] = threshold
        this.persist()
        this.record(`日程提醒：${event.title}`, 2)
        this.deliver('eventSoon', `老师，「${event.title}」快开始了。`)
      }
    } catch {
      // 日历不可用时静默跳过
    }
  }
}

export function onThisDayDue(lastDate: string | undefined, now: number): boolean {
  if (lastDate === localDateKey(now)) {
    return false
  }
  return new Date(now).getHours() >= 9
}

export function nextSleepDelayMs(now: number, sleepTime: string): number {
  const target = minutesOfDay(sleepTime)
  const date = new Date(now)
  const minutes = date.getHours() * 60 + date.getMinutes()
  if (minutes >= target) {
    return DAY_MS - (minutes - target) * 60_000
  }
  return (target - minutes) * 60_000
}

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface NowPlaying {
  app: string
  title: string
  artist: string
}

export interface ScheduleItem {
  kind: 'event' | 'reminder'
  title: string
  when?: string
}

const CACHE_MS = 5 * 60_000
let cachedMedia: { value: NowPlaying | null; at: number } | null = null
let cachedSchedule: { value: ScheduleItem[]; at: number } | null = null

async function osascript(script: string, timeout = 4000): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout })
    const text = stdout.trim()
    return text || null
  } catch {
    return null
  }
}

/** 读取正在播放的音乐（只查询已在运行的应用，避免把应用拉起来）。 */
async function readPlayer(app: string): Promise<NowPlaying | null> {
  const script = `if application "${app}" is running then
  tell application "${app}"
    if player state is playing then
      return (name of current track) & "|" & (artist of current track)
    end if
  end tell
end if
return ""`
  const output = await osascript(script)
  if (!output) {
    return null
  }
  const [title, artist] = output.split('|')
  if (!title) {
    return null
  }
  return { app, title: title.trim(), artist: (artist ?? '').trim() }
}

export async function getNowPlaying(now = Date.now()): Promise<NowPlaying | null> {
  if (cachedMedia && now - cachedMedia.at < CACHE_MS) {
    return cachedMedia.value
  }
  const playing = (await readPlayer('Music')) ?? (await readPlayer('Spotify'))
  cachedMedia = { value: playing, at: now }
  return playing
}

/** 读取今天的日历事件与未完成提醒（只查询已运行的应用）。 */
export async function getSchedule(now = Date.now()): Promise<ScheduleItem[]> {
  if (cachedSchedule && now - cachedSchedule.at < CACHE_MS) {
    return cachedSchedule.value
  }
  const items: ScheduleItem[] = []

  const calendarScript = `set today to (current date)
set dayStart to today - (time of today)
set dayEnd to dayStart + (24 * 60 * 60)
if application "Calendar" is running then
  tell application "Calendar"
    set out to ""
    repeat with c in calendars
      repeat with e in (every event of c whose start date ≥ dayStart and start date < dayEnd)
        set out to out & (summary of e) & "|" & (start date of e as string) & linefeed
      end repeat
    end repeat
    return out
  end tell
end if
return ""`
  const calendarOutput = await osascript(calendarScript, 6000)
  if (calendarOutput) {
    for (const line of calendarOutput.split('\n').slice(0, 5)) {
      const [title, when] = line.split('|')
      if (title?.trim()) {
        items.push({ kind: 'event', title: title.trim(), when: when?.trim() })
      }
    }
  }

  const reminderScript = `if application "Reminders" is running then
  tell application "Reminders"
    set out to ""
    repeat with r in (reminders whose completed is false)
      set out to out & (name of r) & linefeed
      if (count of out) > 600 then exit repeat
    end repeat
    return out
  end tell
end if
return ""`
  const reminderOutput = await osascript(reminderScript, 5000)
  if (reminderOutput) {
    for (const line of reminderOutput.split('\n').slice(0, 5)) {
      if (line.trim()) {
        items.push({ kind: 'reminder', title: line.trim() })
      }
    }
  }

  cachedSchedule = { value: items, at: now }
  return items
}

export function buildMediaPrompt(media: NowPlaying | null): string {
  if (!media) {
    return ''
  }
  return `老师正在听「${media.title}」${media.artist ? `（${media.artist}）` : ''}。可以自然地聊一句这首歌。`
}

export function buildSchedulePrompt(items: readonly ScheduleItem[], now = new Date()): string {
  if (items.length === 0) {
    return ''
  }
  const events = items.filter((item) => item.kind === 'event').slice(0, 3)
  const reminders = items.filter((item) => item.kind === 'reminder').slice(0, 3)
  const lines = [`今天是 ${now.getMonth() + 1} 月 ${now.getDate()} 日。`]
  if (events.length > 0) {
    lines.push('今天的日程：')
    for (const event of events) {
      lines.push(`- ${event.title}${event.when ? `（${event.when}）` : ''}`)
    }
  }
  if (reminders.length > 0) {
    lines.push('未完成的提醒：')
    for (const reminder of reminders) {
      lines.push(`- ${reminder.title}`)
    }
  }
  lines.push('如果合适，可以关心一下他的安排；不要逐条念出来。')
  return lines.join('\n')
}

export function resetLifeContextCache(): void {
  cachedMedia = null
  cachedSchedule = null
}

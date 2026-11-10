export const TIME_PERIODS = [
  'late_night',
  'early_morning',
  'morning',
  'afternoon',
  'evening',
  'night',
] as const

export type TimePeriod = (typeof TIME_PERIODS)[number]

export const SCENE_KINDS = [
  'browser',
  'focus',
  'development',
  'communication',
  'media',
  'desktop',
  'system',
  'other',
  'unknown',
] as const

export type SceneKind = (typeof SCENE_KINDS)[number]

export interface TimeSceneContext {
  sampledAt: number
  localDate: string
  localTime: string
  timePeriod: TimePeriod
  weekday: number
  isWeekend: boolean
  foregroundApp: string | null
  scene: SceneKind
  systemIdleSeconds: number
  onBatteryPower: boolean
  screenLocked: boolean
  suspended: boolean
}

interface SceneMatcher {
  kind: SceneKind
  pattern: RegExp
}

const SCENE_MATCHERS: SceneMatcher[] = [
  {
    kind: 'browser',
    pattern: /(chrome|safari|firefox|edge|arc browser|brave|opera|vivaldi|浏览器)/i,
  },
  {
    kind: 'development',
    pattern:
      /(visual studio code|vscode|cursor|xcode|terminal|iterm|warp|webstorm|pycharm|intellij|android studio|zed|sublime text|开发)/i,
  },
  {
    kind: 'focus',
    pattern:
      /(obsidian|notion|pages|numbers|keynote|microsoft word|microsoft excel|microsoft powerpoint|wps|preview|skim|zotero|typora|craft|figma|adobe acrobat|pdf|笔记|文档)/i,
  },
  {
    kind: 'communication',
    pattern: /(wechat|微信|^qq$|discord|slack|telegram|feishu|lark|飞书|zoom|teams|line|whatsapp)/i,
  },
  {
    kind: 'media',
    pattern:
      /(spotify|apple music|^music$|iina|vlc|quicktime|^tv$|podcast|netflix|bilibili|音乐|播放器)/i,
  },
  { kind: 'desktop', pattern: /^(finder|访达)$/i },
  {
    kind: 'system',
    pattern:
      /(system settings|system preferences|activity monitor|systemuiserver|loginwindow|deskpet|日奈桌宠|空崎日奈|^electron$)/i,
  },
]

export function createTimeSceneContext(
  date: Date,
  foregroundApp: string | null,
  systemIdleSeconds: number,
  power: { onBatteryPower: boolean; screenLocked: boolean; suspended: boolean },
): TimeSceneContext {
  const inactive = power.screenLocked || power.suspended
  return {
    sampledAt: date.getTime(),
    localDate: formatLocalDate(date),
    localTime: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    timePeriod: classifyTimePeriod(date.getHours()),
    weekday: date.getDay(),
    isWeekend: date.getDay() === 0 || date.getDay() === 6,
    foregroundApp: inactive ? null : foregroundApp,
    scene: inactive ? 'unknown' : classifyForegroundScene(foregroundApp),
    systemIdleSeconds: Math.max(0, Math.round(systemIdleSeconds)),
    onBatteryPower: power.onBatteryPower,
    screenLocked: power.screenLocked,
    suspended: power.suspended,
  }
}

export function classifyTimePeriod(hour: number): TimePeriod {
  const safeHour = Math.min(23, Math.max(0, Math.trunc(hour)))
  if (safeHour < 5) {
    return 'late_night'
  }
  if (safeHour < 8) {
    return 'early_morning'
  }
  if (safeHour < 11) {
    return 'morning'
  }
  if (safeHour < 17) {
    return 'afternoon'
  }
  if (safeHour < 22) {
    return 'evening'
  }
  return 'night'
}

export function classifyForegroundScene(appName: string | null): SceneKind {
  const normalized = appName?.trim()
  if (!normalized) {
    return 'unknown'
  }
  return SCENE_MATCHERS.find((matcher) => matcher.pattern.test(normalized))?.kind ?? 'other'
}

export function isQuietScene(scene: SceneKind): boolean {
  return scene === 'focus' || scene === 'development' || scene === 'communication'
}

export function isRestfulTime(period: TimePeriod): boolean {
  return period === 'late_night' || period === 'night'
}

export function getTimePeriodGreeting(period: TimePeriod, isWeekend: boolean): string {
  if (period === 'late_night') {
    return '这个时间还没睡？……别熬太久。'
  }
  if (period === 'early_morning') {
    return isWeekend ? '早上好，老师。周末也不用起这么早吧。' : '早上好，老师。……今天也按计划来。'
  }
  if (period === 'morning') {
    return isWeekend ? '周末的上午，慢一点也没关系。' : '上午好。别忘了喝水。'
  }
  if (period === 'afternoon') {
    return '下午好。累了就停一下。'
  }
  if (period === 'evening') {
    return '辛苦了，老师。今天也到这里就好。'
  }
  return '已经很晚了。差不多该休息了。'
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

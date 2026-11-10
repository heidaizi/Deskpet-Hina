import type { ChatCapability } from '../../shared/chat-intent'
import type { NowPlaying, ScheduleItem } from '../perception/life-context'
import type { ScreenContext } from '../perception/screen-context'
import type { ScreenVision } from '../perception/screen-vision-core'

export interface CapabilityData {
  capabilities: readonly ChatCapability[]
  now?: Date
  screen?: ScreenContext | null
  vision?: ScreenVision | null
  media?: NowPlaying | null
  schedule?: readonly ScheduleItem[]
}

const LABELS: Record<ChatCapability, string> = {
  time: '当前时间',
  screen: '屏幕画面',
  page: '浏览器页面',
  media: '正在播放的音乐',
  schedule: '日程与提醒',
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 为「操作性提问」生成一段带真实数据的提示，避免模型凭空回答。 */
export function buildCapabilityPrompt(data: CapabilityData): string {
  if (data.capabilities.length === 0) {
    return ''
  }
  const lines: string[] = []
  if (data.capabilities.includes('time') && data.now) {
    const pad = (value: number): string => String(value).padStart(2, '0')
    lines.push(
      `- 当前时间：${data.now.getFullYear()}-${pad(data.now.getMonth() + 1)}-${pad(
        data.now.getDate(),
      )} ${pad(data.now.getHours())}:${pad(data.now.getMinutes())}（${WEEKDAYS[data.now.getDay()]}）`,
    )
  }
  if (data.capabilities.includes('screen') && data.vision) {
    lines.push(`- 屏幕画面：${data.vision.summary}`)
  }
  const page = data.screen
  if ((data.capabilities.includes('page') || data.capabilities.includes('screen')) && page) {
    lines.push(`- 前台应用：${page.app}`)
    if (page.title) {
      lines.push(`- 页面标题：${page.title}`)
    }
    if (page.excerpt) {
      lines.push(`- 页面节选：${page.excerpt.slice(0, 300)}`)
    }
  }
  if (data.capabilities.includes('media') && data.media) {
    lines.push(
      `- 正在播放：${data.media.title}${data.media.artist ? `（${data.media.artist}）` : ''}`,
    )
  }
  if (data.capabilities.includes('schedule') && data.schedule?.length) {
    const items = data.schedule
      .slice(0, 4)
      .map((item) => `${item.kind === 'event' ? '日程' : '提醒'}：${item.title}`)
    lines.push(`- ${items.join('；')}`)
  }

  const asked = data.capabilities.map((capability) => LABELS[capability]).join('、')
  if (lines.length === 0) {
    return [
      `老师这句话需要你确认「${asked}」，但本地刚刚没读到数据（可能缺少系统授权）。`,
      '直接坦白说现在看不到，不要编造。',
    ].join('\n')
  }
  return [
    `老师这句话需要你确认「${asked}」。本地刚读取到：`,
    ...lines,
    '这些是本地程序刚刚读取的真实数据，不是你在假装看到屏幕，可以放心据此回答；只使用这里给出的信息，不要编造没有列出的细节。',
  ].join('\n')
}

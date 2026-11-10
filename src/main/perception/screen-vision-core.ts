export type ScreenActivity = 'coding' | 'document' | 'video' | 'game' | 'chat' | 'other'

export interface ScreenVision {
  activity: ScreenActivity
  summary: string
  at: number
}

const ACTIVITIES: readonly ScreenActivity[] = [
  'coding',
  'document',
  'video',
  'game',
  'chat',
  'other',
]

export function parseVisionReply(content: string, now = Date.now()): ScreenVision | null {
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) {
    return null
  }
  try {
    const data = JSON.parse(match[0]) as { activity?: string; summary?: string }
    const activity = ACTIVITIES.includes(data.activity as ScreenActivity)
      ? (data.activity as ScreenActivity)
      : 'other'
    const summary = (data.summary ?? '').trim().slice(0, 120)
    if (!summary) {
      return null
    }
    return { activity, summary, at: now }
  } catch {
    return null
  }
}

export function buildVisionPrompt(vision: ScreenVision | null): string {
  if (!vision) {
    return ''
  }
  const label: Record<ScreenActivity, string> = {
    coding: '写代码/调试',
    document: '看文档/阅读',
    video: '看视频',
    game: '玩游戏',
    chat: '聊天/社交',
    other: '其他',
  }
  return [
    `你从屏幕画面里看到：老师正在${label[vision.activity]}——${vision.summary}`,
    '可以自然地就这个内容问一句或发表看法；不要说“我看到你的屏幕”，也不要逐字描述画面。',
  ].join('\n')
}

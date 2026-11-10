/** 对话里需要调用本地感知能力的意图。 */
export type ChatCapability = 'time' | 'screen' | 'page' | 'media' | 'schedule'

interface IntentRule {
  capability: ChatCapability
  pattern: RegExp
}

const RULES: readonly IntentRule[] = [
  { capability: 'time', pattern: /几点|现在.*(时间|点)|什么时候了|what time/iu },
  {
    capability: 'screen',
    pattern: /(屏幕|画面).*(什么|啥|怎样)|知道.*(在|做).*什么|能(看到|知道).*(我|在)/u,
  },
  {
    capability: 'page',
    pattern: /(在看|浏览|打开|访问).*(什么|啥|网页|页面|网站|视频|文章)|这个(页面|视频|文章)/u,
  },
  { capability: 'media', pattern: /(听|放).*(歌|音乐)|在听什么|什么歌/u },
  { capability: 'schedule', pattern: /日程|安排|提醒|任务|会议|开会|今天.*(要|有).*(做|去|交)/u },
]

/** 根据用户输入判断需要哪些实时能力。 */
export function detectChatIntent(text: string): ChatCapability[] {
  const found = new Set<ChatCapability>()
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      found.add(rule.capability)
    }
  }
  return [...found]
}

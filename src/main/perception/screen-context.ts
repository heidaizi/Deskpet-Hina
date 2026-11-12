import { execFile } from 'node:child_process'
import { curlGet } from '../net/curl'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface ScreenContext {
  app: string
  url?: string
  title?: string
  excerpt?: string
  at: number
}

const CACHE_MS = 60_000
const MAX_EXCERPT = 1800
const MAX_HTML = 400_000

let cached: ScreenContext | null = null

function isEnabled(): boolean {
  return process.env.DESKPET_PERCEPTION !== '0'
}

async function osascript(script: string, timeout = 2500): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout })
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function frontmostApp(): Promise<string | null> {
  return osascript(
    'tell application "System Events" to get name of first process whose frontmost is true',
  )
}

/** 读取主流浏览器的前台标签页地址与标题。 */
async function browserTab(app: string): Promise<{ url: string; title: string } | null> {
  const chromeLike = ['Google Chrome', 'Arc', 'Microsoft Edge', 'Brave Browser']
  if (chromeLike.includes(app)) {
    const url = await osascript(
      `tell application "${app}" to get URL of active tab of front window`,
    )
    const title = await osascript(
      `tell application "${app}" to get title of active tab of front window`,
    )
    return url && title ? { url, title } : null
  }
  if (app === 'Safari') {
    const url = await osascript('tell application "Safari" to get URL of front document')
    const title = await osascript('tell application "Safari" to get name of front document')
    return url && title ? { url, title } : null
  }
  return null
}

/** 提取网页正文的粗略文本，够模型理解主题即可。 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchExcerpt(url: string): Promise<string | undefined> {
  // 用 curl 抓取：主进程 fetch 在系统代理环境下容易超时。
  const html = await curlGet(url, 8_000)
  if (!html) {
    return undefined
  }
  const text = htmlToText(html.slice(0, MAX_HTML))
  return text.length > 40 ? text.slice(0, MAX_EXCERPT) : undefined
}

/**
 * 读取当前前台应用与浏览器页面。结果缓存 60 秒，页面正文只在 URL 变化时抓取。
 */
export async function collectScreenContext(
  now = Date.now(),
  force = false,
): Promise<ScreenContext | null> {
  if (!isEnabled()) {
    return null
  }
  if (!force && cached && now - cached.at < CACHE_MS) {
    return cached
  }
  const app = await frontmostApp()
  if (!app || app === 'Electron') {
    return null
  }
  const tab = await browserTab(app)
  const base: ScreenContext = { app, url: tab?.url, title: tab?.title, at: now }
  if (tab && cached?.url !== tab.url) {
    base.excerpt = await fetchExcerpt(tab.url)
  } else if (tab && cached?.url === tab.url) {
    base.excerpt = cached.excerpt
  }
  cached = base
  return base
}

/** 供本地风险预检复用最近一次页面身份；不触发新的抓取。 */
export function getCachedScreenContext(): ScreenContext | null {
  return cached
}

export function buildPerceptionPrompt(context: ScreenContext | null): string {
  if (!context) {
    return ''
  }
  const lines = [`老师现在正在使用「${context.app}」。`]
  if (context.title) {
    lines.push(`当前页面标题：${context.title}`)
  }
  if (context.url) {
    lines.push(`页面地址：${context.url}`)
  }
  if (context.excerpt) {
    lines.push(`页面节选：${context.excerpt}`)
  }
  lines.push(
    '你可以自然地就页面内容提一个具体的问题，或说一句自己的看法；不要像监控一样复述页面，也不要声称看到了屏幕。',
  )
  return lines.join('\n')
}

/** 聊天热路径用：最多等 1.2 秒，超时就用上一次的缓存。 */
export async function collectScreenContextFast(force = false): Promise<ScreenContext | null> {
  return Promise.race([
    collectScreenContext(Date.now(), force),
    new Promise<ScreenContext | null>((resolve) => setTimeout(() => resolve(cached), 1200)),
  ])
}

import { desktopCapturer, systemPreferences } from 'electron'
import { curlPostJson } from '../net/curl'
import { parseVisionReply, type ScreenVision } from './screen-vision-core'

const VISION_MODEL = process.env.DESKPET_VISION_MODEL ?? 'deepseek-flash'
const INTERVAL_MS = Number(process.env.DESKPET_VISION_INTERVAL_MS ?? 8 * 60_000)

let latest: ScreenVision | null = null
let timer: NodeJS.Timeout | null = null
let running = false
let permissionWarned = false
let loopOptions: ScreenVisionOptions | null = null

export function getLatestScreenVision(): ScreenVision | null {
  return latest
}

/** 截取主屏并压成 JPEG data URL，避免请求体过大。 */
export async function captureScreen(): Promise<string | null> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 800 },
    })
    const source = sources[0]
    if (!source) {
      return null
    }
    const jpeg = source.thumbnail.toJPEG(72)
    if (jpeg.length === 0) {
      return null
    }
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch {
    // 未授权时 getSources 会 reject，交给上层当作不可用处理。
    return null
  }
}

async function analyzeOnce(image: string, apiKey: string): Promise<ScreenVision | null> {
  const body = JSON.stringify({
    model: VISION_MODEL,
    max_tokens: 200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              '这是老师当前的屏幕截图。只输出 JSON：' +
              '{"activity":"coding|document|video|game|chat|other","summary":"中文，30字以内描述他在做什么"}',
          },
          { type: 'image_url', image_url: { url: image, detail: 'low' } },
        ],
      },
    ],
  })
  const response = await curlPostJson(
    'https://api.deepseek.com/chat/completions',
    body,
    { authorization: `Bearer ${apiKey}` },
    20_000,
  )
  if (response.status !== 200) {
    console.warn('[vision] 请求失败', response.status, response.text.slice(0, 160))
    return null
  }
  try {
    const data = JSON.parse(response.text) as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>
    }
    const message = data.choices?.[0]?.message
    const content = message?.content?.trim() || message?.reasoning_content?.trim() || ''
    return parseVisionReply(content)
  } catch {
    return null
  }
}

async function analyze(image: string, apiKey: string): Promise<ScreenVision | null> {
  // 模型偶尔只返回推理或空内容，重试一次。
  return (await analyzeOnce(image, apiKey)) ?? (await analyzeOnce(image, apiKey))
}

export interface ScreenVisionOptions {
  getApiKey: () => Promise<string | null>
  isEnabled: () => boolean
  intervalMs?: number
}

async function tick(options: ScreenVisionOptions): Promise<void> {
  if (running || !options.isEnabled()) {
    return
  }
  if (systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
    if (!permissionWarned) {
      permissionWarned = true
      console.warn(
        '[vision] 需要屏幕录制权限：系统设置 → 隐私与安全性 → 屏幕录制，勾选「空崎日奈」后重启应用',
      )
    }
    return
  }
  running = true
  try {
    const apiKey = await options.getApiKey()
    if (!apiKey) {
      return
    }
    const image = await captureScreen()
    if (!image) {
      return
    }
    const vision = await analyze(image, apiKey)
    if (vision) {
      latest = vision
      console.warn(`[vision] ${vision.activity}: ${vision.summary}`)
    }
  } catch (error) {
    console.warn('[vision] 屏幕分析失败:', String(error))
  } finally {
    running = false
  }
}

export function startScreenVisionLoop(options: ScreenVisionOptions): () => void {
  loopOptions = options
  if (timer) {
    return () => undefined
  }
  void tick(options)
  timer = setInterval(() => void tick(options), options.intervalMs ?? INTERVAL_MS)
  timer.unref?.()
  return () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

/** 按需立即做一次截图分析（聊天里明确问到时使用）。 */
export async function requestVisionRefresh(): Promise<ScreenVision | null> {
  if (!loopOptions) {
    return latest
  }
  // 如果定时分析正在进行，等它结束再返回，避免刚启动时拿到空结果。
  for (let i = 0; i < 30 && running; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (running) {
    return latest
  }
  if (systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
    return latest
  }
  running = true
  try {
    const apiKey = await loopOptions.getApiKey()
    if (!apiKey) {
      return latest
    }
    const image = await captureScreen()
    if (!image) {
      return latest
    }
    const vision = await analyze(image, apiKey)
    if (vision) {
      latest = vision
    }
    return latest
  } catch {
    return latest
  } finally {
    running = false
  }
}

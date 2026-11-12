import { desktopCapturer, systemPreferences } from 'electron'
import { curlPostJson } from '../net/curl'
import {
  emptyScreenPerceptionStatus,
  type ScreenPerceptionPermission,
  type ScreenPerceptionStatus,
} from '../../shared/screen-perception'
import { getCachedScreenContext, type ScreenContext } from './screen-context'
import { isSecureInputActive, probeLocalScreen } from './local-screen-probe'
import { assessScreenRisk } from './screen-risk'
import { parseVisionReply, type ScreenVision } from './screen-vision-core'

const VISION_MODEL = process.env.DESKPET_VISION_MODEL ?? 'deepseek-flash'
const INTERVAL_MS = Number(process.env.DESKPET_VISION_INTERVAL_MS ?? 8 * 60_000)
const RISK_CONTEXT_MAX_AGE_MS = 5 * 60_000

let latest: ScreenVision | null = null
let timer: NodeJS.Timeout | null = null
let running = false
let permissionWarned = false
let loopOptions: ScreenVisionOptions | null = null
let status: ScreenPerceptionStatus = emptyScreenPerceptionStatus()

interface CapturedScreen {
  dataUrl: string
  jpeg: Buffer
}

export interface ScreenVisionOptions {
  getApiKey: () => Promise<string | null>
  /** 开关 + AI + 环境变量共同决定；false 时不截图。 */
  isEnabled: () => boolean
  /** 只反映用户是否打开独立开关，用于区分“未开启”和“等待 AI”。 */
  isConfigured?: () => boolean
  /** 菜单栏或设置页的一键暂停。 */
  isPaused?: () => boolean
  onStatusChange?: (status: ScreenPerceptionStatus) => void
  intervalMs?: number
}

function readPermission(): ScreenPerceptionPermission {
  try {
    const value = systemPreferences.getMediaAccessStatus('screen')
    if (
      value === 'granted' ||
      value === 'denied' ||
      value === 'restricted' ||
      value === 'not-determined'
    ) {
      return value
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

function computedStatus(): ScreenPerceptionStatus {
  const configured = Boolean(loopOptions?.isConfigured?.() ?? loopOptions?.isEnabled())
  const paused = Boolean(loopOptions?.isPaused?.())
  const enabled = Boolean(loopOptions?.isEnabled())
  const permission = readPermission()
  const active =
    configured && enabled && !paused && permission === 'granted' && status.keyConfigured !== false
  return {
    ...status,
    configured,
    paused,
    permission,
    active,
  }
}

function notifyStatus(patch: Partial<ScreenPerceptionStatus>): ScreenPerceptionStatus {
  status = computedStatus()
  status = { ...status, ...patch }
  // 重新计算 active：patch 可能刚把 keyConfigured 设为 false。
  const permission = readPermission()
  const configured = Boolean(loopOptions?.isConfigured?.() ?? loopOptions?.isEnabled())
  const paused = Boolean(loopOptions?.isPaused?.())
  const enabled = Boolean(loopOptions?.isEnabled())
  status = {
    ...status,
    configured,
    paused,
    permission,
    active:
      configured &&
      enabled &&
      !paused &&
      permission === 'granted' &&
      status.keyConfigured !== false,
  }
  loopOptions?.onStatusChange?.(status)
  return status
}

export function getScreenVisionStatus(): ScreenPerceptionStatus {
  return computedStatus()
}

export function getLatestScreenVision(): ScreenVision | null {
  if (!loopOptions) {
    return null
  }
  if (loopOptions.isPaused?.() || !loopOptions.isEnabled()) {
    return null
  }
  return latest
}

/** 截取主屏并同时保留 JPEG，供本地 OCR 预检使用。 */
export async function captureScreen(): Promise<CapturedScreen | null> {
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
    return {
      dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
      jpeg,
    }
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

function riskContextFor(appName: string | null): ScreenContext | null {
  const context = getCachedScreenContext()
  if (!context || Date.now() - context.at > RISK_CONTEXT_MAX_AGE_MS) {
    return null
  }
  if (appName && context.app) {
    const left = appName.toLowerCase()
    const right = context.app.toLowerCase()
    if (!left.includes(right) && !right.includes(left)) {
      return null
    }
  }
  return context
}

function stopRequested(options: ScreenVisionOptions): boolean {
  return Boolean(options.isPaused?.() || !options.isEnabled())
}

async function captureAndAnalyze(
  options: ScreenVisionOptions,
  apiKey: string,
): Promise<ScreenVision | null> {
  // 安全输入期间连截图都不做，避免密码画面进入内存或临时文件。
  const secureInput = await isSecureInputActive()
  if (secureInput === true) {
    latest = null
    notifyStatus({
      lastOutcome: 'skipped-risk',
      lastSkipAt: Date.now(),
      lastSkipLabels: ['密码输入'],
      lastError: null,
    })
    return null
  }

  const frame = await captureScreen()
  if (!frame) {
    latest = null
    notifyStatus({ lastOutcome: 'error', lastError: '屏幕截图不可用' })
    return null
  }
  if (stopRequested(options)) {
    notifyStatus({
      lastOutcome: options.isPaused?.() ? 'skipped-paused' : 'skipped-disabled',
    })
    return null
  }

  const probe = await probeLocalScreen(frame.jpeg)
  if (!probe.ok) {
    latest = null
    notifyStatus({ lastOutcome: 'probe-failed', lastError: '本地敏感内容预检不可用' })
    return null
  }
  const context = riskContextFor(probe.appName)
  const risk = assessScreenRisk({
    ocrText: probe.ocrText,
    appName: probe.appName,
    bundleId: probe.bundleId,
    windowTitle: probe.windowTitle ?? context?.title ?? null,
    url: context?.url ?? null,
    pageText: context?.excerpt ?? null,
    secureInput: probe.secureInput,
  })
  if (risk.sensitive) {
    latest = null
    notifyStatus({
      lastOutcome: 'skipped-risk',
      lastSkipAt: Date.now(),
      lastSkipLabels: risk.labels,
      lastError: null,
    })
    return null
  }
  if (stopRequested(options)) {
    notifyStatus({
      lastOutcome: options.isPaused?.() ? 'skipped-paused' : 'skipped-disabled',
    })
    return null
  }

  const vision = await analyze(frame.dataUrl, apiKey)
  if (!vision) {
    latest = null
    notifyStatus({ lastOutcome: 'error', lastError: '视觉分析未返回结果' })
    return null
  }
  latest = vision
  notifyStatus({
    lastOutcome: 'analyzed',
    lastUploadAt: Date.now(),
    lastError: null,
  })
  return vision
}

async function loadKey(options: ScreenVisionOptions): Promise<string | null> {
  try {
    const key = await options.getApiKey()
    notifyStatus({ keyConfigured: Boolean(key) })
    return key
  } catch {
    notifyStatus({ keyConfigured: false, lastOutcome: 'skipped-no-key' })
    return null
  }
}

async function tick(options: ScreenVisionOptions): Promise<void> {
  if (running) {
    return
  }
  const configured = Boolean(options.isConfigured?.() ?? options.isEnabled())
  if (!configured) {
    latest = null
    notifyStatus({ lastOutcome: 'skipped-disabled' })
    return
  }
  if (options.isPaused?.()) {
    latest = null
    notifyStatus({ lastOutcome: 'skipped-paused' })
    return
  }
  if (!options.isEnabled()) {
    latest = null
    notifyStatus({ lastOutcome: 'skipped-disabled' })
    return
  }
  if (readPermission() !== 'granted') {
    latest = null
    if (!permissionWarned) {
      permissionWarned = true
      console.warn(
        '[vision] 需要屏幕录制权限：系统设置 → 隐私与安全性 → 屏幕录制，勾选「空崎日奈」后重启应用',
      )
    }
    notifyStatus({ lastOutcome: 'skipped-no-permission' })
    return
  }

  running = true
  notifyStatus({ lastRunAt: Date.now(), lastOutcome: 'checking', lastError: null })
  try {
    const apiKey = await loadKey(options)
    if (!apiKey) {
      notifyStatus({ lastOutcome: 'skipped-no-key' })
      return
    }
    await captureAndAnalyze(options, apiKey)
  } catch (error) {
    latest = null
    notifyStatus({
      lastOutcome: 'error',
      lastError: error instanceof Error ? error.message : String(error),
    })
    console.warn('[vision] 屏幕分析失败:', String(error))
  } finally {
    running = false
  }
}

export function startScreenVisionLoop(options: ScreenVisionOptions): () => void {
  loopOptions = options
  status = emptyScreenPerceptionStatus()
  notifyStatus({ lastOutcome: 'idle' })
  if (timer) {
    return () => undefined
  }
  void tick(options)
  timer = setInterval(() => void tick(options), options.intervalMs ?? INTERVAL_MS)
  timer.unref?.()
  return () => {
    const notify = options.onStatusChange
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    loopOptions = null
    latest = null
    status = { ...emptyScreenPerceptionStatus(), lastOutcome: 'skipped-disabled' }
    notify?.(computedStatus())
  }
}

/** 设置页切换开关/暂停后立即重新判断，不必等下一个 8 分钟周期。 */
export function requestScreenVisionTick(): void {
  if (loopOptions) {
    void tick(loopOptions)
  }
}

/** 按需立即做一次截图分析（聊天里明确问到时使用）。 */
export async function requestVisionRefresh(): Promise<ScreenVision | null> {
  const options = loopOptions
  if (!options) {
    return latest
  }
  if (options.isPaused?.() || !options.isEnabled()) {
    notifyStatus({
      lastOutcome: options.isPaused?.() ? 'skipped-paused' : 'skipped-disabled',
    })
    return null
  }
  if (readPermission() !== 'granted') {
    notifyStatus({ lastOutcome: 'skipped-no-permission' })
    return null
  }
  // 如果定时分析正在进行，等它结束再返回，避免刚启动时拿到空结果。
  for (let index = 0; index < 30 && running; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (running) {
    return latest
  }

  running = true
  notifyStatus({ lastRunAt: Date.now(), lastOutcome: 'checking', lastError: null })
  try {
    const apiKey = await loadKey(options)
    if (!apiKey) {
      notifyStatus({ lastOutcome: 'skipped-no-key' })
      return null
    }
    return await captureAndAnalyze(options, apiKey)
  } catch (error) {
    notifyStatus({
      lastOutcome: 'error',
      lastError: error instanceof Error ? error.message : String(error),
    })
    return null
  } finally {
    running = false
  }
}

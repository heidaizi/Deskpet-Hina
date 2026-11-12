import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const MAX_OCR_CHARS = 4_000
const MAX_PROBE_BUFFER = 2 * 1024 * 1024

/**
 * 一个进程里同时做三件只在本机发生的事：
 * 1. 读取 macOS 全局安全输入状态（密码输入框聚焦时为 true）；
 * 2. 读取前台应用名和 bundle id；
 * 3. 用 Vision 做一次快速 OCR，给敏感内容预检提供文字线索。
 *
 * 只返回结构化结果，不返回截图或原始文件路径；调用方负责删除临时图片。
 */
const PROBE_SCRIPT = `
function run(argv) {
  ObjC.import('AppKit')
  ObjC.import('Vision')
  ObjC.import('Carbon')

  var secureInput = null
  try {
    secureInput = Boolean($.IsSecureEventInputEnabled())
  } catch (error) {}

  var appName = null
  var bundleId = null
  try {
    var app = $.NSWorkspace.sharedWorkspace.frontmostApplication
    appName = app.localizedName ? app.localizedName.js : null
    bundleId = app.bundleIdentifier ? app.bundleIdentifier.js : null
  } catch (error) {}

  var ocrText = ''
  var ocrAvailable = false
  try {
    var path = argv[0]
    if (path) {
      var url = $.NSURL.fileURLWithPath(path)
      var handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $())
      var request = $.VNRecognizeTextRequest.alloc.init
      request.recognitionLevel = 1
      request.usesLanguageCorrection = true
      request.recognitionLanguages = ['en-US', 'zh-Hans', 'ja-JP']
      var ok = handler.performRequestsError($.NSArray.arrayWithObject(request), null)
      ocrAvailable = Boolean(ok)
      if (ok && request.results) {
        var lines = []
        for (var index = 0; index < request.results.count; index += 1) {
          var candidates = request.results.objectAtIndex(index).topCandidates(1)
          if (candidates.count > 0) {
            lines.push(candidates.objectAtIndex(0).string.js)
          }
        }
        ocrText = lines.join(String.fromCharCode(10)).slice(0, 4000)
      }
    }
  } catch (error) {}

  return JSON.stringify({
    secureInput: secureInput,
    appName: appName,
    bundleId: bundleId,
    ocrText: ocrText,
    ocrAvailable: ocrAvailable,
  })
}
`

/**
 * 窗口标题单独探测，避免没有自动化权限时拖垮 OCR/安全输入检查。
 * 标题常包含中文页面主题（例如“招商银行个人网银”），是 OCR 的本地补充。
 */
const WINDOW_TITLE_SCRIPT = `
function run() {
  try {
    var systemEvents = Application('System Events')
    var frontProcess = systemEvents.processes.whose({ frontmost: true })[0]
    var windows = frontProcess.windows
    if (windows.length > 0) {
      var value = windows[0].name()
      return value ? String(value) : ''
    }
  } catch (error) {}
  return ''
}
`

export interface LocalScreenProbe {
  ok: boolean
  secureInput: boolean | null
  appName: string | null
  bundleId: string | null
  windowTitle: string | null
  ocrText: string
  ocrAvailable: boolean
}

function failedProbe(): LocalScreenProbe {
  return {
    ok: false,
    secureInput: null,
    appName: null,
    bundleId: null,
    windowTitle: null,
    ocrText: '',
    ocrAvailable: false,
  }
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parseLocalScreenProbe(raw: string): LocalScreenProbe {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const secureInput = typeof parsed.secureInput === 'boolean' ? parsed.secureInput : null
    return {
      ok: true,
      secureInput,
      appName: optionalString(parsed.appName),
      bundleId: optionalString(parsed.bundleId),
      windowTitle: optionalString(parsed.windowTitle),
      ocrText: typeof parsed.ocrText === 'string' ? parsed.ocrText.slice(0, MAX_OCR_CHARS) : '',
      ocrAvailable: parsed.ocrAvailable === true,
    }
  } catch {
    return failedProbe()
  }
}

const SECURE_INPUT_SCRIPT = `
function run() {
  ObjC.import('Carbon')
  try {
    return $.IsSecureEventInputEnabled() ? '1' : '0'
  } catch (error) {
    return ''
  }
}
`

/** 在截图之前先问系统是否处于安全输入；true 时连截图都不做。 */
export async function isSecureInputActive(): Promise<boolean | null> {
  try {
    const result = (await execFileAsync(
      'osascript',
      ['-l', 'JavaScript', '-e', SECURE_INPUT_SCRIPT],
      { timeout: 1_500, maxBuffer: 16 * 1024 },
    )) as { stdout: string; stderr: string }
    const value = result.stdout.trim()
    return value === '1' ? true : value === '0' ? false : null
  } catch {
    return null
  }
}

async function probeWindowTitle(): Promise<string | null> {
  try {
    const result = (await execFileAsync(
      'osascript',
      ['-l', 'JavaScript', '-e', WINDOW_TITLE_SCRIPT],
      { timeout: 1_500, maxBuffer: 64 * 1024 },
    )) as { stdout: string; stderr: string }
    const title = result.stdout.trim()
    return title || null
  } catch {
    return null
  }
}

/** 失败时返回 ok=false，调用方应跳过本次上传，而不是把未预检的截图发出去。 */
export async function probeLocalScreen(image: Uint8Array): Promise<LocalScreenProbe> {
  const directory = mkdtempSync(join(tmpdir(), 'deskpet-screen-probe-'))
  const imagePath = join(directory, 'screen.jpg')
  try {
    writeFileSync(imagePath, image, { mode: 0o600 })
    const result = (await execFileAsync(
      'osascript',
      ['-l', 'JavaScript', '-e', PROBE_SCRIPT, '--', imagePath],
      { timeout: 6_000, maxBuffer: MAX_PROBE_BUFFER },
    )) as { stdout: string; stderr: string }
    const line = result.stdout
      .trim()
      .split('\n')
      .filter((part) => part.trim())
      .at(-1)
    const probe = line ? parseLocalScreenProbe(line) : failedProbe()
    if (!probe.ok) {
      return probe
    }
    const windowTitle = await probeWindowTitle()
    return windowTitle ? { ...probe, windowTitle } : probe
  } catch {
    return failedProbe()
  } finally {
    try {
      rmSync(directory, { recursive: true, force: true })
    } catch {
      // 临时目录清理失败不应阻断本次结果。
    }
  }
}

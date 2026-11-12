import { execFile } from 'node:child_process'
import { shell, systemPreferences } from 'electron'
import { promisify } from 'node:util'
import type {
  PermissionService,
  PermissionSnapshot,
  PermissionState,
} from '../../shared/permissions'

const execFileAsync = promisify(execFile)
const AUTOMATION_PROBE =
  'tell application "System Events" to get name of first process whose frontmost is true'

const PERMISSION_URLS: Record<PermissionService, string> = {
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
}

function mapScreenState(value: string): PermissionState {
  if (value === 'granted' || value === 'denied' || value === 'restricted') {
    return value
  }
  if (value === 'not-determined') {
    return 'not-determined'
  }
  return 'unknown'
}

function readScreenState(): PermissionState {
  try {
    return mapScreenState(systemPreferences.getMediaAccessStatus('screen'))
  } catch {
    return 'unknown'
  }
}

function readAccessibilityState(): PermissionState {
  try {
    return systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied'
  } catch {
    return 'unknown'
  }
}

function readErrorText(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return ''
  }
  const value = error as { message?: unknown; stderr?: unknown }
  return [
    typeof value.message === 'string' ? value.message : '',
    typeof value.stderr === 'string' ? value.stderr : '',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 300)
}

async function probeAutomationPermission(): Promise<
  Pick<PermissionSnapshot, 'automation' | 'automationDetail'>
> {
  try {
    const result = (await execFileAsync('osascript', ['-e', AUTOMATION_PROBE], {
      timeout: 2_500,
      maxBuffer: 64 * 1024,
    })) as { stdout: string; stderr: string }
    if (result.stdout.trim()) {
      return { automation: 'granted', automationDetail: null }
    }
    return { automation: 'unknown', automationDetail: '系统未返回前台应用名称' }
  } catch (error) {
    const text = readErrorText(error)
    if (/-(?:1743|10004)|not authorized|not allowed|privilege|未授权|不允许/iu.test(text)) {
      return { automation: 'denied', automationDetail: 'System Events 自动化未授权' }
    }
    if (/timed? ?out|timeout|超时/iu.test(text)) {
      return { automation: 'unknown', automationDetail: '自动化检测超时' }
    }
    return { automation: 'unknown', automationDetail: '自动化状态无法确认' }
  }
}

/**
 * 读取三项系统权限。屏幕录制与辅助功能是同步读取；
 * 自动化没有 Electron API，需要 AppleScript 探针，因此只在显式“重新检测”时运行。
 */
export async function getPermissionSnapshot(probeAutomation = false): Promise<PermissionSnapshot> {
  const automation = probeAutomation
    ? await probeAutomationPermission()
    : {
        automation: 'unknown' as const,
        automationDetail: '点击「重新检测」检查自动化授权',
      }
  return {
    screen: readScreenState(),
    accessibility: readAccessibilityState(),
    ...automation,
    checkedAt: Date.now(),
  }
}

export async function openPermissionSettings(service: PermissionService): Promise<void> {
  await shell.openExternal(PERMISSION_URLS[service])
}

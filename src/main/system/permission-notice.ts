import { IS_E2E } from '../config'
import { state } from '../app-state'
import { sendRendererCommand } from '../renderer/commands'
import { getPermissionSnapshot } from './permissions'

let scheduled = false

function showBubble(dialogue: string, attempt = 0): void {
  const window = state.petWindow
  if (!window || window.isDestroyed()) {
    return
  }
  if (window.webContents.isLoading() && attempt < 3) {
    setTimeout(() => showBubble(dialogue, attempt + 1), 1_200).unref?.()
    return
  }
  sendRendererCommand({
    action: 'idle',
    expression: 'neutral',
    dialogue,
    speakDialogue: false,
    bodyPolicy: 'replace',
  })
}

function screenPermissionMessage(value: 'denied' | 'not-determined' | 'restricted'): string {
  if (value === 'restricted') {
    return '老师，屏幕录制被系统限制了。请在系统设置 → 隐私与安全性 → 屏幕录制里检查一下。'
  }
  if (value === 'not-determined') {
    return '老师，我还没有屏幕录制权限。请在系统设置 → 隐私与安全性 → 屏幕录制里允许「空崎日奈」。'
  }
  return '老师，我现在看不见屏幕了。更新后 macOS 可能收回了权限，请在系统设置 → 隐私与安全性 → 屏幕录制里重新允许我。'
}

/**
 * 启动时只在“用户确实开启了屏幕感知”时提醒，避免把主动关闭误报成故障。
 * 先查屏幕录制；屏幕正常时再检测自动化，避免一次弹两个授权框。
 */
export function schedulePermissionNotice(): void {
  if (IS_E2E || scheduled) {
    return
  }
  scheduled = true
  setTimeout(async () => {
    const settings = state.petController?.getSettings()
    if (!settings?.aiEnabled || !settings.screenPerceptionEnabled) {
      return
    }
    const initial = await getPermissionSnapshot(false)
    if (initial.screen !== 'granted') {
      if (
        initial.screen === 'denied' ||
        initial.screen === 'not-determined' ||
        initial.screen === 'restricted'
      ) {
        showBubble(screenPermissionMessage(initial.screen))
      }
      return
    }
    const full = await getPermissionSnapshot(true)
    if (full.automation === 'denied') {
      showBubble(
        '老师，我读不到当前页面了。请在系统设置 → 隐私与安全性 → 自动化里重新允许我控制 System Events 和浏览器。',
      )
    }
  }, 3_500).unref?.()
}

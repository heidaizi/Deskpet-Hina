import type { BrowserWindow } from 'electron'

/**
 * 让窗口对屏幕截图/录制「透明」。
 *
 * 日奈的屏幕感知走 desktopCapturer 截屏；对话窗、设置窗属于我们自己的 UI，
 * 不应出现在她看到的画面里（否则她会看到自己和你的对话）。
 * macOS 上通过 NSWindowSharingNone 实现，用户自己的正常使用不受影响。
 */
export function excludeFromScreenCapture(window: BrowserWindow): void {
  if (process.platform !== 'darwin') {
    return
  }
  const apply = (): void => {
    if (window.isDestroyed()) {
      return
    }
    try {
      window.setContentProtection(true)
    } catch {
      // 某些平台/窗口类型不支持，忽略即可
    }
  }
  apply()
  // macOS 上窗口首次 show 之后才会真正生效，这里再补一次。
  window.once('show', apply)
  window.once('ready-to-show', apply)
}

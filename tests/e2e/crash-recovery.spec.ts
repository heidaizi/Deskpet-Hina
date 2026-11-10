import { _electron as electron, expect, test } from '@playwright/test'
import type { DeskpetApi } from '../../src/shared/types'

declare global {
  interface Window {
    deskpet: DeskpetApi
  }
}

test('M5.8 renderer crash is recorded and the pet window recovers', async () => {
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...(process.env as Record<string, string>),
      DESKPET_E2E: '1',
    },
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')

    // 崩溃后主进程会重建窗口，因此先等待新窗口事件再操作。
    const recoveredWindow = electronApp.waitForEvent('window', { timeout: 25_000 })
    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((item) => item.getTitle() === 'Deskpet')
      window?.webContents.forcefullyCrashRenderer()
    })

    const recovered = await recoveredWindow
    await recovered.waitForFunction(() => document.body.dataset.ready === 'true')

    const runtime = await recovered.evaluate(() => window.deskpet.getRuntimeInfo())
    expect(runtime.lastErrorAt).toBeTruthy()
    expect(runtime.lastErrorMessage).toContain('renderer killed')
  } finally {
    await electronApp.close()
  }
})

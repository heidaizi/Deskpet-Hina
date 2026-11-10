import { _electron as electron, expect, test } from '@playwright/test'
import type { DeskpetApi } from '../../src/shared/types'

declare global {
  interface Window {
    deskpet: DeskpetApi
  }
}

test('M6 chat window opens, sends and reports missing AI configuration', async () => {
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...(process.env as Record<string, string>),
      DESKPET_E2E: '1',
    },
  })

  try {
    const petPage = await electronApp.firstWindow()
    await petPage.waitForFunction(() => document.body.dataset.ready === 'true')

    const chatWindowPromise = electronApp.waitForEvent('window')
    await petPage.evaluate(() => window.deskpet.openChat())
    const chatPage = await chatWindowPromise
    await chatPage.waitForFunction(() => document.querySelector('#chat-input') !== null)

    const windows = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => ({
        title: window.getTitle(),
        protected: window.isContentProtected(),
      })),
    )
    const chatWindow = windows.find((window) => window.title === '和日奈说话')
    expect(chatWindow?.protected).toBe(true)
    expect(windows.some((window) => window.title === 'Deskpet' && window.protected)).toBe(false)

    await expect(chatPage.locator('h1')).toHaveText('和日奈说话')
    await expect(chatPage.locator('#chat-empty')).toContainText('还没有聊过')

    await chatPage.locator('#chat-input').fill('今天天气怎么样？')
    await chatPage.locator('#chat-send').click()

    await expect(chatPage.locator('#chat-status')).toContainText('先在设置里启用 DeepSeek')
    await expect(chatPage.locator('.chat-row.is-user')).toHaveCount(1)
  } finally {
    await electronApp.close()
  }
})

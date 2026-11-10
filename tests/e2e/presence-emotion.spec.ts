import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test('M5.3 emotion reacts to repeated interactions and survives restart', async () => {
  test.setTimeout(30_000)
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'deskpet-e2e-emotion-'))
  const emotionPath = join(userDataDirectory, 'presence-emotion.json')
  const launchOptions = {
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...(process.env as Record<string, string>),
      DESKPET_E2E: '1',
      DESKPET_E2E_USER_DATA: userDataDirectory,
      DESKPET_E2E_FOREGROUND_APP: 'Google Chrome',
      DESKPET_E2E_SYSTEM_IDLE_SECONDS: '0',
      DESKPET_TIME_SCENE_INTERVAL_MS: '100',
      DESKPET_PRESENCE_FOCUS_FIRST_MS: '60000',
      DESKPET_PRESENCE_FOCUS_LONG_MS: '120000',
      DESKPET_PRESENCE_RETURN_AFTER_MS: '60000',
      DESKPET_PRESENCE_RESTART_RETURN_AFTER_MS: '120000',
      DESKPET_PRESENCE_INTERACTION_GRACE_MS: '100',
      DESKPET_PRESENCE_SPEECH_GAP_MS: '1000',
      DESKPET_PRESENCE_SCENE_STABLE_MS: '60000',
      DESKPET_PRESENCE_LATE_NIGHT_STABLE_MS: '60000',
      DESKPET_PRESENCE_IDLE_MICRO_MS: '60000',
    },
  }

  const firstApp = await electron.launch(launchOptions)
  let patienceAfterTaps = 0
  try {
    const page = await firstApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')
    await page.waitForTimeout(300)
    const initial = await page.evaluate(async () => {
      const runtime = await window.deskpet.getRuntimeInfo()
      return runtime.presencePatience
    })
    expect(initial).not.toBeNull()

    for (let index = 0; index < 3; index += 1) {
      await page.locator('#pet-canvas').click({ position: { x: 170, y: 148 } })
      await page.waitForTimeout(150)
    }

    await expect
      .poll(async () => {
        const runtime = await page.evaluate(() => window.deskpet.getRuntimeInfo())
        return runtime.presencePatience ?? 100
      })
      .toBeLessThan(initial ?? 100)
    patienceAfterTaps = await page.evaluate(async () => {
      const runtime = await window.deskpet.getRuntimeInfo()
      return runtime.presencePatience ?? 0
    })
  } finally {
    const closed = firstApp.waitForEvent('close')
    await firstApp.evaluate(({ app }) => {
      app.quit()
    })
    await closed
  }

  expect(existsSync(emotionPath)).toBe(true)
  expect(statSync(emotionPath).mode & 0o777).toBe(0o600)

  const secondApp = await electron.launch(launchOptions)
  try {
    const page = await secondApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')
    await expect
      .poll(async () => {
        const runtime = await page.evaluate(() => window.deskpet.getRuntimeInfo())
        return {
          enabled: runtime.presenceEmotionEnabled,
          patience: runtime.presencePatience,
        }
      })
      .toMatchObject({ enabled: true })
    const restored = await page.evaluate(async () => {
      const runtime = await window.deskpet.getRuntimeInfo()
      return runtime.presencePatience ?? 0
    })
    expect(Math.abs(restored - patienceAfterTaps)).toBeLessThanOrEqual(2)
  } finally {
    await secondApp.close()
    rmSync(userDataDirectory, { recursive: true, force: true })
  }
})

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { openSettingsTab } from './settings-tabs'
import type { DeskpetApi } from '../../src/shared/types'

declare global {
  interface Window {
    deskpet: DeskpetApi
  }
}

test('M4 rendering and TTS follow screen, power, and idle resource policy', async () => {
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'deskpet-e2e-governance-'))
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...(process.env as Record<string, string>),
      DESKPET_E2E: '1',
      DESKPET_E2E_USER_DATA: userDataDirectory,
      DESKPET_IRODORI_PREWARM: '0',
    },
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')
    await expect(page.locator('body')).toHaveAttribute('data-render-power-mode', /active|idle/)
    await expect(page.locator('#pet-canvas')).toHaveAttribute(
      'data-render-power-mode',
      /active|idle/,
    )

    await electronApp.evaluate(({ powerMonitor }) => {
      powerMonitor.emit('on-battery')
    })
    await expect(page.locator('body')).toHaveAttribute('data-system-on-battery', 'true')
    await page.waitForTimeout(4_250)
    await expect(page.locator('body')).toHaveAttribute('data-render-power-mode', 'low-power')
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.getTitle() === 'Deskpet')
        ?.webContents.send('pet:renderer-command', {
          action: 'wave',
          expression: 'happy',
          performanceToken: 'm56-low-power',
          bodyPolicy: 'replace',
          activityClass: 'ambient',
        })
    })
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.performancePrepDelayMs ?? ''))
      .toBe('0')
    await expect(page.locator('body')).toHaveAttribute('data-render-power-mode', 'low-power')
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.getTitle() === 'Deskpet')
        ?.webContents.send('pet:gaze-point', { x: 300, y: 90 })
    })
    await expect(page.locator('body')).toHaveAttribute('data-render-power-mode', 'active')

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('body')).toHaveAttribute('data-render-power-mode', 'low-power')
    await expect(page.locator('#pet-canvas')).toHaveAttribute('data-render-power-mode', 'low-power')

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(page.locator('body')).not.toHaveAttribute('data-render-power-mode', 'paused')

    await electronApp.evaluate(({ powerMonitor }) => {
      powerMonitor.emit('lock-screen')
    })
    await expect(page.locator('body')).toHaveAttribute('data-render-power-mode', 'paused')
    await expect(page.locator('body')).toHaveAttribute('data-voice-status', 'idle')
    await electronApp.evaluate(({ powerMonitor }) => {
      powerMonitor.emit('unlock-screen')
    })
    await expect(page.locator('body')).not.toHaveAttribute('data-render-power-mode', 'paused')

    await electronApp.evaluate(({ powerMonitor }) => {
      powerMonitor.emit('suspend')
    })
    await expect(page.locator('body')).toHaveAttribute('data-render-power-mode', 'paused')
    await electronApp.evaluate(({ powerMonitor }) => {
      powerMonitor.emit('resume')
    })
    await expect(page.locator('body')).not.toHaveAttribute('data-render-power-mode', 'paused')

    const resourceSnapshot = await page.evaluate(() => window.deskpet.getResourceSnapshot())
    expect(resourceSnapshot.tts).toMatchObject({
      enabled: true,
      state: 'unloaded',
    })
    expect(resourceSnapshot.tts.pid).toBeUndefined()
    expect(resourceSnapshot.ttsMemoryMB).toBeNull()
    expect(resourceSnapshot.appMemoryMB).toBeGreaterThan(0)
    expect(resourceSnapshot.appCpuPercent).toBeGreaterThanOrEqual(0)
    expect(resourceSnapshot.cacheBytes).toBeGreaterThanOrEqual(0)
    expect(resourceSnapshot.logBytes).toBeGreaterThanOrEqual(0)

    const timeScene = await page.evaluate(() => window.deskpet.getTimeSceneContext())
    expect(timeScene).toMatchObject({
      foregroundApp: 'Google Chrome',
      scene: 'browser',
      screenLocked: false,
      suspended: false,
    })
    expect(timeScene.localTime).toMatch(/^\d{2}:\d{2}$/)
    expect(timeScene.systemIdleSeconds).toBeGreaterThanOrEqual(0)

    const settingsWindowPromise = electronApp.waitForEvent('window')
    await page.evaluate(() => window.deskpet.openSettings())
    const settingsPage = await settingsWindowPromise
    await settingsPage.waitForFunction(() => document.body.dataset.ready === 'true')
    await expect
      .poll(() => settingsPage.evaluate(() => document.body.dataset.resourceReady ?? ''))
      .toBe('true')
    await expect(settingsPage.locator('#resource-tts-state')).toHaveText('未加载')
    await expect(settingsPage.locator('#resource-app-usage')).not.toHaveText('—')
    await expect(settingsPage.locator('#resource-cache')).not.toHaveText('—')
    await expect(settingsPage.locator('#resource-log')).not.toHaveText('—')
    await expect(settingsPage.locator('#telemetry-decisions')).not.toHaveText('—')
    await expect(settingsPage.locator('#telemetry-silent-ratio')).toContainText('%')
    await expect
      .poll(() => settingsPage.evaluate(() => document.body.dataset.timeSceneReady ?? ''))
      .toBe('true')
    await expect(settingsPage.locator('#context-clock')).not.toHaveText('读取中')
    await expect(settingsPage.locator('#context-scene')).toHaveText('浏览网页')
    await expect(settingsPage.locator('#context-app')).toHaveText('Google Chrome')

    await openSettingsTab(settingsPage, 'ai')
    await settingsPage.locator('#preload-tts').click()
    await expect(settingsPage.locator('#resource-tts-state')).toHaveText('未加载')
    expect(await settingsPage.evaluate(() => window.deskpet.getResourceSnapshot())).toMatchObject({
      tts: {
        enabled: true,
        state: 'unloaded',
      },
      ttsMemoryMB: null,
    })

    await openSettingsTab(settingsPage, 'behavior')
    await settingsPage.locator('#local-tts-enabled').uncheck()
    await expect(settingsPage.locator('#resource-tts-state')).toHaveText('已关闭')
    await expect(settingsPage.locator('#resource-note')).toContainText('不会加载 Irodori 模型')

    await settingsPage.locator('#local-tts-enabled').check()
    await expect(settingsPage.locator('#resource-tts-state')).toHaveText('未加载')
    expect(await settingsPage.evaluate(() => window.deskpet.getResourceSnapshot())).toMatchObject({
      tts: {
        enabled: true,
        state: 'unloaded',
      },
    })
  } finally {
    await electronApp.close()
    rmSync(userDataDirectory, { recursive: true, force: true })
  }
})

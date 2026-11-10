import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test('scene companionship uses bundled Hina audio without loading Irodori', async () => {
  test.setTimeout(20_000)
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'deskpet-e2e-scene-'))
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...(process.env as Record<string, string>),
      DESKPET_E2E: '1',
      DESKPET_E2E_USER_DATA: userDataDirectory,
      DESKPET_E2E_FOREGROUND_APP: 'Visual Studio Code',
      DESKPET_PRESENCE_MODE: 'legacy',
      DESKPET_TIME_SCENE_INTERVAL_MS: '200',
      DESKPET_SCENE_INTERACTION_GRACE_MS: '100',
      DESKPET_SCENE_STABLE_MS: '600',
      DESKPET_SCENE_COOLDOWN_MS: '60000',
    },
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')

    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastPerformanceId ?? ''), {
        timeout: 8_000,
      })
      .not.toBe('')
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastVoiceSource ?? ''))
      .toMatch(/^(official|prebuilt-tts)$/)

    const resources = await page.evaluate(() => window.deskpet.getResourceSnapshot())
    expect(resources.tts.state).toBe('unloaded')
    expect(resources.tts.pid).toBeUndefined()
    expect(resources.ttsMemoryMB).toBeNull()
  } finally {
    await electronApp.close()
    rmSync(userDataDirectory, { recursive: true, force: true })
  }
})

test('active presence routes scene companionship through the central arbiter', async () => {
  test.setTimeout(20_000)
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'deskpet-e2e-scene-presence-'))
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...(process.env as Record<string, string>),
      DESKPET_E2E: '1',
      DESKPET_E2E_USER_DATA: userDataDirectory,
      DESKPET_E2E_FOREGROUND_APP: 'Visual Studio Code',
      DESKPET_E2E_SYSTEM_IDLE_SECONDS: '0',
      DESKPET_PRESENCE_MODE: 'active',
      DESKPET_TIME_SCENE_INTERVAL_MS: '200',
      DESKPET_PRESENCE_INTERACTION_GRACE_MS: '100',
      DESKPET_PRESENCE_SPEECH_GAP_MS: '100',
      DESKPET_SCENE_STABLE_MS: '600',
      DESKPET_SCENE_COOLDOWN_MS: '60000',
    },
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')

    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastPerformanceId ?? ''), {
        timeout: 8_000,
      })
      .not.toBe('')
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastVoiceSource ?? ''))
      .toMatch(/^(official|prebuilt-tts)$/)
    await expect
      .poll(async () => {
        const runtime = await page.evaluate(() => window.deskpet.getRuntimeInfo())
        return runtime.presenceLastRuleId
      })
      .toMatch(/^scene-companion:/)

    const resources = await page.evaluate(() => window.deskpet.getResourceSnapshot())
    expect(resources.tts.state).toBe('unloaded')
    expect(resources.tts.pid).toBeUndefined()
  } finally {
    await electronApp.close()
    rmSync(userDataDirectory, { recursive: true, force: true })
  }
})

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'

function presenceEnvironment(
  userDataDirectory: string,
  mode: 'speak' | 'silent' | 'delay',
): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    DESKPET_E2E: '1',
    DESKPET_E2E_USER_DATA: userDataDirectory,
    DESKPET_E2E_FOREGROUND_APP: 'Visual Studio Code',
    DESKPET_E2E_SYSTEM_IDLE_SECONDS: '0',
    DESKPET_E2E_PROACTIVE_AI_PLAN: mode,
    DESKPET_E2E_PROACTIVE_AI_DELAY_MS: mode === 'delay' ? '2500' : '0',
    DESKPET_TIME_SCENE_INTERVAL_MS: '100',
    DESKPET_PRESENCE_FOCUS_FIRST_MS: '2000',
    DESKPET_PRESENCE_FOCUS_LONG_MS: '20000',
    DESKPET_PRESENCE_RETURN_AFTER_MS: '60000',
    DESKPET_PRESENCE_IDLE_RETURN_AFTER_MS: '60000',
    DESKPET_PRESENCE_INTERACTION_GRACE_MS: '100',
    DESKPET_PRESENCE_SPEECH_GAP_MS: '100',
    DESKPET_PRESENCE_SCENE_STABLE_MS: '60000',
    DESKPET_PRESENCE_LATE_NIGHT_STABLE_MS: '60000',
    DESKPET_PRESENCE_IDLE_MICRO_MS: '60000',
    DESKPET_PRESENCE_PROACTIVE_AI_TIMEOUT_MS: '10000',
  }
}

async function enableProactiveAi(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.deskpet.updateSettings({
      aiEnabled: true,
      aiProactiveEnabled: true,
    }),
  )
}

test('M5.5 adopts a proactive AI line from a high-value local event', async () => {
  test.setTimeout(30_000)
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'deskpet-e2e-proactive-ai-speak-'))
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: presenceEnvironment(userDataDirectory, 'speak'),
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')
    expect(
      (await page.evaluate(() => window.deskpet.getRuntimeInfo())).presenceProactiveAiRequestLimit,
    ).toBe(4)

    await enableProactiveAi(page)
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastPerformanceId ?? ''), {
        timeout: 12_000,
      })
      .toBe('presence:proactive-ai:notice')
    await expect(page.locator('#bubble')).toContainText('先喘口气')

    const runtime = await page.evaluate(() => window.deskpet.getRuntimeInfo())
    expect(runtime).toMatchObject({
      presenceProactiveAiEnabled: true,
      presenceProactiveAiRequestsLastHour: 1,
      presenceProactiveAiRequestLimit: 4,
      presenceLastProactiveAiOutcome: 'speaking',
      presenceLastProactiveAiIntent: 'notice',
    })

    const settingsWindowPromise = electronApp.waitForEvent('window')
    await page.evaluate(() => window.deskpet.openSettings())
    const settingsPage = await settingsWindowPromise
    await settingsPage.waitForFunction(() => document.body.dataset.ready === 'true')
    await expect(settingsPage.locator('#ai-proactive-enabled')).toBeChecked()
    await expect(settingsPage.locator('#ai-proactive-enabled')).toBeEnabled()
    await expect(settingsPage.locator('#ai-status')).toContainText('主动请求 1/4 次每小时')
    await expect(settingsPage.locator('#ai-status')).toContainText('已采用 AI 台词')
  } finally {
    await electronApp.close()
    rmSync(userDataDirectory, { recursive: true, force: true })
  }
})

test('M5.5 keeps the pet quiet when the planner chooses silence', async () => {
  test.setTimeout(25_000)
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'deskpet-e2e-proactive-ai-silent-'))
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: presenceEnvironment(userDataDirectory, 'silent'),
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')
    await enableProactiveAi(page)

    await expect
      .poll(async () => {
        const runtime = await page.evaluate(() => window.deskpet.getRuntimeInfo())
        return runtime.presenceLastProactiveAiOutcome
      })
      .toBe('silent')
    expect(await page.evaluate(() => document.body.dataset.lastPerformanceId ?? '')).not.toBe(
      'presence:proactive-ai:quiet_company',
    )
    await expect(page.locator('#bubble')).toHaveAttribute('data-visible', 'false')
    expect(await page.evaluate(() => window.deskpet.getRuntimeInfo())).toMatchObject({
      presenceProactiveAiRequestsLastHour: 1,
      presenceLastProactiveAiIntent: 'quiet_company',
    })
  } finally {
    await electronApp.close()
    rmSync(userDataDirectory, { recursive: true, force: true })
  }
})

test('M5.5 discards a delayed proactive result after the user interacts', async () => {
  test.setTimeout(30_000)
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'deskpet-e2e-proactive-ai-cancel-'))
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: presenceEnvironment(userDataDirectory, 'delay'),
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')
    await enableProactiveAi(page)

    await expect
      .poll(async () => {
        const runtime = await page.evaluate(() => window.deskpet.getRuntimeInfo())
        return runtime.presenceLastProactiveAiOutcome
      })
      .toBe('pending')
    await page.evaluate(() => window.deskpet.interact({ kind: 'tap', area: 'head' }))
    await expect
      .poll(async () => {
        const runtime = await page.evaluate(() => window.deskpet.getRuntimeInfo())
        return runtime.presenceLastProactiveAiOutcome
      })
      .toBe('cancelled:user')

    await page.waitForTimeout(2_800)
    expect(await page.evaluate(() => document.body.dataset.lastPerformanceId ?? '')).not.toBe(
      'presence:proactive-ai:notice',
    )
    expect(
      (await page.evaluate(() => window.deskpet.getRuntimeInfo())).presenceLastProactiveAiOutcome,
    ).toBe('cancelled:user')
  } finally {
    await electronApp.close()
    rmSync(userDataDirectory, { recursive: true, force: true })
  }
})

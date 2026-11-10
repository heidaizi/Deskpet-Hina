import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

interface PersistedPresenceSession {
  recentDialogues: Array<{ textHash: string; tags: string[] }>
}

test('M5.1 active presence owns the focus milestone without double scheduling', async () => {
  test.setTimeout(25_000)
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'deskpet-e2e-presence-'))
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...(process.env as Record<string, string>),
      DESKPET_E2E: '1',
      DESKPET_E2E_USER_DATA: userDataDirectory,
      DESKPET_E2E_FOREGROUND_APP: 'Visual Studio Code',
      DESKPET_E2E_SYSTEM_IDLE_SECONDS: '0',
      DESKPET_TIME_SCENE_INTERVAL_MS: '100',
      DESKPET_PRESENCE_FOCUS_FIRST_MS: '4000',
      DESKPET_PRESENCE_FOCUS_LONG_MS: '20000',
      DESKPET_PRESENCE_RETURN_AFTER_MS: '60000',
      DESKPET_PRESENCE_IDLE_RETURN_AFTER_MS: '60000',
      DESKPET_PRESENCE_INTERACTION_GRACE_MS: '100',
      DESKPET_PRESENCE_SPEECH_GAP_MS: '100',
      DESKPET_PRESENCE_SCENE_STABLE_MS: '60000',
      DESKPET_PRESENCE_LATE_NIGHT_STABLE_MS: '60000',
      DESKPET_PRESENCE_IDLE_MICRO_MS: '60000',
    },
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')
    await expect
      .poll(async () => {
        const runtime = await page.evaluate(() => window.deskpet.getRuntimeInfo())
        return runtime.presenceMode
      })
      .toBe('active')

    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastPerformanceId ?? ''), {
        timeout: 12_000,
      })
      .toBe('presence:focus-first-milestone')

    await expect
      .poll(async () => {
        const runtime = await page.evaluate(() => window.deskpet.getRuntimeInfo())
        return runtime.presenceLastRuleId
      })
      .toBe('focus-first-milestone')
    // 投递必须被仲裁总线记录；缺少 observeDecision 调用时这里会是 0。
    await expect
      .poll(async () => {
        const runtime = await page.evaluate(() => window.deskpet.getRuntimeInfo())
        return runtime.decisionObservations
      })
      .toBeGreaterThan(0)
    expect(await page.evaluate(() => window.deskpet.getRuntimeInfo())).toMatchObject({
      presenceProactiveAiEnabled: false,
      presenceProactiveAiRequestsLastHour: 0,
      presenceLastProactiveAiOutcome: null,
    })

    await expect
      .poll(
        async () => {
          const runtime = await page.evaluate(() => window.deskpet.getRuntimeInfo())
          return runtime.presenceSpeechState
        },
        { timeout: 10_000 },
      )
      .toBe('idle')

    await page.waitForTimeout(1_500)
    expect(await page.evaluate(() => document.body.dataset.lastPerformanceId)).toBe(
      'presence:focus-first-milestone',
    )
  } finally {
    await electronApp.close()
    rmSync(userDataDirectory, { recursive: true, force: true })
  }
})

test('M5.2 restores a cross-restart return and persists dialogue history', async () => {
  test.setTimeout(25_000)
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'deskpet-e2e-presence-session-'))
  const sessionPath = join(userDataDirectory, 'presence-session.json')
  const now = Date.now()
  writeFileSync(
    sessionPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        sessionStartedAt: now - 3 * 3_600_000,
        lastSeenAt: now - 2 * 3_600_000,
        lastInteractionAt: now - 2 * 3_600_000,
        lastExternalScene: 'development',
        lastTimePeriod: 'afternoon',
        recentDialogues: [],
        tagLastUsedAt: {},
      },
      null,
      2,
    ),
    'utf8',
  )
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...(process.env as Record<string, string>),
      DESKPET_E2E: '1',
      DESKPET_E2E_USER_DATA: userDataDirectory,
      DESKPET_E2E_FOREGROUND_APP: 'Visual Studio Code',
      DESKPET_E2E_SYSTEM_IDLE_SECONDS: '0',
      DESKPET_TIME_SCENE_INTERVAL_MS: '100',
      DESKPET_PRESENCE_FOCUS_FIRST_MS: '60000',
      DESKPET_PRESENCE_FOCUS_LONG_MS: '120000',
      DESKPET_PRESENCE_RETURN_AFTER_MS: '60000',
      DESKPET_PRESENCE_RESTART_RETURN_AFTER_MS: '60000',
      DESKPET_PRESENCE_RESTART_RETURN_DELAY_MS: '100',
      DESKPET_PRESENCE_INTERACTION_GRACE_MS: '100',
      DESKPET_PRESENCE_SPEECH_GAP_MS: '100',
      DESKPET_PRESENCE_SCENE_STABLE_MS: '60000',
      DESKPET_PRESENCE_LATE_NIGHT_STABLE_MS: '60000',
      DESKPET_PRESENCE_IDLE_MICRO_MS: '60000',
    },
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastPerformanceId ?? ''), {
        timeout: 10_000,
      })
      .toBe('presence:return-greeting')
    await expect
      .poll(async () => {
        const runtime = await page.evaluate(() => window.deskpet.getRuntimeInfo())
        return runtime.presenceLastRuleId
      })
      .toBe('return-greeting')
  } finally {
    await electronApp.close()
  }

  try {
    const persisted = JSON.parse(readFileSync(sessionPath, 'utf8')) as PersistedPresenceSession
    expect(persisted.recentDialogues.length).toBeGreaterThanOrEqual(1)
    expect(persisted.recentDialogues.at(-1)?.tags).toContain('return')
  } finally {
    rmSync(userDataDirectory, { recursive: true, force: true })
  }
})

test('M5.7 autonomy off keeps active Presence silent without blocking observation', async () => {
  test.setTimeout(20_000)
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'deskpet-e2e-autonomy-off-'))
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...(process.env as Record<string, string>),
      DESKPET_E2E: '1',
      DESKPET_E2E_USER_DATA: userDataDirectory,
      DESKPET_E2E_FOREGROUND_APP: 'Visual Studio Code',
      DESKPET_E2E_SYSTEM_IDLE_SECONDS: '0',
      DESKPET_TIME_SCENE_INTERVAL_MS: '100',
      DESKPET_PRESENCE_FOCUS_FIRST_MS: '1200',
      DESKPET_PRESENCE_FOCUS_LONG_MS: '20000',
      DESKPET_PRESENCE_INTERACTION_GRACE_MS: '100',
      DESKPET_PRESENCE_SPEECH_GAP_MS: '100',
      DESKPET_PRESENCE_SCENE_STABLE_MS: '60000',
      DESKPET_PRESENCE_LATE_NIGHT_STABLE_MS: '60000',
      DESKPET_PRESENCE_IDLE_MICRO_MS: '60000',
    },
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')
    await page.evaluate(() => window.deskpet.updateSettings({ presenceAutonomyEnabled: false }))
    await page.waitForTimeout(3_000)
    const runtime = await page.evaluate(() => window.deskpet.getRuntimeInfo())

    expect(runtime).toMatchObject({
      presenceAutonomyEnabled: false,
      presenceMode: 'active',
      presenceLastRuleId: null,
    })
    expect(runtime.presenceTelemetry).toMatchObject({
      performed: 0,
      silentDecisions: expect.any(Number),
    })
    expect(await page.evaluate(() => document.body.dataset.lastPerformanceId ?? '')).not.toBe(
      'presence:focus-first-milestone',
    )
  } finally {
    await electronApp.close()
    rmSync(userDataDirectory, { recursive: true, force: true })
  }
})

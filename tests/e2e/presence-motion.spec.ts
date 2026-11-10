import { _electron as electron, expect, test } from '@playwright/test'

function launchOptions() {
  return {
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...(process.env as Record<string, string>),
      DESKPET_E2E: '1',
      DESKPET_IRODORI_PREWARM: '0',
      DESKPET_PRESENCE_MODE: 'legacy',
    },
  }
}

function sendCommand(
  electronApp: Awaited<ReturnType<typeof electron.launch>>,
  command: Record<string, unknown>,
): Promise<void> {
  return electronApp.evaluate(({ BrowserWindow }, payload) => {
    BrowserWindow.getAllWindows()
      .find((window) => window.getTitle() === 'Deskpet')
      ?.webContents.send('pet:renderer-command', payload)
  }, command)
}

test('M5.6 sequences action preparation, expression and recovery', async () => {
  const electronApp = await electron.launch(launchOptions())
  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')
    await sendCommand(electronApp, {
      action: 'wave',
      expression: 'happy',
      performanceToken: 'm56-sequence',
      performanceId: 'test:m56-sequence',
      bodyPolicy: 'replace',
    })

    await expect
      .poll(() => page.evaluate(() => document.body.dataset.performanceState ?? ''))
      .toBe('performing')
    expect(await page.evaluate(() => document.body.dataset.lastPerformanceLifecycle)).toBe(
      'action_started',
    )
    expect(await page.evaluate(() => document.body.dataset.actionPlaybackMode)).toBe('action')

    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastPerformanceLifecycle ?? ''), {
        timeout: 8_000,
      })
      .toBe('recovery_completed')
    await expect(page.locator('body')).toHaveAttribute('data-performance-state', 'idle')
    const timing = await page.evaluate(() => ({
      prepared: Number(document.body.dataset.actionPreparedAt),
      started: Number(document.body.dataset.actionStartedAt),
      completed: Number(document.body.dataset.actionCompletedAt),
      recoveryStarted: Number(document.body.dataset.recoveryStartedAt),
      recoveryCompleted: Number(document.body.dataset.recoveryCompletedAt),
    }))
    expect(timing.prepared).toBeLessThan(timing.started)
    expect(timing.started).toBeLessThan(timing.completed)
    expect(timing.completed).toBeLessThan(timing.recoveryStarted)
    expect(timing.recoveryStarted).toBeLessThan(timing.recoveryCompleted)
  } finally {
    await electronApp.close()
  }
})

test('M5.6 suppresses a repeated idle full clip without waiting', async () => {
  const electronApp = await electron.launch(launchOptions())
  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')
    await sendCommand(electronApp, {
      action: 'happy',
      modelClip: 'Public01',
      performanceToken: 'm56-idle-1',
      bodyPolicy: 'replace',
      idlePerformance: true,
    })
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.actionStartedAt ?? ''))
      .not.toBe('')

    await sendCommand(electronApp, {
      action: 'happy',
      modelClip: 'Public01',
      performanceToken: 'm56-idle-2',
      bodyPolicy: 'replace',
      idlePerformance: true,
    })

    await expect
      .poll(() => page.evaluate(() => document.body.dataset.idleClipSuppressed ?? ''))
      .toBe('repeat')
    expect(await page.evaluate(() => document.body.dataset.actionPlaybackMode)).toBe(
      'micro-repeat-guard',
    )
  } finally {
    await electronApp.close()
  }
})

test('M5.6 click interruption stops the old line and recovers the body', async () => {
  const electronApp = await electron.launch(launchOptions())
  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastVoiceClip ?? ''), {
        timeout: 10_000,
      })
      .toBe('LogIn_1')
    const originalLine = '这是一段用于验证用户点击会立即中止的较长原始对白。'
    await sendCommand(electronApp, {
      action: 'wave',
      modelClip: 'Normal_Callsign',
      expression: 'happy',
      dialogue: originalLine,
      spokenText: originalLine,
      performanceToken: 'm56-interrupt-original',
      deliveryId: 'm56-delivery-original',
      bodyPolicy: 'replace',
      speakDialogue: true,
    })
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.voiceStatus ?? ''), {
        timeout: 12_000,
      })
      .toBe('playing')
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastVoiceClip ?? ''), {
        timeout: 12_000,
      })
      .toBe('local-tts')

    await page.locator('#pet-canvas').click({ position: { x: 170, y: 148 } })

    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastVoiceInterruptedReason ?? ''))
      .toBe('user')
    expect(
      await page.evaluate(() => document.body.dataset.lastUserPerformanceInterruptedReason),
    ).toBe('user')
    await expect(page.locator('#bubble')).not.toHaveText(originalLine)
    await expect
      .poll(() => page.evaluate(() => Number(document.body.dataset.recoveryCompletedAt ?? 0)), {
        timeout: 12_000,
      })
      .toBeGreaterThan(0)
    await expect(page.locator('body')).toHaveAttribute('data-performance-state', 'idle')
  } finally {
    await electronApp.close()
  }
})

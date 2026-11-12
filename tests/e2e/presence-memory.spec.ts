import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { openSettingsTab } from './settings-tabs'

test('M5.4 creates, lists, deletes and clears structured episodic memories', async () => {
  test.setTimeout(30_000)
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'deskpet-e2e-memory-'))
  const memoryPath = join(userDataDirectory, 'presence-memory.json')
  const now = Date.now()
  writeFileSync(
    memoryPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        recentReturnTimes: [],
        memories: [
          {
            id: 'memory:relationship:4',
            kind: 'relationship_milestone',
            dedupeKey: 'relationship:4',
            summary: '与老师的关系达到了好感等级 4',
            tags: ['affection'],
            importance: 0.9,
            createdAt: now - 86_400_000,
            updatedAt: now - 86_400_000,
            lastReferencedAt: null,
            expiresAt: null,
            sourceEventIds: ['fixture-relationship'],
            evidenceCount: 1,
          },
        ],
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
      DESKPET_PRESENCE_FOCUS_FIRST_MS: '1000',
      DESKPET_PRESENCE_FOCUS_LONG_MS: '1500',
      DESKPET_PRESENCE_RETURN_AFTER_MS: '60000',
      DESKPET_PRESENCE_RESTART_RETURN_AFTER_MS: '120000',
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
      .poll(
        async () => {
          const runtime = await page.evaluate(() => window.deskpet.getRuntimeInfo())
          return runtime.presenceMemoryCount
        },
        { timeout: 12_000 },
      )
      .toBeGreaterThanOrEqual(2)

    const settingsWindowPromise = electronApp.waitForEvent('window')
    await page.evaluate(() => window.deskpet.openSettings())
    const settingsPage = await settingsWindowPromise
    await settingsPage.waitForFunction(() => document.body.dataset.ready === 'true')
    await expect(settingsPage.locator('#memory-count')).toHaveText('2')
    await expect(settingsPage.locator('#memory-list')).toContainText('持续专注')
    await expect(settingsPage.locator('#memory-list')).toContainText('好感等级 4')

    await openSettingsTab(settingsPage, 'memory')
    await settingsPage.locator('.memory-delete').first().click()
    await expect(settingsPage.locator('#memory-count')).toHaveText('1')

    settingsPage.once('dialog', (dialog) => {
      void dialog.accept()
    })
    await settingsPage.locator('#clear-memory').click()
    await expect(settingsPage.locator('#memory-count')).toHaveText('0')
    await expect(settingsPage.locator('#memory-status')).toContainText('还没有形成情节记忆')
  } finally {
    await electronApp.close()
  }

  try {
    expect(statSync(memoryPath).mode & 0o777).toBe(0o600)
    const persisted = JSON.parse(readFileSync(memoryPath, 'utf8')) as {
      memories: unknown[]
    }
    expect(persisted.memories).toEqual([])
    expect(readFileSync(memoryPath, 'utf8')).not.toContain('Visual Studio Code')
  } finally {
    rmSync(userDataDirectory, { recursive: true, force: true })
  }
})

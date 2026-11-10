import { _electron as electron, expect, test } from '@playwright/test'

test('long Japanese AI replies start playing from the first synthesized phrase', async () => {
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...(process.env as Record<string, string>),
      DESKPET_E2E: '1',
      DESKPET_IRODORI_PREWARM: '0',
    },
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastVoiceClip ?? ''), {
        timeout: 10_000,
      })
      .toBe('LogIn_1')
    await page.waitForTimeout(250)
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.getTitle() === 'Deskpet')
        ?.webContents.send('pet:renderer-command', {
          action: 'idle',
          expression: 'neutral',
          dialogue: '老师，已经很晚了，先休息一下吧。',
          spokenText:
            '先生、もう夜の七時を過ぎたよ。週末くらい、少し休んで。ずっと画面の前にいないで。',
          ttsEmotion: 'calm',
          speakDialogue: true,
        })
    })

    await expect
      .poll(() => page.evaluate(() => document.body.dataset.ttsStreamChunks ?? ''))
      .toBe('3')
    await expect
      .poll(() => page.evaluate(() => Number(document.body.dataset.ttsFirstChunkMs ?? 0)), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0)
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastVoiceSource ?? ''), {
        timeout: 20_000,
      })
      .toBe('macos-say')
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.getTitle() === 'Deskpet')
        ?.webContents.send('pet:renderer-command', {
          action: 'idle',
          expression: 'neutral',
          bodyPolicy: 'overlay',
          microMotion: 'gaze_breath',
          performanceToken: 'm56-overlay-during-voice',
        })
    })
    await expect(page.locator('body')).toHaveAttribute('data-action-playback-mode', 'micro-overlay')
    await expect(page.locator('#pet-canvas')).toHaveAttribute('data-micro-motion', 'gaze_breath')
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.voiceQueueCompleted ?? 'false'), {
        timeout: 30_000,
      })
      .toBe('true')
    const voiceQueue = await page.evaluate(() => ({
      total: Number(document.body.dataset.voiceChunksTotal),
      started: Number(document.body.dataset.voiceChunksStarted),
      completed: Number(document.body.dataset.voiceChunksCompleted),
      outcome: document.body.dataset.voiceQueueOutcome,
      status: document.body.dataset.voiceStatus,
    }))
    expect(voiceQueue).toEqual({
      total: 3,
      started: 3,
      completed: 3,
      outcome: 'completed',
      status: 'ended',
    })
  } finally {
    await electronApp.close()
  }
})

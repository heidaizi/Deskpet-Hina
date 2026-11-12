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

test('M4 2D/3D runtime, behavior core, settings, and window interactions work', async ({}, testInfo) => {
  const rendererErrors: string[] = []
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
    page.on('console', (message) => {
      if (message.type() === 'error') {
        rendererErrors.push(message.text())
      }
    })
    await page.waitForFunction(() => document.body.dataset.ready === 'true')

    await expect(page).toHaveTitle('Deskpet')
    await expect(page.locator('#pet-canvas')).toBeVisible()
    await expect(page.locator('#milestone')).toHaveCount(0)
    await expect(page.locator('#hint')).toHaveCount(0)
    await expect(page.locator('body')).toHaveAttribute('data-runtime', 'M5-2d-placeholder')
    await expect
      .poll(async () => page.evaluate(() => document.body.dataset.lastVoiceClip ?? ''), {
        timeout: 10_000,
      })
      .toBe('LogIn_1')
    const prebuiltTtsResult = await page.evaluate(async () => {
      const result = await window.deskpet.synthesizeLocalSpeech('……在做什么？')
      return result?.source
    })
    expect(prebuiltTtsResult).toBe('prebuilt-tts')
    const ttsResult = await page.evaluate(async () => {
      const result = await window.deskpet.synthesizeLocalSpeech('老师，今天也辛苦了。')
      return result ? { header: [...result.audio.slice(0, 4)], source: result.source } : null
    })
    expect(ttsResult).toEqual({
      header: [82, 73, 70, 70],
      source: 'macos-say',
    })

    await expect
      .poll(async () => {
        const info = await page.evaluate(() => window.deskpet.getRuntimeInfo())
        return info.trayReady
      })
      .toBe(true)

    const runtimeInfo = await page.evaluate(() => window.deskpet.getRuntimeInfo())
    expect(runtimeInfo.trayReady).toBe(true)
    // 主套件必须运行用户实际使用的默认 Presence 模式。
    expect(runtimeInfo.presenceMode).toBe('active')
    expect(runtimeInfo.trayTitle).toBe('日奈')
    expect(runtimeInfo.clickThroughShortcutLabel).not.toBeNull()
    expect(runtimeInfo.trayMenuLabels).toEqual(
      expect.arrayContaining([
        '隐藏日奈',
        '暂停互动',
        '打开设置…',
        '形象渲染',
        '完全鼠标穿透（可用快捷键或 Dock 恢复）',
        '重置到主屏右下角',
        '退出 Deskpet',
      ]),
    )

    const nativeWindowState = await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      return {
        alwaysOnTop: window?.isAlwaysOnTop(),
        focusable: window?.isFocusable(),
        visible: window?.isVisible(),
        visibleOnAllWorkspaces: window?.isVisibleOnAllWorkspaces(),
      }
    })

    expect(nativeWindowState).toEqual({
      alwaysOnTop: true,
      focusable: false,
      visible: true,
      visibleOnAllWorkspaces: true,
    })

    await page.locator('#pet-canvas').click({
      position: { x: 170, y: 148 },
    })
    await expect(page.locator('#bubble')).toHaveAttribute('data-visible', 'true')
    await expect(page.locator('#bubble')).toContainText(
      /在做什么|一直戳|有事就说|这件泳装|倒也不是|没想到今年/,
    )
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastVoiceSource ?? ''))
      .toMatch(/^(official|prebuilt-tts)$/)
    await expect
      .poll(async () => {
        const snapshot = await page.evaluate(() => window.deskpet.getSettingsSnapshot())
        return snapshot.state.affectionXp
      })
      .toBeGreaterThan(0)

    const before = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.getBounds(),
    )

    await page.mouse.move(170, 300)
    await page.mouse.down()
    await page.mouse.move(110, 260, { steps: 8 })
    await page.mouse.up()

    const after = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.getBounds(),
    )

    expect(before).toBeTruthy()
    expect(after).toBeTruthy()
    expect({ x: after?.x, y: after?.y }).not.toEqual({ x: before?.x, y: before?.y })

    await page.screenshot({
      path: testInfo.outputPath('m4-pet-window-2d.png'),
      omitBackground: true,
    })

    const settingsWindowPromise = electronApp.waitForEvent('window')
    await page.evaluate(() => window.deskpet.openSettings())
    const settingsPage = await settingsWindowPromise
    await settingsPage.waitForFunction(() => document.body.dataset.ready === 'true')
    await expect(settingsPage.locator('h1')).toHaveText('空崎日奈设置')
    await expect
      .poll(async () =>
        settingsPage.evaluate(() => {
          const shell = document.querySelector<HTMLElement>('.settings-shell')
          return shell ? getComputedStyle(shell).paddingTop : ''
        }),
      )
      .not.toBe('0px')
    await expect(settingsPage.locator('#affection-level')).toContainText('Lv.')
    await expect(settingsPage.locator('.renderer-option')).toHaveCount(4)
    await expect(settingsPage.locator('.renderer-option[data-mode="2d"]')).toBeEnabled()
    await expect(settingsPage.locator('.renderer-option[data-mode="3d"]').first()).toBeEnabled()
    await expect(settingsPage.locator('.renderer-option[data-mode="2d"]')).toHaveClass(/selected/)
    await expect(settingsPage.locator('#random-voice-enabled')).toBeChecked()
    await expect(settingsPage.locator('#presence-autonomy-enabled')).toBeChecked()
    await expect(settingsPage.locator('#presence-intensity')).toHaveValue('balanced')
    await expect(settingsPage.locator('#local-tts-enabled')).toBeChecked()
    await expect(settingsPage.locator('#presence-emotion-enabled')).toBeChecked()
    await expect(settingsPage.locator('#emotion-dominant')).not.toHaveText('已关闭')
    await expect(settingsPage.locator('#presence-memory-enabled')).toBeChecked()
    await openSettingsTab(settingsPage, 'behavior')
    await settingsPage.locator('#presence-intensity').selectOption('quiet')
    await expect
      .poll(async () => {
        const snapshot = await settingsPage.evaluate(() => window.deskpet.getSettingsSnapshot())
        return snapshot.settings.presenceIntensity
      })
      .toBe('quiet')
    await settingsPage.locator('#presence-autonomy-enabled').uncheck()
    await expect(settingsPage.locator('#presence-intensity')).toBeDisabled()
    await expect
      .poll(async () => {
        const runtime = await settingsPage.evaluate(() => window.deskpet.getRuntimeInfo())
        return {
          autonomy: runtime.presenceAutonomyEnabled,
          intensity: runtime.presenceIntensity,
        }
      })
      .toEqual({ autonomy: false, intensity: 'quiet' })
    await expect(settingsPage.locator('#ai-enabled')).not.toBeChecked()
    await expect(settingsPage.locator('#ai-proactive-enabled')).not.toBeChecked()
    await expect(settingsPage.locator('#ai-proactive-enabled')).toBeDisabled()

    await openSettingsTab(settingsPage, 'appearance')
    await settingsPage.locator('.renderer-option[data-mode="3d"]').first().click()
    await expect
      .poll(async () => page.evaluate(() => document.body.dataset.rendererMode ?? ''), {
        timeout: 15_000,
      })
      .toBe('3d')
    await expect(page.locator('#pet-canvas')).toBeVisible()
    await expect(page.locator('body')).toHaveAttribute('data-renderer-id', '3d-glb')
    await expect(page.locator('#pet-canvas')).toHaveAttribute('data-model-format', 'gltf2')
    await expect(page.locator('#pet-canvas')).toHaveAttribute('data-model-animations', '23')
    await expect(page.locator('#pet-canvas')).toHaveAttribute('data-model-missing-clips', '0')
    await expect(page.locator('#pet-canvas')).toHaveAttribute('data-model-textures', '12')
    await expect(page.locator('#pet-canvas')).toHaveAttribute('data-render-style', 'toon-outline')
    await expect(page.locator('#pet-canvas')).toHaveAttribute(
      'data-procedural-motion',
      'breath,hair,gaze',
    )
    await expect(page.locator('#pet-canvas')).toHaveAttribute(
      'data-shadow-tracking',
      'animated-feet',
    )
    await expect(page.locator('#pet-canvas')).toHaveAttribute('data-shadow-scale-mode', 'parented')
    expect(
      Number(await page.locator('#pet-canvas').getAttribute('data-shadow-foot-span')),
    ).toBeGreaterThan(0)
    expect(
      Number(await page.locator('#pet-canvas').getAttribute('data-shadow-width')),
    ).toBeGreaterThan(0.4)
    await expect(page.locator('#pet-canvas')).toHaveAttribute('data-hair-bones', '27')
    await expect(page.locator('#pet-canvas')).toHaveAttribute('data-gaze-smoothing', 'damped')
    expect(await page.locator('#pet-canvas').getAttribute('data-blink-count')).toBeNull()
    await page.locator('#pet-canvas').hover({ position: { x: 315, y: 90 } })
    await expect
      .poll(async () => {
        return Number(await page.locator('#pet-canvas').getAttribute('data-gaze-target-x'))
      })
      .toBeGreaterThan(0.8)
    await expect
      .poll(async () => {
        return Number(await page.locator('#pet-canvas').getAttribute('data-gaze-current-x'))
      })
      .toBeGreaterThan(0.7)
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.getTitle() === 'Deskpet')
        ?.webContents.send('pet:gaze-point', { x: 15, y: 100 })
    })
    await expect
      .poll(async () => {
        return Number(await page.locator('#pet-canvas').getAttribute('data-gaze-target-x'))
      })
      .toBeLessThan(-0.8)
    const canvasBounds = await page.locator('#pet-canvas').boundingBox()
    expect(canvasBounds).toBeTruthy()
    await page.mouse.move((canvasBounds?.x ?? 0) + 170, (canvasBounds?.y ?? 0) + 300)
    await page.mouse.down()
    await page.mouse.move((canvasBounds?.x ?? 0) + 166, (canvasBounds?.y ?? 0) + 296, {
      steps: 1,
    })
    await expect(page.locator('#pet-canvas')).toHaveAttribute('data-last-action', 'drag_start')
    await expect(page.locator('#pet-canvas')).toHaveAttribute(
      'data-last-model-clip',
      'Formation_Pickup',
    )
    await expect(page.locator('#pet-canvas')).toHaveAttribute('data-procedural-weight', '0.42')
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastRule ?? ''))
      .toMatch(/^(drag|cooldown_fallback)$/)
    await expect(page.locator('#bubble')).toHaveAttribute('data-visible', 'true')
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.lastVoiceSource ?? ''))
      .toMatch(/^(official|prebuilt-tts)$/)
    const pickupDurationSeconds = Number(
      await page.locator('#pet-canvas').getAttribute('data-model-clip-duration'),
    )
    expect(pickupDurationSeconds).toBeGreaterThan(0)
    await expect(page.locator('body')).toHaveAttribute(
      'data-drag-loop-state',
      'looping-until-release',
    )
    await expect(page.locator('body')).toHaveAttribute('data-action-loop', 'true')
    await expect(page.locator('body')).toHaveAttribute('data-performance-state', 'performing')
    await page.waitForTimeout(Math.ceil(pickupDurationSeconds * 1_100) + 250)
    await expect(page.locator('#pet-canvas')).toHaveAttribute(
      'data-last-model-clip',
      'Formation_Pickup',
    )
    expect(
      Number(await page.locator('#pet-canvas').getAttribute('data-model-clip-cycles')),
    ).toBeGreaterThan(0)
    await expect(page.locator('body')).toHaveAttribute('data-performance-state', 'performing')
    await page.mouse.up()
    await expect(page.locator('body')).toHaveAttribute('data-drag-loop-state', 'released')
    const renderPrecision = await page.locator('#pet-canvas').evaluate((canvas) => ({
      pixelRatio: Number((canvas as HTMLCanvasElement).dataset.renderPixelRatio),
      supersample: Number((canvas as HTMLCanvasElement).dataset.renderSupersample),
      anisotropy: Number((canvas as HTMLCanvasElement).dataset.textureAnisotropy),
    }))
    expect(renderPrecision.pixelRatio).toBeGreaterThanOrEqual(1.5)
    expect(renderPrecision.supersample).toBe(1.5)
    expect(renderPrecision.anisotropy).toBeGreaterThanOrEqual(1)
    expect(
      rendererErrors.filter(
        (message) => message.includes('GLTFLoader') || message.includes('Content Security Policy'),
      ),
    ).toEqual([])
    await expect(settingsPage.locator('#model-action option')).toHaveCount(23)

    await settingsPage.locator('#model-scale').evaluate((element) => {
      const input = element as HTMLInputElement
      input.value = '0.3'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect
      .poll(async () => {
        const snapshot = await settingsPage.evaluate(() => window.deskpet.getSettingsSnapshot())
        return snapshot.settings.modelScale
      })
      .toBe(0.3)
    await expect(page.locator('#pet-canvas')).toHaveAttribute('data-model-scale', '0.30')
    await expect(page.locator('#bubble')).toHaveAttribute('data-model-scale', '0.30')
    await expect
      .poll(async () => {
        const bubbleLayout = await page.locator('#bubble').evaluate((element) => {
          const style = getComputedStyle(element)
          return {
            bottom: Number.parseFloat(style.bottom),
            maxWidth: Number.parseFloat(style.maxWidth),
            fontSize: Number.parseFloat(style.fontSize),
          }
        })
        return (
          bubbleLayout.bottom < 200 && bubbleLayout.maxWidth < 180 && bubbleLayout.fontSize < 12
        )
      })
      .toBe(true)
    await expect
      .poll(async () => {
        const envelope = await page.evaluate(() => ({
          width: Number(document.body.dataset.interactionWidth),
          height: Number(document.body.dataset.interactionHeight),
        }))
        const bounds = await electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.getTitle() === 'Deskpet')
            ?.getBounds(),
        )
        return Boolean(
          bounds && bounds.width === envelope.width && bounds.height === envelope.height,
        )
      })
      .toBe(true)
    const compactWindow = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.getTitle() === 'Deskpet')
        ?.getBounds(),
    )
    expect(compactWindow?.width).toBeLessThan(250)
    expect(compactWindow?.height).toBeLessThan(330)

    const longDialogue = '诶，总之先一起跳进海里吧？等、等一下老师！我、我还没做好心理准备……！'
    await electronApp.evaluate(({ BrowserWindow }, dialogue) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.getTitle() === 'Deskpet')
        ?.webContents.send('pet:renderer-command', {
          action: 'idle',
          dialogue,
          speakDialogue: false,
        })
    }, longDialogue)
    await expect(page.locator('#bubble')).toHaveText(longDialogue)
    const bubbleMetrics = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('#bubble')
      if (!element) {
        throw new Error('Bubble is missing.')
      }
      const bounds = element.getBoundingClientRect()
      const modelScale = Number((element as HTMLElement).dataset.modelScale)
      const modelOffsetY = Number(document.body.dataset.modelOffsetY)
      const cropY = Number(document.body.dataset.interactionCropY)
      const headTop = modelOffsetY + 400 + (140 - 67 - 400) * modelScale - cropY
      const modelTop = Number(element.dataset.modelTop) + modelOffsetY - cropY
      return {
        top: bounds.top,
        bottom: bounds.bottom,
        headTop,
        modelTop,
        width: bounds.width,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        readingDurationMs: Number(element.dataset.readingDurationMs),
      }
    })
    expect(bubbleMetrics.top).toBeGreaterThanOrEqual(0)
    expect(bubbleMetrics.bottom).toBeLessThanOrEqual(bubbleMetrics.viewportHeight)
    expect(bubbleMetrics.bottom + 7).toBeLessThanOrEqual(bubbleMetrics.headTop)
    // 气泡按摆放那一帧定位，modelTop 会随呼吸动画实时变化，允许 4px 的帧间抖动。
    expect(bubbleMetrics.bottom + 7).toBeLessThanOrEqual(bubbleMetrics.modelTop + 4)
    expect(bubbleMetrics.width).toBeLessThanOrEqual(bubbleMetrics.viewportWidth)
    expect(bubbleMetrics.scrollWidth).toBeLessThanOrEqual(bubbleMetrics.clientWidth + 1)
    expect(bubbleMetrics.readingDurationMs).toBeGreaterThan(5_000)
    await page.waitForTimeout(2_600)
    await expect(page.locator('#bubble')).toHaveAttribute('data-visible', 'true')

    await page.locator('#pet-canvas').click({ position: { x: 170, y: 322 } })
    await expect(page.locator('#bubble')).toHaveAttribute('data-visible', 'true')
    await page.screenshot({
      path: testInfo.outputPath('m4-pet-window-3d-small.png'),
      omitBackground: true,
    })

    await settingsPage.locator('#model-scale').evaluate((element) => {
      const input = element as HTMLInputElement
      input.value = '1'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect
      .poll(async () => {
        const snapshot = await settingsPage.evaluate(() => window.deskpet.getSettingsSnapshot())
        return snapshot.settings.modelScale
      })
      .toBe(1)
    await expect(page.locator('#pet-canvas')).toHaveAttribute('data-model-scale', '1.00')
    await expect(page.locator('#bubble')).toHaveAttribute('data-model-scale', '1.00')
    await expect
      .poll(async () => {
        const envelope = await page.evaluate(() => ({
          width: Number(document.body.dataset.interactionWidth),
          height: Number(document.body.dataset.interactionHeight),
        }))
        const bounds = await electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.getTitle() === 'Deskpet')
            ?.getBounds(),
        )
        return Boolean(
          bounds &&
          bounds.width === envelope.width &&
          bounds.height === envelope.height &&
          bounds.width > (compactWindow?.width ?? 0),
        )
      })
      .toBe(true)
    await settingsPage.screenshot({
      path: testInfo.outputPath('m4-settings-3d.png'),
      fullPage: true,
    })
    await page.locator('#pet-canvas').click({ position: { x: 170, y: 142 } })
    await expect
      .poll(async () => page.evaluate(() => document.body.dataset.lastZone ?? ''))
      .toBe('head')

    await page.screenshot({
      path: testInfo.outputPath('m4-pet-window-3d.png'),
      omitBackground: true,
    })
    await openSettingsTab(settingsPage, 'appearance')
    await settingsPage.locator('#model-action').selectOption('Formation_Pickup')
    await settingsPage.locator('#preview-model-action').click()
    await expect
      .poll(async () => page.evaluate(() => document.body.dataset.lastModelClip ?? ''))
      .toBe('Formation_Pickup')
    await expect(settingsPage.locator('#rule-count')).toContainText('条行为规则已加载')

    await settingsPage.locator('.renderer-option[data-mode="2d"]').click()
    await expect
      .poll(async () => page.evaluate(() => document.body.dataset.rendererMode ?? ''))
      .toBe('2d')
    await expect(page.locator('#pet-canvas')).toHaveCount(1)

    await openSettingsTab(settingsPage, 'behavior')
    await settingsPage.locator('#pause-interactions').check()
    await expect
      .poll(async () => {
        const snapshot = await settingsPage.evaluate(() => window.deskpet.getSettingsSnapshot())
        return snapshot.settings.interactionsPaused
      })
      .toBe(true)

    const pausedSnapshot = await page.evaluate(() => window.deskpet.getSettingsSnapshot())
    await page.locator('#pet-canvas').click({
      position: { x: 170, y: 148 },
    })
    await expect(page.locator('#bubble')).toContainText(/互动暂停中|休息也很重要/)
    await expect
      .poll(async () => {
        const snapshot = await page.evaluate(() => window.deskpet.getSettingsSnapshot())
        return snapshot.state.affectionXp
      })
      .toBe(pausedSnapshot.state.affectionXp)

    await settingsPage.locator('#always-on-top').uncheck()
    await expect
      .poll(async () => {
        return electronApp.evaluate(({ BrowserWindow }) => {
          return BrowserWindow.getAllWindows()
            .find((window) => window.getTitle() === 'Deskpet')
            ?.isAlwaysOnTop()
        })
      })
      .toBe(false)
    await expect(settingsPage.locator('#always-on-top')).not.toBeChecked()

    await openSettingsTab(settingsPage, 'ai')
    await expect(settingsPage.locator('#ai-panel')).toBeVisible()
    await expect(settingsPage.locator('#screen-perception-enabled')).not.toBeChecked()
    await expect(settingsPage.locator('#screen-perception-pause')).toBeDisabled()
    await expect(settingsPage.locator('#screen-perception-status')).toContainText('未开启')
    await expect(settingsPage.locator('.permission-item')).toHaveCount(3)
    await expect(settingsPage.locator('#permission-screen-state')).not.toHaveText('读取中')
    // 窗口标题、选中文字与屏幕感知属于敏感读取，开启时需要用户确认。
    settingsPage.on('dialog', (dialog) => {
      void dialog.accept()
    })
    await settingsPage.locator('#ai-enabled').check()
    await expect(settingsPage.locator('#ai-proactive-enabled')).toBeEnabled()
    await settingsPage.locator('#ai-window-title-enabled').check()
    await settingsPage.locator('#ai-selected-text-enabled').check()
    await expect
      .poll(async () =>
        settingsPage.evaluate(async () => {
          const snapshot = await window.deskpet.getSettingsSnapshot()
          return {
            enabled: snapshot.settings.aiEnabled,
            title: snapshot.settings.aiWindowTitleEnabled,
            selection: snapshot.settings.aiSelectedTextEnabled,
          }
        }),
      )
      .toEqual({ enabled: true, title: true, selection: true })

    await settingsPage.locator('#ai-analyze-selection').click()
    await expect(settingsPage.locator('#ai-preview')).toBeVisible()
    await expect(settingsPage.locator('#ai-preview-mode')).toContainText('手动粘贴')
    await expect(settingsPage.locator('#ai-selected-preview')).not.toHaveAttribute('readonly')
    await settingsPage.locator('#ai-selected-preview').fill('Obsidian 中手动粘贴的测试文字')
    await expect(settingsPage.locator('#send-ai-context')).toBeEnabled()
    await settingsPage.locator('#send-ai-context').click()
    await expect(settingsPage.locator('#ai-status')).toContainText('请先保存 DeepSeek API Key')

    await settingsPage.screenshot({
      path: testInfo.outputPath('m4-settings.png'),
      fullPage: true,
    })
  } finally {
    await electronApp.close()
  }
})

test('M4 state survives an application restart', async () => {
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'deskpet-e2e-persist-'))
  const launchOptions = {
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...(process.env as Record<string, string>),
      DESKPET_E2E: '1',
      DESKPET_E2E_USER_DATA: userDataDirectory,
    },
  }

  try {
    const firstApp = await electron.launch(launchOptions)
    const firstPage = await firstApp.firstWindow()
    await firstPage.waitForFunction(() => document.body.dataset.ready === 'true')
    await firstPage.locator('#pet-canvas').click({
      position: { x: 170, y: 148 },
    })
    await expect
      .poll(async () => {
        const snapshot = await firstPage.evaluate(() => window.deskpet.getSettingsSnapshot())
        return snapshot.state.affectionXp
      })
      .toBeGreaterThan(0)

    const firstAffection = await firstPage.evaluate(async () => {
      const snapshot = await window.deskpet.getSettingsSnapshot()
      return snapshot.state.affectionXp
    })

    const closed = firstApp.waitForEvent('close')
    await firstApp.evaluate(({ app }) => {
      app.quit()
    })
    await closed

    const secondApp = await electron.launch(launchOptions)
    try {
      const secondPage = await secondApp.firstWindow()
      await secondPage.waitForFunction(() => document.body.dataset.ready === 'true')
      const restored = await secondPage.evaluate(() => window.deskpet.getSettingsSnapshot())
      expect(restored.state.affectionXp).toBe(firstAffection)
    } finally {
      await secondApp.close()
    }
  } finally {
    rmSync(userDataDirectory, { recursive: true, force: true })
  }
})

test('M4 autonomous action reaches the active renderer', async () => {
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...(process.env as Record<string, string>),
      DESKPET_E2E: '1',
      // 该用例专门覆盖 legacy 自主行为调度器；active 模式下它由 Presence 接管。
      DESKPET_PRESENCE_MODE: 'legacy',
      DESKPET_AUTONOMY_INTERVAL_MS: '50',
      DESKPET_AUTONOMY_IDLE_MS: '50',
      DESKPET_AUTONOMY_MIN_DELAY_MS: '50',
      DESKPET_AUTONOMY_MAX_DELAY_MS: '100',
    },
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')
    await expect
      .poll(async () => page.evaluate(() => document.body.dataset.lastAutonomousAction ?? ''))
      .toMatch(/idle|look_at_cursor|walk|sleep|wave|stretch|happy|annoyed|embarrassed|surprised/)
  } finally {
    await electronApp.close()
  }
})

test('M4 falls back to 2D when the VRM asset is missing', async () => {
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...(process.env as Record<string, string>),
      DESKPET_E2E: '1',
      DESKPET_3D_ASSET_PATH: 'assets/characters/placeholder/missing.vrm',
    },
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForFunction(() => document.body.dataset.ready === 'true')
    const snapshot = await page.evaluate(() => window.deskpet.getSettingsSnapshot())
    const mode3d = snapshot.character.renderers.find((renderer) => renderer.mode === '3d')
    expect(mode3d?.assetPath).toBe('assets/characters/placeholder/missing.vrm')

    const settingsWindowPromise = electronApp.waitForEvent('window')
    await page.evaluate(() => window.deskpet.openSettings())
    const settingsPage = await settingsWindowPromise
    await settingsPage.waitForFunction(() => document.body.dataset.ready === 'true')
    await openSettingsTab(settingsPage, 'appearance')
    await settingsPage.locator('.renderer-option[data-mode="3d"]').first().click()

    await expect
      .poll(async () => page.evaluate(() => document.body.dataset.rendererMode ?? ''))
      .toBe('2d')
    await expect
      .poll(async () => {
        const restored = await page.evaluate(() => window.deskpet.getSettingsSnapshot())
        return restored.settings.rendererMode
      })
      .toBe('2d')
    await expect(page.locator('#bubble')).toContainText('3D 模型加载失败，已切回 2D')
  } finally {
    await electronApp.close()
  }
})

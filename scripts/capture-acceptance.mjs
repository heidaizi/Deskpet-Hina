#!/usr/bin/env node

// 生成当前版本的验收截图，写入 docs/acceptance/。
// 用途：让 docs/acceptance 中的证据始终能对应到实际版本，避免验收图停留在旧版本。
// 约束：使用独立的临时 userData，不读写用户的真实桌宠存档。

import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const outputDirectory = join(root, 'docs', 'acceptance')
const version = process.env.DESKPET_CAPTURE_VERSION ?? 'v1.0.2'

mkdirSync(outputDirectory, { recursive: true })
const userDataDirectory = mkdtempSync(join(tmpdir(), 'deskpet-capture-'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.DESKPET_E2E_USER_DATA

const app = await electron.launch({
  args: ['.'],
  cwd: root,
  env: {
    ...env,
    DESKPET_E2E: '1',
    DESKPET_E2E_USER_DATA: userDataDirectory,
  },
})

try {
  const petPage = await app.firstWindow()
  await petPage.waitForFunction(() => document.body.dataset.ready === 'true')
  await petPage.waitForTimeout(1200)

  const petShot = join(outputDirectory, `${version}-pet-window-2d.png`)
  await petPage.screenshot({ path: petShot, omitBackground: true })
  console.log(`[capture] 2D 桌宠窗口 -> ${petShot}`)

  await petPage.evaluate(async () => {
    await window.deskpet.updateSettings({ rendererMode: '3d' })
  })
  await petPage.waitForFunction(
    () => document.querySelector('#pet-canvas')?.getAttribute('data-model-animations') === '23',
    undefined,
    { timeout: 30_000 },
  )
  await petPage.waitForTimeout(1500)

  // 轻点身体触发一次对白，让截图包含气泡与表情。
  const bounds = await petPage.locator('#pet-canvas').boundingBox()
  if (bounds) {
    await petPage.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.55)
    await petPage
      .waitForFunction(
        () => document.querySelector('#bubble')?.getAttribute('data-visible') === 'true',
        undefined,
        { timeout: 8_000 },
      )
      .catch(() => undefined)
  }
  await petPage.waitForTimeout(600)

  const pet3dShot = join(outputDirectory, `${version}-pet-window-3d.png`)
  await petPage.screenshot({ path: pet3dShot, omitBackground: true })
  console.log(`[capture] 3D 桌宠窗口 -> ${pet3dShot}`)

  const settingsWindow = app.waitForEvent('window')
  await petPage.evaluate(async () => {
    await window.deskpet.openSettings()
  })
  const settingsPage = await settingsWindow
  await settingsPage.waitForFunction(() => document.body.dataset.ready === 'true')
  await settingsPage.waitForTimeout(1200)

  // 设置页已改为分页结构，按分页分别留存验收图。
  const settingsShot = join(outputDirectory, `${version}-settings.png`)
  await settingsPage.screenshot({ path: settingsShot })
  console.log(`[capture] 设置页 · 形象 -> ${settingsShot}`)

  await settingsPage.locator('.settings-tab[data-tab="relationship"]').click()
  await settingsPage.waitForTimeout(500)
  const settingsRelationshipShot = join(outputDirectory, `${version}-settings-relationship.png`)
  await settingsPage.screenshot({ path: settingsRelationshipShot })
  console.log(`[capture] 设置页 · 关系 -> ${settingsRelationshipShot}`)

  await settingsPage.locator('.settings-tab[data-tab="ai"]').click()
  await settingsPage.waitForTimeout(500)
  const settingsAiShot = join(outputDirectory, `${version}-settings-ai.png`)
  await settingsPage.screenshot({ path: settingsAiShot })
  console.log(`[capture] 设置页 · AI -> ${settingsAiShot}`)
} finally {
  await app.close()
  rmSync(userDataDirectory, { recursive: true, force: true })
}

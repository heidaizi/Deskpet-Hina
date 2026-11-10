import { app, globalShortcut, session } from 'electron'
import { join } from 'node:path'
import { registerAiContextShortcuts, scheduleAiTtsWarmup } from './ai/bridge'
import { state } from './app-state'
import { ensureAivisEngine, stopAivisEngine } from './domain/aivis-engine'
import { startAivisHealthMonitor } from './domain/aivis-health'
import { startScreenVisionLoop } from './perception/screen-vision'
import { cancelAutonomousWalk, startAutonomousBehavior } from './behavior/autonomous'
import { IS_E2E } from './config'
import { configureProxyFromSystem } from './net/proxy'
import { registerIpcHandlers } from './ipc/handlers'
import { initializePresenceController } from './presence/bridge'
import { initializePetController, showSettingsWindow } from './settings/bridge'
import { registerDisplayHandlers } from './system/displays'
import { recordError } from './system/error-log'
import { registerPowerHandlers } from './system/power'
import { startTimeSceneMonitor } from './time-scene/observer'
import { createTray, registerClickThroughShortcut, setClickThroughMode } from './tray/tray'
import { startMousePolling, stopMousePolling } from './window/mouse'
import { persistWindowState } from './window/persistence'
import { createPetWindow, showPetWindow } from './window/pet-window'

process.on('uncaughtException', (error) => {
  recordError('uncaughtException', error)
  console.error('Uncaught exception in main process:', error)
})

process.on('unhandledRejection', (reason) => {
  recordError('unhandledRejection', reason)
  console.error('Unhandled rejection in main process:', reason)
})

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.setName('Deskpet')
if (IS_E2E) {
  app.setPath(
    'userData',
    process.env.DESKPET_E2E_USER_DATA ?? join(app.getPath('temp'), `deskpet-e2e-${process.pid}`),
  )
}

let crashRestoreAttempts = 0

async function restorePetWindowAfterRendererCrash(): Promise<void> {
  if (crashRestoreAttempts >= 3) {
    console.error('Renderer crashed repeatedly; giving up automatic recovery.')
    return
  }
  crashRestoreAttempts += 1
  const delay = 600 * crashRestoreAttempts
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
  try {
    // 崩溃后的 webContents 既不能 reload 也拿不到 URL，直接重建窗口最可靠。
    const target = state.petWindow
    if (target && !target.isDestroyed()) {
      target.destroy()
    }
    await createPetWindow()
    // 稳定运行一段时间后再清零重试计数，避免崩溃循环。
    setTimeout(() => {
      crashRestoreAttempts = 0
    }, 30_000).unref()
  } catch (error) {
    recordError('renderer-recovery-failed', error)
  }
}

let stopAivisHealth: (() => void) | null = null

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('render-process-gone', (_event, contents, details) => {
    recordError(
      'render-process-gone',
      new Error(
        'renderer ' +
          details.reason +
          ' exitCode=' +
          details.exitCode +
          ' url=' +
          contents.getURL(),
      ),
    )
    void restorePetWindowAfterRendererCrash()
  })

  app.on('second-instance', () => {
    showPetWindow()
  })

  app.on('before-quit', () => {
    persistWindowState()
    state.petController?.flush()
    state.presenceController?.cancelProactiveAi('quit')
    state.presenceController?.flushSession()
    state.presenceController?.flushEmotion()
    state.presenceController?.flushMemory()
    state.timeSceneMonitor?.stop()
    if (state.pendingAiContext) {
      clearTimeout(state.pendingAiContext.timer)
      state.pendingAiContext = null
    }
    stopMousePolling()
    state.autonomousScheduler?.stop()
    cancelAutonomousWalk(false)
    globalShortcut.unregisterAll()
    if (state.clickThroughFallbackTimer) {
      clearTimeout(state.clickThroughFallbackTimer)
      state.clickThroughFallbackTimer = null
    }
    if (state.saveTimer) {
      clearTimeout(state.saveTimer)
      state.saveTimer = null
    }
  })

  app.on('activate', () => {
    if (state.clickThroughMode) {
      setClickThroughMode(false)
    }
    showPetWindow()
  })

  app.on('window-all-closed', () => {
    // The app remains available from the menu bar.
  })

  app.on('before-quit', () => {
    state.localTtsService?.stop()
    stopAivisEngine()
    stopAivisHealth?.()
    stopAivisHealth = null
  })

  void app
    .whenReady()
    .then(startApplication)
    .catch((error: unknown) => {
      console.error('Failed to start Deskpet:', error)
      app.quit()
    })
}

async function startApplication(): Promise<void> {
  configureProxyFromSystem()
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  initializePetController()
  registerIpcHandlers()
  state.windowStateFilePath = join(app.getPath('userData'), 'window-state.json')
  await createPetWindow()
  if (state.petController?.getSettings().ttsEngine === 'aivis') {
    void ensureAivisEngine(app.getPath('home'), (message) => console.warn(message))
  }
  stopAivisHealth = startAivisHealthMonitor({
    shouldRun: () =>
      state.petController?.getSettings().ttsEngine === 'aivis' &&
      state.petController.getSettings().localTtsEnabled &&
      !state.systemPowerState.suspended,
    revive: () => ensureAivisEngine(app.getPath('home'), (message) => console.warn(message)),
    log: (message) => console.warn(message),
  })
  if (!IS_E2E) {
    startScreenVisionLoop({
      getApiKey: async () => (await state.deepSeekKeyStore?.loadKey()) ?? null,
      isEnabled: () => {
        const settings = state.petController?.getSettings()
        return Boolean(settings?.aiEnabled) && process.env.DESKPET_PERCEPTION !== '0'
      },
    })
  }
  initializePresenceController()
  registerClickThroughShortcut()
  registerAiContextShortcuts()
  createTray()
  startMousePolling()
  registerDisplayHandlers()
  startAutonomousBehavior()
  registerPowerHandlers()
  startTimeSceneMonitor()
  scheduleAiTtsWarmup()

  if (process.env.DESKPET_OPEN_SETTINGS === '1') {
    setTimeout(() => {
      void showSettingsWindow()
    }, 750)
  }
}

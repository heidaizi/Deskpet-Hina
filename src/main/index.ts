import { app, globalShortcut, session } from 'electron'
import { join } from 'node:path'
import { registerAiContextShortcuts, scheduleAiTtsWarmup } from './ai/bridge'
import { state } from './app-state'
import { ensureAivisEngine, stopAivisEngine } from './domain/aivis-engine'
import { startAivisHealthMonitor } from './domain/aivis-health'
import { startScreenVisionLoop } from './perception/screen-vision'
import { startOutfitRotation } from './domain/outfit-rotation'
import { startWorldStateService, stopWorldStateService } from './domain/world-state-service'
import { RoutineService } from './domain/routine-service'
import { findOnThisDay } from './domain/memory/on-this-day'
import { getSchedule } from './perception/life-context'
import { sendRendererCommand } from './renderer/commands'
import {
  configureExpressionQueue,
  enqueueExpression,
  EXPRESSION_PRIORITY,
} from './expression/expression-queue'
import { cancelAutonomousWalk, startAutonomousBehavior } from './behavior/autonomous'
import { IS_E2E } from './config'
import { configureProxyFromSystem } from './net/proxy'
import { registerIpcHandlers } from './ipc/handlers'
import { initializePresenceController } from './presence/bridge'
import { initializePetController, showSettingsWindow, updateAppSettings } from './settings/bridge'
import { registerDisplayHandlers } from './system/displays'
import { recordError } from './system/error-log'
import { registerPowerHandlers } from './system/power'
import { schedulePermissionNotice } from './system/permission-notice'
import { startTimeSceneMonitor } from './time-scene/observer'
import {
  createTray,
  refreshTrayMenu,
  registerClickThroughShortcut,
  setClickThroughMode,
} from './tray/tray'
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

configureExpressionQueue(sendRendererCommand)
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
    state.routineService?.stop()
    stopWorldStateService()
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
      isConfigured: () => Boolean(state.petController?.getSettings().screenPerceptionEnabled),
      isPaused: () => Boolean(state.petController?.getSettings().screenPerceptionPaused),
      isEnabled: () => {
        const settings = state.petController?.getSettings()
        return Boolean(
          settings?.aiEnabled &&
          settings.screenPerceptionEnabled &&
          !state.systemPowerState.screenLocked &&
          !state.systemPowerState.suspended &&
          process.env.DESKPET_PERCEPTION !== '0',
        )
      },
      onStatusChange: () => refreshTrayMenu(),
    })
  }
  initializePresenceController()
  registerClickThroughShortcut()
  registerAiContextShortcuts()
  createTray()
  schedulePermissionNotice()
  startMousePolling()
  registerDisplayHandlers()
  startAutonomousBehavior()
  registerPowerHandlers()
  startTimeSceneMonitor()
  startWorldStateService()
  startOutfitRotation({
    getSettings: () => state.petController!.getSettings(),
    getRenderers: () => state.petController!.getSettingsSnapshot().character.renderers,
    apply: (rendererId) => {
      updateAppSettings({ rendererMode: '3d', rendererId })
    },
  })
  state.routineService = new RoutineService({
    contentDir: join(app.getAppPath(), 'content'),
    userDataDir: app.getPath('userData'),
    getSettings: () => {
      const settings = state.petController!.getSettings()
      return {
        waterReminderEnabled: settings.waterReminderEnabled,
        calendarReminderEnabled: settings.calendarReminderEnabled,
        sleepReminderEnabled: settings.sleepReminderEnabled,
        sleepTime: settings.sleepTime,
      }
    },
    getSchedule: () => getSchedule(),
    onEvent: (event) => {
      state.memoryEvents?.record({
        kind: 'routine',
        summary: event.summary,
        importance: event.importance,
      })
    },
    getOnThisDay: async () => {
      const memories = [
        ...(state.longTermMemory?.list() ?? []).map((entry) => ({
          text: entry.text,
          at: entry.createdAt,
        })),
        ...(state.presenceMemoryStore?.load().memories ?? []).map((memory) => ({
          text: memory.summary,
          at: memory.updatedAt,
        })),
        ...(state.memoryEvents?.list(500) ?? []).map((event) => ({
          text: event.summary,
          at: event.at,
        })),
      ]
      return findOnThisDay(memories)?.text ?? null
    },
    isAvailable: () =>
      !state.systemPowerState.suspended && !state.systemPowerState.screenLocked && state.petVisible,
    deliver: (line) => {
      enqueueExpression({
        source: 'routine',
        priority: EXPRESSION_PRIORITY.routine,
        ttlMs: 120_000,
        segments: [
          {
            command: {
              action: 'idle',
              expression: line.expression,
              dialogue: line.zh,
              spokenText: line.ja,
              ttsEmotion: line.emotion,
              speakDialogue: true,
            },
          },
        ],
      })
    },
  })
  state.routineService.start()
  scheduleAiTtsWarmup()

  if (process.env.DESKPET_OPEN_SETTINGS === '1') {
    setTimeout(() => {
      void showSettingsWindow()
    }, 750)
  }
}

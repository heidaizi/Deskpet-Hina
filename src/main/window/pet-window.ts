import { app, BrowserWindow, Menu, screen } from 'electron'
import { join } from 'node:path'
import { getDisplayDescriptors } from '../system/displays'
import { readWindowState } from '../window-state-store'
import { state } from '../app-state'
import { clampBoundsToWorkArea, defaultBounds, resolveWindowBounds } from '../window-state'
import { sendGazePoint, setWindowMousePolicy } from './mouse'
import { persistWindowState, scheduleWindowStateSave } from './persistence'
import { buildMenuTemplate, refreshTrayMenu } from '../tray/tray'
import { IS_E2E } from '../config'
import {
  InteractionEnvelope,
  PET_ANCHOR_X,
  PET_ANCHOR_Y,
  calculateInteractionEnvelope,
} from '../../shared/interaction-envelope'
export async function createPetWindow(): Promise<void> {
  const displays = getDisplayDescriptors()
  const primaryDisplayId = screen.getPrimaryDisplay().id
  const savedState = readWindowState(state.windowStateFilePath)
  const alwaysOnTop = state.petController?.getSettings().alwaysOnTop ?? true
  state.petWindowEnvelope = getCurrentPetWindowEnvelope()
  const bounds = resolveWindowBounds(savedState, displays, primaryDisplayId, {
    width: state.petWindowEnvelope.width,
    height: state.petWindowEnvelope.height,
  })

  state.currentDisplayId = bounds.displayId
  state.petVisible = true

  state.petWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: state.petWindowEnvelope.width,
    height: state.petWindowEnvelope.height,
    title: 'Deskpet',
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop,
    focusable: false,
    acceptFirstMouse: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  })

  const window = state.petWindow
  window.setAlwaysOnTop(alwaysOnTop, 'floating')
  window.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: false,
  })
  window.setHiddenInMissionControl(true)
  setWindowMousePolicy(true)

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })
  window.on('move', () => {
    state.currentDisplayId = screen.getDisplayMatching(window.getBounds()).id
    scheduleWindowStateSave()
  })

  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) {
      window.showInactive()
      state.petVisible = true
      refreshTrayMenu()
      setWindowMousePolicy(!IS_E2E)
    }
  })

  window.on('closed', () => {
    state.petWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

export function getCurrentPetWindowEnvelope(): InteractionEnvelope {
  const settings = state.petController?.getSettings()
  return calculateInteractionEnvelope(settings?.rendererMode ?? '2d', settings?.modelScale ?? 1)
}

export function applyPetWindowEnvelope(nextEnvelope: InteractionEnvelope): void {
  const previousEnvelope = state.petWindowEnvelope
  state.petWindowEnvelope = nextEnvelope
  if (
    !state.petWindow ||
    state.petWindow.isDestroyed() ||
    (previousEnvelope.cropX === nextEnvelope.cropX &&
      previousEnvelope.cropY === nextEnvelope.cropY &&
      previousEnvelope.width === nextEnvelope.width &&
      previousEnvelope.height === nextEnvelope.height &&
      previousEnvelope.modelOffsetY === nextEnvelope.modelOffsetY &&
      previousEnvelope.logicalHeight === nextEnvelope.logicalHeight)
  ) {
    return
  }

  const bounds = state.petWindow.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const footX = bounds.x + previousEnvelope.cropX + PET_ANCHOR_X
  const footY = bounds.y + previousEnvelope.cropY + previousEnvelope.modelOffsetY + PET_ANCHOR_Y
  const resolved = clampBoundsToWorkArea(
    {
      x: Math.round(footX - nextEnvelope.cropX - PET_ANCHOR_X),
      y: Math.round(footY - nextEnvelope.cropY - nextEnvelope.modelOffsetY - PET_ANCHOR_Y),
      width: nextEnvelope.width,
      height: nextEnvelope.height,
    },
    display.workArea,
  )
  state.petWindow.setBounds(resolved)
  state.currentDisplayId = display.id
  scheduleWindowStateSave()
}

export function showPetWindow(): void {
  if (!state.petWindow || state.petWindow.isDestroyed()) {
    return
  }

  if (!state.petWindow.isVisible()) {
    state.petWindow.showInactive()
    state.petVisible = true
    setWindowMousePolicy(!IS_E2E)
  }
  refreshTrayMenu()
}

export function resetPetPosition(): void {
  if (!state.petWindow || state.petWindow.isDestroyed()) {
    return
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const nextBounds = defaultBounds(primaryDisplay.workArea, {
    width: state.petWindowEnvelope.width,
    height: state.petWindowEnvelope.height,
  })
  state.petWindow.setBounds(nextBounds)
  state.currentDisplayId = primaryDisplay.id
  persistWindowState()
}

export function togglePetVisibility(): void {
  if (!state.petWindow || state.petWindow.isDestroyed()) {
    showPetWindow()
    return
  }

  if (state.petWindow.isVisible()) {
    state.presenceController?.cancelProactiveAi('hidden')
    state.petWindow.hide()
    state.petVisible = false
    setWindowMousePolicy(true)
    sendGazePoint(null)
  } else {
    state.petWindow.showInactive()
    state.petVisible = true
    setWindowMousePolicy(!IS_E2E)
  }
  refreshTrayMenu()
}

export function showContextMenu(): void {
  if (!state.petWindow || state.petWindow.isDestroyed()) {
    return
  }

  Menu.buildFromTemplate(buildMenuTemplate()).popup({ window: state.petWindow })
}

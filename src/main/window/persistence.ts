import { screen } from 'electron'
import type { SavedWindowState } from '../../shared/types'
import { state } from '../app-state'
import { writeWindowState } from '../window-state-store'

const SAVE_DEBOUNCE_MS = 350

export function scheduleWindowStateSave(): void {
  if (state.saveTimer) {
    clearTimeout(state.saveTimer)
  }
  state.saveTimer = setTimeout(() => {
    state.saveTimer = null
    persistWindowState()
  }, SAVE_DEBOUNCE_MS)
}

export function persistWindowState(): void {
  if (!state.petWindow || state.petWindow.isDestroyed() || !state.windowStateFilePath) {
    return
  }

  const bounds = state.petWindow.getBounds()
  const saved: SavedWindowState = {
    ...bounds,
    displayId: screen.getDisplayMatching(bounds).id,
  }
  try {
    writeWindowState(state.windowStateFilePath, saved)
  } catch (error) {
    console.error('Failed to write window state:', error)
  }
}

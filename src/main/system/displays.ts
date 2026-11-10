import { screen } from 'electron'
import { state } from '../app-state'
import { scheduleWindowStateSave } from '../window/persistence'
import { resolveWindowBounds } from '../window-state'

export function registerDisplayHandlers(): void {
  const ensureVisible = (): void => {
    if (!state.petWindow || state.petWindow.isDestroyed()) {
      return
    }

    const bounds = state.petWindow.getBounds()
    const resolved = resolveWindowBounds(
      { ...bounds, displayId: state.currentDisplayId },
      getDisplayDescriptors(),
      screen.getPrimaryDisplay().id,
      { width: state.petWindowEnvelope.width, height: state.petWindowEnvelope.height },
    )
    state.petWindow.setBounds(resolved)
    state.currentDisplayId = resolved.displayId
    scheduleWindowStateSave()
  }

  screen.on('display-added', ensureVisible)
  screen.on('display-removed', ensureVisible)
  screen.on('display-metrics-changed', ensureVisible)
}

export function getDisplayDescriptors(): Array<{ id: number; workArea: Electron.Rectangle }> {
  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    workArea: display.workArea,
  }))
}

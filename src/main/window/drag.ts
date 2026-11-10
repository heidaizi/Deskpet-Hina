import { screen } from 'electron'
import type { Point2D } from '../../shared/types'
import { state } from '../app-state'
import { notifyUserInteraction } from '../behavior/autonomous'
import { getDisplayDescriptors } from '../system/displays'
import { resolveWindowBounds } from '../window-state'
import { persistWindowState } from './persistence'
import { isValidPoint } from '../ipc/validators'
import { setWindowMousePolicy } from './mouse'

export function beginWindowDrag(point: Point2D): void {
  if (!state.petWindow || state.petWindow.isDestroyed() || !isValidPoint(point)) {
    return
  }

  notifyUserInteraction()
  state.dragStartPoint = point
  state.dragStartWindowPosition = {
    x: state.petWindow.getBounds().x,
    y: state.petWindow.getBounds().y,
  }
  state.interactionLocked = true
  setWindowMousePolicy(false)
}

export function moveWindowDrag(point: Point2D): void {
  if (
    !state.petWindow ||
    state.petWindow.isDestroyed() ||
    !state.dragStartPoint ||
    !state.dragStartWindowPosition ||
    !isValidPoint(point)
  ) {
    return
  }

  state.petWindow.setPosition(
    Math.round(state.dragStartWindowPosition.x + point.x - state.dragStartPoint.x),
    Math.round(state.dragStartWindowPosition.y + point.y - state.dragStartPoint.y),
  )
}

export function endWindowDrag(): void {
  state.dragStartPoint = null
  state.dragStartWindowPosition = null
  state.interactionLocked = false
  if (state.petWindow && !state.petWindow.isDestroyed()) {
    const resolved = resolveWindowBounds(
      {
        ...state.petWindow.getBounds(),
        displayId: state.currentDisplayId,
      },
      getDisplayDescriptors(),
      screen.getPrimaryDisplay().id,
      { width: state.petWindowEnvelope.width, height: state.petWindowEnvelope.height },
    )
    state.petWindow.setBounds({
      x: resolved.x,
      y: resolved.y,
      width: resolved.width,
      height: resolved.height,
    })
    state.currentDisplayId = resolved.displayId
    persistWindowState()
    setWindowMousePolicy(true)
  }
}

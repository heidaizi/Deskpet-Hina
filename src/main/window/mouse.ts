import { screen } from 'electron'
import type { Point2D } from '../../shared/types'
import { state } from '../app-state'
import { IS_E2E, MOUSE_POLL_MS } from '../config'
import { isPointInsideAnyHitArea } from '../window-state'
export function startMousePolling(): void {
  if (IS_E2E || state.mousePollTimer) {
    return
  }

  state.mousePollTimer = setInterval(() => {
    updateMousePolicyFromCursor()
  }, MOUSE_POLL_MS)
}

export function stopMousePolling(): void {
  if (!state.mousePollTimer) {
    return
  }
  clearInterval(state.mousePollTimer)
  state.mousePollTimer = null
}

export function updateMousePolicyFromCursor(): void {
  if (!state.petWindow || state.petWindow.isDestroyed() || !state.petVisible) {
    setWindowMousePolicy(true)
    sendGazePoint(null)
    return
  }

  const cursor = screen.getCursorScreenPoint()
  const bounds = state.petWindow.getBounds()
  const relativePoint = {
    x: cursor.x - bounds.x,
    y: cursor.y - bounds.y,
  }
  sendGazePoint({
    x: relativePoint.x + state.petWindowEnvelope.cropX,
    y: relativePoint.y + state.petWindowEnvelope.cropY,
  })
  if (state.clickThroughMode) {
    setWindowMousePolicy(true)
    return
  }
  const shouldIgnore =
    !state.interactionLocked && !isPointInsideAnyHitArea(relativePoint, state.hitAreas, 5)
  setWindowMousePolicy(shouldIgnore)
}

export function sendGazePoint(point: Point2D | null): void {
  if (
    !state.petWindow ||
    state.petWindow.isDestroyed() ||
    state.petWindow.webContents.isLoading()
  ) {
    return
  }
  if (
    point &&
    state.lastGazePoint &&
    Math.abs(point.x - state.lastGazePoint.x) < 0.25 &&
    Math.abs(point.y - state.lastGazePoint.y) < 0.25
  ) {
    return
  }
  if (!point && !state.lastGazePoint) {
    return
  }
  state.lastGazePoint = point
  state.petWindow.webContents.send('pet:gaze-point', point)
}

export function setWindowMousePolicy(ignore: boolean): void {
  if (!state.petWindow || state.petWindow.isDestroyed() || state.ignoreMouseEvents === ignore) {
    return
  }

  state.ignoreMouseEvents = ignore
  if (ignore) {
    state.petWindow.setIgnoreMouseEvents(true, { forward: true })
  } else {
    state.petWindow.setIgnoreMouseEvents(false)
  }
}

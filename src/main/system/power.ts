import { cancelAutonomousWalk } from '../behavior/autonomous'
import {
  sendGazePoint,
  startMousePolling,
  stopMousePolling,
  updateMousePolicyFromCursor,
} from '../window/mouse'
import { powerMonitor } from 'electron'
import { state } from '../app-state'

export function registerPowerHandlers(): void {
  state.systemPowerState = {
    suspended: false,
    screenLocked: false,
    onBatteryPower: powerMonitor.isOnBatteryPower(),
  }

  powerMonitor.on('suspend', () => {
    state.systemPowerState = { ...state.systemPowerState, suspended: true }
    applySystemActivityPolicy()
    syncLocalTtsPowerPolicy()
    sendSystemPowerState()
    void state.timeSceneMonitor?.refresh()
  })
  powerMonitor.on('resume', () => {
    state.systemPowerState = { ...state.systemPowerState, suspended: false }
    applySystemActivityPolicy()
    syncLocalTtsPowerPolicy()
    sendSystemPowerState()
    void state.timeSceneMonitor?.refresh()
  })
  powerMonitor.on('lock-screen', () => {
    state.systemPowerState = { ...state.systemPowerState, screenLocked: true }
    applySystemActivityPolicy()
    syncLocalTtsPowerPolicy()
    sendSystemPowerState()
    void state.timeSceneMonitor?.refresh()
  })
  powerMonitor.on('unlock-screen', () => {
    state.systemPowerState = { ...state.systemPowerState, screenLocked: false }
    applySystemActivityPolicy()
    syncLocalTtsPowerPolicy()
    sendSystemPowerState()
    void state.timeSceneMonitor?.refresh()
  })
  powerMonitor.on('shutdown', () => {
    state.localTtsService?.stop()
  })
  powerMonitor.on('on-ac', () => {
    state.systemPowerState = { ...state.systemPowerState, onBatteryPower: false }
    sendSystemPowerState()
    void state.timeSceneMonitor?.refresh()
  })
  powerMonitor.on('on-battery', () => {
    state.systemPowerState = { ...state.systemPowerState, onBatteryPower: true }
    sendSystemPowerState()
    void state.timeSceneMonitor?.refresh()
  })

  applySystemActivityPolicy()
  sendSystemPowerState()
}

export function syncLocalTtsPowerPolicy(): void {
  const enabled = state.petController?.getSettings().localTtsEnabled ?? false
  if (state.systemPowerState.suspended || state.systemPowerState.screenLocked) {
    state.localTtsService?.setEnabled(enabled)
    state.localTtsService?.suspend()
    return
  }
  state.localTtsService?.resume(enabled)
}

export function applySystemActivityPolicy(): void {
  const inactive = state.systemPowerState.suspended || state.systemPowerState.screenLocked
  if (inactive) {
    cancelAutonomousWalk(false)
    stopMousePolling()
    sendGazePoint(null)
    state.autonomousScheduler?.stop()
    return
  }

  startMousePolling()
  state.autonomousScheduler?.start()
  updateMousePolicyFromCursor()
}

export function sendSystemPowerState(): void {
  if (
    !state.petWindow ||
    state.petWindow.isDestroyed() ||
    state.petWindow.webContents.isLoading()
  ) {
    return
  }
  state.petWindow.webContents.send('app:system-power-state', state.systemPowerState)
}

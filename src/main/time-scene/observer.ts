import { powerMonitor } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
import { state } from '../app-state'
import { requestDecision } from '../behavior/decision-bus'
import { TimeSceneMonitor } from '../time-scene-monitor'
import { IS_E2E, presenceMode } from '../config'
import { isPetAvailableForAutonomousBehavior, readPositiveNumberEnv } from '../behavior/autonomous'
import { TimeSceneContext, getTimePeriodGreeting, isQuietScene } from '../../shared/time-scene'
import { sendRendererCommand } from '../renderer/commands'
export function startTimeSceneMonitor(): void {
  state.timeSceneTrackingStartedAt = Date.now()
  state.timeSceneMonitor = new TimeSceneMonitor({
    getForegroundApp: readForegroundAppName,
    getSystemIdleSeconds: () =>
      IS_E2E
        ? Math.max(0, Number(process.env.DESKPET_E2E_SYSTEM_IDLE_SECONDS ?? 0))
        : powerMonitor.getSystemIdleTime(),
    getPowerState: () => state.systemPowerState,
    intervalMs: readPositiveNumberEnv('DESKPET_TIME_SCENE_INTERVAL_MS') ?? 15_000,
    onChanged: (context) => {
      state.timeSceneContext = context
      if (context.scene !== 'system' && context.scene !== 'unknown') {
        state.lastExternalScene = context.scene
      }
      state.feedbackStore?.settleExpired()
      state.presenceController?.observeScene(context)
      if (presenceMode === 'active') {
        broadcastTimeSceneContext()
        return
      }
      const timeGreetingShown = announceTimePeriodChange(context)
      if (!timeGreetingShown) {
        announceSceneCompanion(context)
      }
      broadcastTimeSceneContext()
    },
  })
  state.timeSceneMonitor.start()
}

export function announceSceneCompanion(context: TimeSceneContext): void {
  if (presenceMode === 'active') {
    return
  }
  const now = Date.now()
  const interactionGraceMs = readPositiveNumberEnv('DESKPET_SCENE_INTERACTION_GRACE_MS') ?? 30_000
  if (
    now - state.lastInteractionAt < interactionGraceMs ||
    now - state.lastProactiveDialogueAt < 30_000
  ) {
    return
  }
  const snapshot = state.petController?.getSettingsSnapshot()
  const selection = state.sceneCompanion?.observe({
    scene: context.scene,
    timePeriod: context.timePeriod,
    energy: snapshot?.state.energy ?? 100,
    mood: snapshot?.state.mood ?? 60,
    affectionLevel: snapshot?.state.affectionLevel ?? 1,
    now,
    visible: isPetAvailableForAutonomousBehavior(),
    dragging: state.interactionLocked,
    clickThrough: state.clickThroughMode,
    screenLocked: context.screenLocked,
    suspended: context.suspended,
    systemIdleSeconds: context.systemIdleSeconds,
    randomVoiceEnabled: snapshot?.settings.randomVoiceEnabled ?? false,
  })
  if (!selection) {
    return
  }
  if (selection.restRecovery) {
    state.petController?.recoverFromRest(now)
  }
  sendRendererCommand({
    action: selection.action,
    modelClip: selection.modelClip,
    performanceId: selection.id,
    expression: selection.expression,
    dialogue: selection.dialogue,
    voice: selection.voice,
    speakDialogue: selection.speak,
    activityClass: 'ambient',
  })
  state.lastProactiveDialogueAt = now
}

export function announceTimePeriodChange(context: TimeSceneContext): boolean {
  if (presenceMode === 'active') {
    return false
  }
  if (context.suspended || context.screenLocked) {
    return false
  }
  if (state.observedTimePeriod === null) {
    state.observedTimePeriod = context.timePeriod
    return false
  }
  if (state.observedTimePeriod === context.timePeriod) {
    return false
  }

  state.observedTimePeriod = context.timePeriod
  if (
    Date.now() - state.timeSceneTrackingStartedAt < 60_000 ||
    !state.petVisible ||
    isQuietScene(context.scene)
  ) {
    return false
  }
  sendRendererCommand({
    action: 'wave',
    expression: 'neutral',
    dialogue: getTimePeriodGreeting(context.timePeriod, context.isWeekend),
    speakDialogue: false,
    activityClass: 'ambient',
  })
  state.lastProactiveDialogueAt = Date.now()
  return true
}

export async function readForegroundAppName(): Promise<string | null> {
  if (IS_E2E) {
    return process.env.DESKPET_E2E_FOREGROUND_APP ?? 'Google Chrome'
  }
  if (process.platform !== 'darwin') {
    return null
  }
  try {
    const front = await execFileAsync('/usr/bin/lsappinfo', ['front'], {
      timeout: 2_000,
      maxBuffer: 4_096,
    })
    const identifier = front.stdout.trim()
    if (!identifier.startsWith('ASN:')) {
      return null
    }
    const info = await execFileAsync('/usr/bin/lsappinfo', ['info', '-only', 'name', identifier], {
      timeout: 2_000,
      maxBuffer: 8_192,
    })
    return /^"([^"]+)"/m.exec(info.stdout)?.[1] ?? null
  } catch (error) {
    console.error('Unable to read the foreground application:', error)
    return null
  }
}

export function broadcastTimeSceneContext(): void {
  if (state.petWindow && !state.petWindow.isDestroyed()) {
    state.petWindow.webContents.send('app:time-scene-changed', state.timeSceneContext)
  }
  if (state.settingsWindow && !state.settingsWindow.isDestroyed()) {
    state.settingsWindow.webContents.send('app:time-scene-changed', state.timeSceneContext)
  }
}

import { screen } from 'electron'
import { state } from '../app-state'
import { requestDecision } from './decision-bus'
import { AutonomousBehaviorScheduler, type AutonomousAction } from '../autonomous-behavior'
import { IS_E2E, presenceMode } from '../config'
import { sendRendererCommand } from '../renderer/commands'
import type { PetInteraction } from '../../shared/types'
import { persistWindowState } from '../window/persistence'
import { chooseAutonomousWalkPlan } from '../window-state'

export function startAutonomousBehavior(): void {
  if (presenceMode === 'active') {
    return
  }
  const intervalMs = readPositiveNumberEnv('DESKPET_AUTONOMY_INTERVAL_MS')
  const idleThresholdMs = readPositiveNumberEnv('DESKPET_AUTONOMY_IDLE_MS')
  const minDelayMs = readPositiveNumberEnv('DESKPET_AUTONOMY_MIN_DELAY_MS')
  const maxDelayMs = readPositiveNumberEnv('DESKPET_AUTONOMY_MAX_DELAY_MS')
  state.autonomousScheduler = new AutonomousBehaviorScheduler({
    intervalMs: intervalMs ?? 2_000,
    idleThresholdMs: idleThresholdMs ?? (IS_E2E ? 60_000 : 15_000),
    minDelayMs: minDelayMs ?? (IS_E2E ? 30_000 : 12_000),
    maxDelayMs: maxDelayMs ?? (IS_E2E ? 60_000 : 28_000),
    getContext: () => {
      const snapshot = state.petController?.getSettingsSnapshot()
      return {
        now: Date.now(),
        lastInteractionAt: state.lastInteractionAt,
        energy: snapshot?.state.energy ?? 100,
        mood: snapshot?.state.mood ?? 60,
        visible: isPetAvailableForAutonomousBehavior(),
        dragging: state.interactionLocked,
        clickThrough: state.clickThroughMode,
        timePeriod: state.timeSceneContext.timePeriod,
        scene: state.timeSceneContext.scene,
        systemIdleSeconds: state.timeSceneContext.systemIdleSeconds,
      }
    },
    onAction: handleAutonomousAction,
  })
  state.autonomousScheduler.start()
}

export function readPositiveNumberEnv(name: string): number | undefined {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : undefined
}

export function handleAutonomousAction(action: AutonomousAction): void {
  const decision = requestDecision({ source: 'autonomous', reason: action })
  if (!decision.granted) {
    return
  }
  if (action === 'walk') {
    startAutonomousWalk()
    return
  }

  if (action === 'sleep') {
    state.petController?.recoverFromRest()
  }
  sendRendererCommand(
    action === 'sleep'
      ? { action: 'sleep', expression: 'sleepy', activityClass: 'ambient' }
      : action === 'wave'
        ? { action: 'wave', expression: 'neutral', activityClass: 'ambient' }
        : action === 'stretch'
          ? { action: 'stretch', expression: 'sleepy', activityClass: 'ambient' }
          : { action: 'look_at_cursor', expression: 'neutral', activityClass: 'ambient' },
  )
}

export function startAutonomousWalk(): void {
  if (
    !state.petWindow ||
    state.petWindow.isDestroyed() ||
    state.interactionLocked ||
    state.clickThroughMode
  ) {
    return
  }

  cancelAutonomousWalk(false)

  const window = state.petWindow
  const startBounds = window.getBounds()
  const workArea = screen.getDisplayMatching(startBounds).workArea
  const minX = workArea.x + 20
  const maxX = workArea.x + workArea.width - state.petWindowEnvelope.width - 20
  if (maxX <= minX) {
    return
  }

  const plan = chooseAutonomousWalkPlan(
    startBounds.x,
    minX,
    maxX,
    Math.random,
    state.lastAutonomousWalkDirection,
  )
  if (!plan) {
    return
  }
  const { direction, targetX, durationMs } = plan
  state.lastAutonomousWalkDirection = direction

  const generation = ++state.autonomousWalkGeneration
  const startedAt = Date.now()
  sendRendererCommand({
    action: 'walk',
    expression: 'neutral',
    facing: direction === -1 ? 'left' : 'right',
    activityClass: 'ambient',
  })

  state.autonomousWalkTimer = setInterval(() => {
    if (
      generation !== state.autonomousWalkGeneration ||
      !state.petWindow ||
      state.petWindow.isDestroyed()
    ) {
      return
    }
    if (state.interactionLocked || state.clickThroughMode || !state.petVisible) {
      cancelAutonomousWalk(true)
      return
    }

    const progress = Math.min(1, (Date.now() - startedAt) / durationMs)
    const eased = progress * progress * (3 - 2 * progress)
    state.petWindow.setPosition(
      Math.round(startBounds.x + (targetX - startBounds.x) * eased),
      startBounds.y,
    )

    if (progress >= 1) {
      cancelAutonomousWalk(false)
      sendRendererCommand({
        action: 'idle',
        expression: 'neutral',
        facing: direction === -1 ? 'left' : 'right',
        activityClass: 'ambient',
      })
      persistWindowState()
    }
  }, 16)
}

export function cancelAutonomousWalk(playIdle: boolean): void {
  state.autonomousWalkGeneration += 1
  if (state.autonomousWalkTimer) {
    clearInterval(state.autonomousWalkTimer)
    state.autonomousWalkTimer = null
  }
  if (playIdle) {
    sendRendererCommand({
      action: 'idle',
      expression: 'neutral',
      activityClass: 'ambient',
    })
  }
}

export function notifyUserInteraction(
  restoreIdleAnimation = true,
  interaction?: PetInteraction,
): void {
  state.lastInteractionAt = Date.now()
  // 用户直接操作立即抢占环境行为（自主动作、场景陪伴、Presence 演出）。
  requestDecision({ source: 'interaction', reason: interaction?.kind ?? 'user' })
  state.feedbackStore?.noteInteraction()
  state.presenceController?.notifyInteraction(interaction)
  cancelAutonomousWalk(restoreIdleAnimation)
  state.autonomousScheduler?.notifyInteraction(state.lastInteractionAt)
}

export function isPetAvailableForAutonomousBehavior(): boolean {
  return Boolean(
    state.petVisible &&
    state.petWindow &&
    !state.petWindow.isDestroyed() &&
    (IS_E2E || state.petWindow.isVisible()),
  )
}

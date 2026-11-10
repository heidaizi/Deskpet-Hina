import { isQuietScene, isRestfulTime, type SceneKind, type TimePeriod } from '../shared/time-scene'

export type AutonomousAction = 'look_at_cursor' | 'walk' | 'sleep' | 'wave' | 'stretch'

export interface AutonomousContext {
  now: number
  lastInteractionAt: number
  energy: number
  mood: number
  visible: boolean
  dragging: boolean
  clickThrough: boolean
  timePeriod: TimePeriod
  scene: SceneKind
  systemIdleSeconds: number
}

interface AutonomousOptions {
  getContext: () => AutonomousContext
  onAction: (action: AutonomousAction) => void
  random?: () => number
  intervalMs?: number
  idleThresholdMs?: number
  minDelayMs?: number
  maxDelayMs?: number
}

export function chooseAutonomousAction(
  context: AutonomousContext,
  random: () => number = Math.random,
): AutonomousAction | null {
  const idleMs = Math.max(0, context.now - context.lastInteractionAt)
  if (!context.visible || context.dragging || context.clickThrough) {
    return null
  }

  if (context.energy <= 12) {
    return 'sleep'
  }
  if (idleMs >= 120_000 && context.energy < 45 && random() < 0.7) {
    return 'sleep'
  }
  if (
    isRestfulTime(context.timePeriod) &&
    idleMs >= 60_000 &&
    context.energy < 70 &&
    random() < 0.55
  ) {
    return 'sleep'
  }
  if (context.systemIdleSeconds >= 300 && context.energy < 55 && random() < 0.45) {
    return 'sleep'
  }
  if (idleMs >= 180_000 && random() < 0.45) {
    return 'sleep'
  }
  const quietScene = isQuietScene(context.scene)
  const roll = random()
  if (context.mood < 25) {
    return roll < 0.6 ? 'look_at_cursor' : 'stretch'
  }
  if (quietScene) {
    return roll < 0.2 && idleMs >= 90_000 ? 'stretch' : 'look_at_cursor'
  }
  if (roll < 0.28) {
    return 'walk'
  }
  if (roll < 0.5) {
    return 'stretch'
  }
  if (roll < 0.72) {
    return 'wave'
  }
  return 'look_at_cursor'
}

export class AutonomousBehaviorScheduler {
  private timer: NodeJS.Timeout | null = null
  private nextDecisionAt = 0
  private readonly random: () => number
  private readonly intervalMs: number
  private readonly idleThresholdMs: number
  private readonly minDelayMs: number
  private readonly maxDelayMs: number

  constructor(private readonly options: AutonomousOptions) {
    this.random = options.random ?? Math.random
    this.intervalMs = options.intervalMs ?? 2_000
    this.idleThresholdMs = options.idleThresholdMs ?? 15_000
    this.minDelayMs = options.minDelayMs ?? 12_000
    this.maxDelayMs = options.maxDelayMs ?? 28_000
  }

  start(): void {
    if (this.timer) {
      return
    }
    this.scheduleNext(Date.now())
    this.timer = setInterval(() => {
      this.tick(Date.now())
    }, this.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  notifyInteraction(now = Date.now()): void {
    this.scheduleNext(now)
  }

  tick(now = Date.now()): AutonomousAction | null {
    const context = this.options.getContext()
    const idleMs = Math.max(0, context.now - context.lastInteractionAt)
    if (
      now < this.nextDecisionAt ||
      idleMs < this.idleThresholdMs ||
      !context.visible ||
      context.dragging ||
      context.clickThrough
    ) {
      return null
    }

    this.scheduleNext(now)
    const action = chooseAutonomousAction(context, this.random)
    if (action) {
      this.options.onAction(action)
    }
    return action
  }

  private scheduleNext(now: number): void {
    const range = Math.max(0, this.maxDelayMs - this.minDelayMs)
    this.nextDecisionAt = now + this.minDelayMs + this.random() * range
  }
}

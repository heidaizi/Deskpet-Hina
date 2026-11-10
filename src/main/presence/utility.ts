/**
 * 阶段二的效用函数。
 *
 * 只做纯计算：输入候选与场景指标，输出「这次开口值不值」的分数与阈值。
 * 是否真的采用，由仲裁层与设置开关决定，便于先观察再启用。
 */

export interface UtilityInput {
  /** 候选自带的静态优先级，0..100。 */
  priority: number
  /** 规则标签与当前场景的匹配度，0..1。 */
  sceneFit: number
  /** 记忆检索命中度，0..1。 */
  memoryHit: number
  /** 好感等级 1..8。 */
  affectionLevel: number
  /** 专注压力，0..1，越高越不该打扰。 */
  focusPressure: number
  /** 最近负反馈的指数滑动平均，0..1。 */
  recentDisturbance: number
  /** 深夜惩罚，0..1。 */
  lateNightPenalty: number
  /** 同规则重复压力，0..1。 */
  repeatPressure: number
  /** 冷却压力，0..1。 */
  cooldownPressure: number
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0

export function scoreCandidate(input: UtilityInput): number {
  const value =
    0.3 * clamp01(input.priority / 100) +
    0.25 * clamp01(input.sceneFit) +
    0.25 * clamp01(input.memoryHit) +
    0.2 * clamp01((input.affectionLevel - 1) / 7)
  const cost =
    0.45 * clamp01(input.focusPressure) +
    0.3 * clamp01(input.recentDisturbance) +
    0.25 * clamp01(input.lateNightPenalty)
  const inertia = 0.6 * clamp01(input.repeatPressure) + 0.4 * clamp01(input.cooldownPressure)
  return value - cost - inertia
}

export function computeThreshold(focusPressure: number, recentDisturbance: number): number {
  return 0.42 + 0.25 * clamp01(focusPressure) + 0.15 * clamp01(recentDisturbance)
}

/** 23:00–06:00 为 1，其余时段按距离线性衰减。 */
export function computeLateNightPenalty(date: Date): number {
  const hour = date.getHours() + date.getMinutes() / 60
  if (hour >= 23 || hour < 6) {
    return 1
  }
  if (hour >= 21) {
    return (hour - 21) / 2
  }
  if (hour < 9) {
    return (9 - hour) / 3
  }
  return 0
}

export interface FocusPressureInput {
  focusMinutes: number
  interactionDensity: number
  scene: string
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / Math.max(1e-6, edge1 - edge0))
  return t * t * (3 - 2 * t)
}

export function computeFocusPressure(input: FocusPressureInput): number {
  const focus = smoothstep(10, 45, input.focusMinutes)
  const density = smoothstep(2, 8, input.interactionDensity)
  const sceneWeight = input.scene === 'development' || input.scene === 'focus' ? 1 : 0
  return clamp01(0.5 * focus + 0.3 * density + 0.2 * sceneWeight)
}

export interface FeedbackSample {
  at: number
  kind: 'engaged' | 'ignored' | 'interrupted'
}

const FEEDBACK_WEIGHTS: Record<FeedbackSample['kind'], number> = {
  engaged: -0.5,
  interrupted: 0.8,
  ignored: 0.3,
}

const HALF_LIFE_MS = 30 * 60_000

/** 指数滑动平均：越近的事件权重越高，engaged 会降低打扰成本。 */
export function computeRecentDisturbance(samples: FeedbackSample[], now: number): number {
  let weighted = 0
  let totalWeight = 0
  for (const sample of samples) {
    const age = Math.max(0, now - sample.at)
    const weight = Math.pow(0.5, age / HALF_LIFE_MS)
    weighted += FEEDBACK_WEIGHTS[sample.kind] * weight
    totalWeight += weight
  }
  if (totalWeight === 0) {
    return 0
  }
  return clamp01(weighted / totalWeight)
}

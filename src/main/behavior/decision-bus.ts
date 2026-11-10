/**
 * 行为仲裁总线。
 *
 * 拆分前，“日奈现在能做什么”分散在自动行为调度器、场景陪伴、Presence 投递与
 * 交互处理四处，各自用零散条件判断冲突。这里把它们收敛成一个显式的抢占规则：
 *
 * - 用户交互（点击、拖拽）永远优先，并立即清空环境行为的租约；
 * - 环境行为（自主动作、场景陪伴、Presence 演出）之间按优先级抢占，
 *   低优先级不得在更高优先级的租约内开始；
 * - 同优先级需要等上一个租约到期，避免连续叠加。
 *
 * 这里只做准入与记账，不负责生成候选，因此不改变任何现有行为的内容。
 */

export type DecisionSource = 'interaction' | 'autonomous' | 'scene' | 'presence'

export const DECISION_PRIORITY: Record<DecisionSource, number> = {
  interaction: 100,
  presence: 30,
  scene: 20,
  autonomous: 10,
}

export interface DecisionRequest {
  source: DecisionSource
  /** 环境行为需要占用多久；交互类忽略该值。 */
  leaseMs?: number
  reason?: string
  now?: number
}

export interface DecisionLease {
  source: DecisionSource
  priority: number
  startedAt: number
  expiresAt: number
  reason: string
}

export interface DecisionResult {
  granted: boolean
  lease: DecisionLease | null
  /** 被拒绝时给出可解释的原因，便于日志与诊断。 */
  blockedBy: DecisionLease | null
  reason: string
}

let activeLease: DecisionLease | null = null
let observedCount = 0

export const DEFAULT_AMBIENT_LEASE_MS = 6_000

function expireIfNeeded(now: number): void {
  if (activeLease && now >= activeLease.expiresAt) {
    activeLease = null
  }
}

export function getActiveLease(now = Date.now()): DecisionLease | null {
  expireIfNeeded(now)
  return activeLease
}

export function requestDecision(request: DecisionRequest): DecisionResult {
  const now = request.now ?? Date.now()
  expireIfNeeded(now)
  const priority = DECISION_PRIORITY[request.source]
  const reason = request.reason ?? request.source

  if (request.source === 'interaction') {
    // 用户直接操作永远立即生效，并让环境行为让路。
    const lease: DecisionLease = {
      source: 'interaction',
      priority,
      startedAt: now,
      expiresAt: now + (request.leaseMs ?? 1_000),
      reason,
    }
    activeLease = lease
    return { granted: true, lease, blockedBy: null, reason }
  }

  // 同一来源的连续动作视为续租，不应被自己挡住。
  if (activeLease && activeLease.source === request.source) {
    const renewed: DecisionLease = {
      source: request.source,
      priority,
      startedAt: now,
      expiresAt: now + (request.leaseMs ?? DEFAULT_AMBIENT_LEASE_MS),
      reason,
    }
    activeLease = renewed
    return { granted: true, lease: renewed, blockedBy: null, reason }
  }

  // Presence 是对用户交互的即时反馈，交互只阻止非响应的环境行为。
  const presenceAnsweringInteraction =
    request.source === 'presence' && activeLease?.source === 'interaction'

  if (activeLease && !presenceAnsweringInteraction) {
    // 更高优先级的环境行为可以抢占；同优先级或更低必须等待。
    if (activeLease.priority >= priority) {
      const blockedReason = `被 ${activeLease.source} 占用中`
      if (process.env.DESKPET_DECISION_LOG === '1') {
        console.info(`[decision] ${request.source} 被拒绝：${blockedReason}（原因 ${reason}）`)
      }
      return {
        granted: false,
        lease: null,
        blockedBy: activeLease,
        reason: blockedReason,
      }
    }
  }

  const lease: DecisionLease = {
    source: request.source,
    priority,
    startedAt: now,
    expiresAt: now + (request.leaseMs ?? DEFAULT_AMBIENT_LEASE_MS),
    reason,
  }
  activeLease = lease
  return { granted: true, lease, blockedBy: null, reason }
}

/**
 * 只记账、不做准入。
 *
 * Presence 有自己的仲裁与打断生命周期，不能在这里加闸；
 * 但它的演出必须让总线知道“宠物现在正忙”，否则其他环境行为无法判断冲突。
 */
export function observeDecision(request: DecisionRequest): DecisionLease {
  const now = request.now ?? Date.now()
  const lease: DecisionLease = {
    source: request.source,
    priority: DECISION_PRIORITY[request.source],
    startedAt: now,
    expiresAt: now + (request.leaseMs ?? DEFAULT_AMBIENT_LEASE_MS),
    reason: request.reason ?? request.source,
  }
  activeLease = lease
  observedCount += 1
  return lease
}

export function getDecisionObservationCount(): number {
  return observedCount
}

/** 主动释放（例如演出被用户打断）。 */
export function releaseDecision(source: DecisionSource): void {
  if (activeLease?.source === source) {
    activeLease = null
  }
}

/** 仅供测试使用。 */
export function resetDecisionBus(): void {
  activeLease = null
  observedCount = 0
}

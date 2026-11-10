import type { PresenceCandidate, PresenceContextV1, PresenceDecision } from '../../shared/presence'
import { getEmotionScoreAdjustment } from './emotion-engine'

export interface PresenceArbitrationState {
  lastRuleUse: Record<string, number>
  lastSpeechAt: number
  speechEvents: Array<{ at: number; priority: number }>
}

export interface PresenceArbitrationOptions {
  minimumInteractionGraceMs?: number
  minimumSpeechGapMs?: number
  maximumSpeechPerHour?: number
  random?: () => number
  eventEpoch?: number
  /**
   * 阶段二：效用打分。返回 null 表示不做门控（保持原有优先级排序）。
   * 启用后只有超过阈值的候选才参与竞争，并按效用排序。
   */
  utility?: (
    candidate: PresenceCandidate,
    context: PresenceContextV1,
  ) => { score: number; threshold: number } | null
}

export function arbitratePresence(
  candidates: readonly PresenceCandidate[],
  context: PresenceContextV1,
  state: PresenceArbitrationState,
  options: PresenceArbitrationOptions = {},
): PresenceDecision {
  const silentReason = getHardSilenceReason(context, options.minimumInteractionGraceMs)
  if (silentReason) {
    return silentDecision(context.now, silentReason, options.eventEpoch)
  }

  const random = options.random ?? Math.random
  const minimumSpeechGapMs = options.minimumSpeechGapMs ?? 45_000
  const maximumSpeechPerHour = options.maximumSpeechPerHour ?? 6
  const scored = candidates.flatMap((candidate) => {
    if (!isCandidateAllowed(candidate, context, state, minimumSpeechGapMs, maximumSpeechPerHour)) {
      return []
    }
    const utility = options.utility?.(candidate, context) ?? null
    if (utility && utility.score < utility.threshold) {
      return []
    }
    const noveltyBonus = getNoveltyBonus(candidate, context.now, state)
    const emotionAdjustment = getEmotionScoreAdjustment(
      candidate,
      context.emotion,
      context.relationship,
    )
    return [
      {
        candidate,
        score:
          candidate.priority +
          noveltyBonus +
          emotionAdjustment +
          Math.max(0, Math.min(1, random())) +
          (utility ? utility.score * 100 : 0),
      },
    ]
  })

  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }
    return left.candidate.ruleId.localeCompare(right.candidate.ruleId)
  })

  const selected = scored[0]
  if (!selected) {
    return silentDecision(context.now, '没有通过冷却、预算或运行时过滤的候选', options.eventEpoch)
  }

  return {
    kind: 'perform',
    candidate: selected.candidate,
    eventEpoch: options.eventEpoch ?? 0,
    selectedAt: context.now,
    score: selected.score,
  }
}

function getHardSilenceReason(
  context: PresenceContextV1,
  minimumInteractionGraceMs = 30_000,
): string | null {
  if (!context.runtime.autonomyEnabled) {
    return '主动行为已关闭'
  }
  if (context.runtime.interactionsPaused) {
    return '互动已暂停'
  }
  if (!context.runtime.visible) {
    return '桌宠不可见'
  }
  if (context.runtime.dragging) {
    return '正在拖拽'
  }
  if (context.runtime.clickThrough) {
    return '处于完全鼠标穿透模式'
  }
  if (context.scene.screenLocked || context.scene.suspended) {
    return '屏幕已锁定或系统正在睡眠'
  }
  if (context.scene.systemIdleSeconds > 120) {
    return '用户已离开当前场景'
  }
  if (context.now - context.runtime.lastInteractionAt < minimumInteractionGraceMs) {
    return '用户刚发生直接互动'
  }
  return null
}

function isCandidateAllowed(
  candidate: PresenceCandidate,
  context: PresenceContextV1,
  state: PresenceArbitrationState,
  minimumSpeechGapMs: number,
  maximumSpeechPerHour: number,
): boolean {
  const lastUse = state.lastRuleUse[candidate.cooldownKey]
  if (lastUse !== undefined && context.now - lastUse < candidate.cooldownMs) {
    return false
  }
  if (candidate.speech !== 'none' && !context.runtime.randomVoiceEnabled) {
    return false
  }
  if (candidate.speech !== 'none' && context.now - state.lastSpeechAt < minimumSpeechGapMs) {
    return false
  }
  if (candidate.speech !== 'none') {
    const recentSpeech = state.speechEvents.filter((event) => context.now - event.at < 3_600_000)
    const priorityReserve = candidate.priority >= 40 ? 2 : 0
    if (recentSpeech.length >= maximumSpeechPerHour + priorityReserve) {
      return false
    }
  }
  const performanceBusy =
    context.runtime.speechState !== 'idle' || context.runtime.performanceState !== 'idle'
  if (performanceBusy && (!candidate.canRunWhileSpeaking || candidate.bodyPolicy !== 'overlay')) {
    return false
  }
  return true
}

function getNoveltyBonus(
  candidate: PresenceCandidate,
  now: number,
  state: PresenceArbitrationState,
): number {
  const lastUse = state.lastRuleUse[candidate.cooldownKey]
  if (lastUse === undefined) {
    return 2
  }
  const hours = Math.max(0, (now - lastUse) / 3_600_000)
  return Math.min(2, hours)
}

function silentDecision(now: number, reason: string, eventEpoch = 0): PresenceDecision {
  return {
    kind: 'silent',
    reason,
    selectedAt: now,
    eventEpoch,
  }
}

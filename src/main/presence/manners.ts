import type { FeedbackEvent } from '../domain/memory/feedback-store'

/**
 * 「分寸感」规则：决定现在该不该主动开口。
 *
 * 与效用函数不同，这里只关心社交时机：
 * 刚被打扰过、连续被忽略、你正专注、深夜——都应当更安静。
 */
export interface MannerInput {
  now: number
  priority: number
  lastInteractionAt: number
  recentEvents: readonly FeedbackEvent[]
  focusPressure: number
}

export interface MannerDecision {
  suppress: boolean
  reason?: 'just-interacted' | 'ignored-streak' | 'focus' | 'night'
  /** 附加到阈值上，越高越难开口。 */
  thresholdBoost: number
}

const AUTONOMOUS_PRIORITY = 15
const JUST_INTERACTED_MS = 90 * 1000
const LONG_SILENCE_MS = 45 * 60 * 1000
const NIGHT_START_HOUR = 0
const NIGHT_END_HOUR = 6

function countIgnoredStreak(events: readonly FeedbackEvent[]): number {
  const sorted = [...events].sort((a, b) => b.at - a.at)
  let streak = 0
  for (const event of sorted) {
    if (event.kind === 'ignored') {
      streak += 1
      continue
    }
    if (event.kind === 'engaged') {
      break
    }
  }
  return streak
}

export function decideManners(input: MannerInput): MannerDecision {
  const ignoredStreak = countIgnoredStreak(input.recentEvents)
  let thresholdBoost = Math.min(0.3, ignoredStreak * 0.04 + Math.max(0, input.focusPressure) * 0.1)
  // 很久没说话时反而更容易开口，主动问候。
  const silence = input.now - input.lastInteractionAt
  if (silence > LONG_SILENCE_MS) {
    thresholdBoost = Math.max(-0.12, thresholdBoost - 0.08)
  }

  if (input.priority > AUTONOMOUS_PRIORITY) {
    // 互动类候选不受分寸规则限制。
    return { suppress: false, thresholdBoost }
  }

  const hour = new Date(input.now).getHours()
  const isNight = hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR
  if (isNight) {
    return { suppress: true, reason: 'night', thresholdBoost }
  }
  if (input.now - input.lastInteractionAt < JUST_INTERACTED_MS) {
    return { suppress: true, reason: 'just-interacted', thresholdBoost }
  }
  if (ignoredStreak >= 4) {
    return { suppress: true, reason: 'ignored-streak', thresholdBoost }
  }
  if (input.focusPressure > 0.8) {
    return { suppress: true, reason: 'focus', thresholdBoost }
  }
  return { suppress: false, thresholdBoost }
}

import type { PresenceCandidate, ReturnEpisode } from '../../shared/presence'
import type { SceneCompanionSelection } from '../../shared/scene-companion'

const QUARTER_HOUR_MS = 15 * 60_000
const THIRTY_MINUTES_MS = 30 * 60_000

export function createReturnGreetingCandidate(episode: ReturnEpisode): PresenceCandidate {
  const awayMinutes = Math.max(1, Math.round(episode.awayMs / 60_000))
  return {
    ruleId: 'return-greeting',
    priority: 60,
    cooldownKey: 'return-greeting',
    cooldownMs: 10 * 60_000,
    speech: 'optional',
    bodyPolicy: 'replace',
    canRunWhileSpeaking: false,
    action: 'wave',
    expression: 'neutral',
    dialogue: awayMinutes >= 60 ? '老师，回来了？……先缓一会儿吧。' : '回来了？……我还在这里。',
    spokenText:
      awayMinutes >= 60
        ? 'おかえりなさい、先生。少し落ち着いてからでいいです。'
        : 'おかえりなさい。私はここにいます。',
    ttsEmotion: 'soft',
    reason: `用户离开约 ${awayMinutes} 分钟后返回`,
    tags: ['return'],
  }
}

export function createFocusMilestoneCandidate(milestone: 'first' | 'long'): PresenceCandidate {
  if (milestone === 'long') {
    return {
      ruleId: 'focus-long-milestone',
      priority: 50,
      cooldownKey: 'focus-long-milestone',
      cooldownMs: THIRTY_MINUTES_MS,
      speech: 'optional',
      bodyPolicy: 'replace',
      canRunWhileSpeaking: false,
      action: 'stretch',
      modelClip: 'Normal_Idle',
      expression: 'sleepy',
      dialogue: '就稍微……休息一会儿。',
      restRecovery: true,
      reason: '连续专注达到 90 分钟',
      tags: ['focus', 'rest'],
    }
  }

  return {
    ruleId: 'focus-first-milestone',
    priority: 40,
    cooldownKey: 'focus-first-milestone',
    cooldownMs: THIRTY_MINUTES_MS,
    speech: 'optional',
    bodyPolicy: 'replace',
    canRunWhileSpeaking: false,
    action: 'look_at_cursor',
    modelClip: 'Cafe_Idle',
    expression: 'neutral',
    dialogue: '先忙完。……我在旁边。',
    reason: '连续专注达到 40 分钟',
    tags: ['focus'],
  }
}

export function createLateNightCandidate(): PresenceCandidate {
  return {
    ruleId: 'late-night-first',
    priority: 42,
    cooldownKey: 'late-night-first',
    cooldownMs: 20 * 60 * 60_000,
    speech: 'optional',
    bodyPolicy: 'replace',
    canRunWhileSpeaking: false,
    action: 'look_at_cursor',
    expression: 'neutral',
    dialogue: '这个时间还不睡？……明天会没精神的。',
    reason: '当天第一次进入深夜工作时段',
    tags: ['late_night', 'rest'],
  }
}

export function createRestCandidate(): PresenceCandidate {
  return {
    ruleId: 'rest-needed',
    priority: 35,
    cooldownKey: 'rest-needed',
    cooldownMs: QUARTER_HOUR_MS,
    speech: 'optional',
    bodyPolicy: 'replace',
    canRunWhileSpeaking: false,
    action: 'sleep',
    modelClip: 'Normal_Idle',
    expression: 'sleepy',
    dialogue: '……有点累了。稍微靠一下。',
    spokenText: '少し疲れた……ちょっとだけ休みます。',
    ttsEmotion: 'tired',
    restRecovery: true,
    reason: '精力低于休息阈值',
    tags: ['rest'],
  }
}

export function createIdleMicroCandidate(): PresenceCandidate {
  return {
    ruleId: 'idle-micro-motion',
    priority: 10,
    cooldownKey: 'idle-micro-motion',
    cooldownMs: 5 * 60_000,
    speech: 'none',
    bodyPolicy: 'overlay',
    canRunWhileSpeaking: true,
    microMotion: 'gaze_breath',
    expression: 'neutral',
    reason: '长时间没有互动，只叠加一次低打扰的视线与呼吸微动作',
    tags: ['scene_comment'],
  }
}

export function createAutonomousWalkCandidate(): PresenceCandidate {
  return {
    ruleId: 'autonomous-walk',
    priority: 15,
    cooldownKey: 'autonomous-walk',
    cooldownMs: 10 * 60_000,
    speech: 'none',
    bodyPolicy: 'replace',
    canRunWhileSpeaking: false,
    action: 'walk',
    expression: 'neutral',
    reason: '非专注场景中低频自主移动',
    tags: ['scene_comment'],
  }
}

export function createScenePerformanceCandidate(
  selection: SceneCompanionSelection,
): PresenceCandidate {
  return {
    ruleId: `scene-companion:${selection.id}`,
    priority: selection.restRecovery ? 30 : 25,
    cooldownKey: `scene-companion:${selection.id}`,
    cooldownMs: 0,
    speech: selection.speak ? 'optional' : 'none',
    bodyPolicy: 'replace',
    canRunWhileSpeaking: false,
    action: selection.action,
    modelClip: selection.modelClip,
    performanceId: selection.id,
    expression: selection.expression,
    dialogue: selection.dialogue,
    voice: selection.voice,
    restRecovery: selection.restRecovery,
    reason: `场景 ${selection.scene} 稳定后的主动陪伴`,
    tags: ['scene_comment'],
  }
}

const HOUR_MS = 60 * 60_000

/**
 * 每小时问候：长时间没有开口时，按当前时段说一句。
 * 优先级设为 12，因此仍受分寸感规则约束（深夜、专注时会被压制）。
 */
export function createHourlyGreetingCandidate(hour: number): PresenceCandidate {
  const period =
    hour >= 5 && hour < 11
      ? 'morning'
      : hour >= 11 && hour < 17
        ? 'noon'
        : hour >= 17 && hour < 23
          ? 'evening'
          : 'night'
  const lines: Record<typeof period, { dialogue: string; spokenText: string; emotion: string }> = {
    morning: {
      dialogue: '……早。今天也别太勉强。',
      spokenText: 'おはよう。今日も、無理しないで。',
      emotion: 'soft',
    },
    noon: {
      dialogue: '午饭吃了吗？……别又忘了。',
      spokenText: 'お昼、ちゃんと食べた？',
      emotion: 'neutral',
    },
    evening: {
      dialogue: '今天也辛苦了。……差不多该歇一会儿了。',
      spokenText: '今日もお疲れさま。そろそろ休んで。',
      emotion: 'soft',
    },
    night: {
      dialogue: '……这么晚了，还不睡吗？',
      spokenText: 'こんな時間まで、まだ起きてるの？',
      emotion: 'annoyed',
    },
  }
  const line = lines[period]
  return {
    ruleId: 'hourly-greeting',
    priority: 12,
    cooldownKey: 'hourly-greeting',
    cooldownMs: 55 * 60_000,
    speech: 'optional',
    bodyPolicy: 'replace',
    canRunWhileSpeaking: false,
    action: 'idle',
    expression: period === 'night' ? 'annoyed' : 'neutral',
    dialogue: line.dialogue,
    spokenText: line.spokenText,
    ttsEmotion: line.emotion,
    reason: '每小时问候',
    tags: ['scene_comment'],
  }
}

export const HOURLY_GREETING_INTERVAL_MS = HOUR_MS

/** 浏览器切到新页面时，给她一个「就内容提问/发表看法」的机会。 */
export function createPageNoticeCandidate(page: {
  app: string
  title?: string
  url?: string
}): PresenceCandidate {
  const title = page.title ?? page.app
  return {
    ruleId: 'page-notice',
    priority: 45,
    cooldownKey: 'page-notice',
    cooldownMs: 15 * 60_000,
    speech: 'optional',
    bodyPolicy: 'replace',
    canRunWhileSpeaking: false,
    action: 'look_at_cursor',
    expression: 'neutral',
    dialogue: `「${title.slice(0, 20)}」……看到什么有意思的了？`,
    spokenText: '何か見てるの？',
    ttsEmotion: 'neutral',
    reason: '老师切换了浏览页面',
    tags: ['scene_comment'],
  }
}

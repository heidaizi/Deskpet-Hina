import type { EmotionKind, EmotionState } from '../../shared/presence'
import type { NowPlaying, ScheduleItem } from '../perception/life-context'
import type { SettingsSnapshot } from '../../shared/types'
import type { TimeSceneContext } from '../../shared/time-scene'

export interface RoutineWorldState {
  pomodoroPhase: 'work' | 'break' | null
  pomodoroMinutesLeft: number | null
  waterReminderEnabled: boolean
  sleepTime: string
}

export interface WorldState {
  capturedAt: number
  time: {
    localTime: string
    isWeekend: boolean
    scene: string
    timePeriod: string
  }
  outfit: {
    id: string
    label: string
    mode: '2d' | '3d'
  }
  emotion: (EmotionState & { label: string }) | null
  relationship: {
    level: number
    title: string
  }
  routine: RoutineWorldState
  schedule: ScheduleItem[]
  media: NowPlaying | null
}

const EMOTION_LABELS: Record<EmotionKind, string> = {
  calm: '平静',
  content: '满足',
  concerned: '担心',
  embarrassed: '害羞',
  annoyed: '有点恼火',
  tired: '疲倦',
}

export interface BuildWorldStateInput {
  now: number
  scene: TimeSceneContext
  snapshot: SettingsSnapshot
  emotion: EmotionState | null
  routine: RoutineWorldState
  schedule: readonly ScheduleItem[]
  media: NowPlaying | null
}

export function buildWorldState(input: BuildWorldStateInput): WorldState {
  const { snapshot } = input
  const renderers = snapshot.character.renderers
  const selected =
    renderers.find((renderer) => renderer.id === snapshot.settings.rendererId) ??
    renderers.find((renderer) => renderer.mode === snapshot.settings.rendererMode) ??
    null
  return {
    capturedAt: input.now,
    time: {
      localTime: `${input.scene.localDate} ${input.scene.localTime}`,
      isWeekend: input.scene.isWeekend,
      scene: input.scene.scene,
      timePeriod: input.scene.timePeriod,
    },
    outfit: {
      id: selected?.id ?? snapshot.settings.rendererId,
      label: selected?.label ?? '默认',
      mode: selected?.mode ?? snapshot.settings.rendererMode,
    },
    emotion: input.emotion
      ? { ...input.emotion, label: EMOTION_LABELS[input.emotion.dominant] }
      : null,
    relationship: {
      level: snapshot.state.affectionLevel,
      title: snapshot.state.affectionTitle,
    },
    routine: input.routine,
    schedule: [...input.schedule],
    media: input.media,
  }
}

/** 给聊天模型的「情境补充」，只放不会与其他 prompt 重复的部分。 */
export function buildWorldStatePrompt(world: WorldState): string {
  const lines = [
    '【共享世界状态】（背景信息，不要逐条复述）',
    `- 时间：${world.time.localTime}（${world.time.timePeriod}${world.time.isWeekend ? '，周末' : ''}）`,
    `- 当前服装：${world.outfit.label}${world.outfit.mode === '3d' ? '（3D）' : ''}`,
    `- 关系：${world.relationship.title}`,
  ]
  if (world.emotion) {
    lines.push(
      `- 她当前的情绪：${world.emotion.label}（疲劳 ${Math.round(world.emotion.fatigue)}/100，耐心 ${Math.round(world.emotion.patience)}/100）`,
    )
  }
  if (world.routine.pomodoroPhase === 'work' && world.routine.pomodoroMinutesLeft !== null) {
    lines.push(`- 正在陪老师专注：约剩 ${world.routine.pomodoroMinutesLeft} 分钟`)
  } else if (world.routine.pomodoroPhase === 'break') {
    lines.push('- 专注计时刚结束，处于休息时间')
  }
  lines.push('说明：服装、情绪和专注状态只在自然相关时顺带提一句，不要机械播报。')
  return lines.join('\n')
}

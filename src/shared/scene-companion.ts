import type { PetAnimation, PetExpression } from './types'
import { getOfficialVoiceLine } from './official-voices'
import type { SceneKind, TimePeriod } from './time-scene'

export interface SceneCompanionContext {
  scene: SceneKind
  timePeriod: TimePeriod
  energy: number
  mood: number
  affectionLevel: number
  now: number
  visible: boolean
  dragging: boolean
  clickThrough: boolean
  screenLocked: boolean
  suspended: boolean
  systemIdleSeconds: number
  randomVoiceEnabled: boolean
}

export interface SceneCompanionSelection {
  id: string
  scene: SceneKind
  dialogue: string
  action: PetAnimation
  expression: PetExpression
  voice?: string
  modelClip?: string
  restRecovery?: boolean
  speak: boolean
}

interface PerformanceOptions {
  scenes?: readonly SceneKind[]
  timePeriods?: readonly TimePeriod[]
  weight?: number
  minEnergy?: number
  maxEnergy?: number
  minMood?: number
  maxMood?: number
  minAffection?: number
  minSystemIdleSeconds?: number
  maxSystemIdleSeconds?: number
  restRecovery?: boolean
  voicePath?: string
  modelClip?: string
}

interface IdlePerformance extends PerformanceOptions {
  id: string
  text: string
  action: PetAnimation
  expression: PetExpression
}

const ALL_SCENES: readonly SceneKind[] = [
  'browser',
  'focus',
  'development',
  'communication',
  'media',
  'desktop',
  'other',
]

function performance(
  id: string,
  text: string,
  action: PetAnimation,
  expression: PetExpression,
  options: PerformanceOptions = {},
): IdlePerformance {
  return {
    id,
    text,
    action,
    expression,
    scenes: ALL_SCENES,
    weight: 1,
    ...options,
  }
}

function officialPerformance(
  id: string,
  clip: string,
  options: PerformanceOptions = {},
): IdlePerformance {
  const line = getOfficialVoiceLine(clip)
  if (!line) {
    throw new Error(`Unknown official Hina voice clip: ${clip}`)
  }
  return performance(id, line.text, line.action, line.expression, {
    ...options,
    voicePath: line.path,
    modelClip: line.modelClip,
  })
}

const IDLE_PERFORMANCES: readonly IdlePerformance[] = [
  performance('look-what', '……在做什么？', 'look_at_cursor', 'neutral', {
    scenes: ['browser', 'focus', 'development', 'media', 'desktop', 'other'],
    weight: 2,
  }),
  performance('say-if-needed', '有事就说。', 'look_at_cursor', 'neutral', {
    scenes: ['browser', 'communication', 'desktop', 'other'],
    weight: 2,
  }),
  performance('still-working', '我还有工作。', 'look_at_cursor', 'neutral', {
    scenes: ['development', 'focus'],
    maxEnergy: 70,
    weight: 2,
  }),
  performance('quiet-tired', '先让我安静一会儿。', 'idle', 'sleepy', {
    scenes: ['focus', 'development', 'media', 'other'],
    maxEnergy: 55,
    weight: 2,
  }),
  performance(
    'late-night-warning',
    '这个时间还不睡？……明天会没精神的。',
    'look_at_cursor',
    'neutral',
    {
      timePeriods: ['night', 'late_night'],
      weight: 4,
    },
  ),
  performance('late-night-gentle', '已经这么晚了。别把自己逼太紧。', 'idle', 'neutral', {
    scenes: ['browser', 'focus', 'development', 'media', 'other'],
    timePeriods: ['evening', 'night', 'late_night'],
    weight: 3,
  }),
  performance('close-late-night', '这么晚还不睡……我也陪你一会儿。', 'idle', 'happy', {
    timePeriods: ['night', 'late_night'],
    minAffection: 6,
    weight: 3,
  }),
  performance('focus-wait', '先忙完。……我在旁边。', 'idle', 'neutral', {
    scenes: ['development', 'focus', 'communication'],
    weight: 2,
    modelClip: 'Cafe_Idle',
  }),
  performance('focus-reminder', '专心一点。现在不是分心的时候。', 'look_at_cursor', 'neutral', {
    scenes: ['development', 'focus'],
    weight: 2,
  }),
  performance('communication-wait', '先把话说完。我会等你。', 'idle', 'neutral', {
    scenes: ['communication'],
    weight: 3,
  }),
  performance('summer-wish', '今年夏天……还想和老师一起过。', 'idle', 'happy', {
    scenes: ['browser', 'focus', 'media', 'desktop', 'other'],
    minAffection: 7,
    weight: 2,
    modelClip: 'Public01',
  }),
  performance('summer-promise', '就算夏天结束……我也会在这里。', 'idle', 'happy', {
    minAffection: 8,
    weight: 2,
    modelClip: 'Formation_Idle',
  }),
  performance('quiet-company', '只是待在旁边的话……倒也不坏。', 'idle', 'happy', {
    scenes: ['focus', 'communication', 'media', 'desktop', 'other'],
    minMood: 45,
    weight: 2,
    modelClip: 'Cafe_Idle',
  }),
  performance('companion-silence', '不用一直说话。这样就好。', 'idle', 'neutral', {
    weight: 2,
    modelClip: 'Formation_Idle',
  }),
  performance('stay-longer', '……再待一会儿也可以。', 'idle', 'happy', {
    scenes: ['focus', 'media', 'desktop', 'other'],
    minMood: 50,
    minAffection: 4,
    weight: 2,
    modelClip: 'Cafe_Idle',
  }),
  performance('short-rest', '就稍微……休息一会儿。', 'stretch', 'sleepy', {
    scenes: ['development', 'focus', 'media', 'desktop', 'other'],
    maxEnergy: 75,
    weight: 2,
    restRecovery: true,
    modelClip: 'Normal_Idle',
  }),
  performance('offer-help', '老师？有什么我能帮忙的吗？', 'wave', 'neutral', {
    scenes: ['browser', 'communication', 'desktop'],
    minEnergy: 35,
    weight: 2,
    modelClip: 'Normal_Callsign',
  }),
  officialPerformance('official-swimsuit', 'Cafe_monolog_1', {
    scenes: ['browser', 'media', 'desktop', 'other'],
    minAffection: 2,
  }),
  officialPerformance('official-tired', 'Cafe_monolog_2', {
    maxEnergy: 55,
    weight: 3,
    restRecovery: true,
  }),
  officialPerformance('official-embarrassed', 'Lobby_2', {
    scenes: ['browser', 'focus', 'media', 'other'],
    minAffection: 4,
  }),
  officialPerformance('official-rest', 'Lobby_3', {
    maxEnergy: 60,
    weight: 2,
    restRecovery: true,
  }),
  officialPerformance('official-help', 'Lobby_4', {
    scenes: ['browser', 'communication', 'desktop'],
    minAffection: 5,
    weight: 2,
  }),
  officialPerformance('official-stay', 'Lobby_5', {
    minAffection: 6,
    weight: 2,
  }),
  officialPerformance('official-summer-camp', 'EventLobby_3', {
    scenes: ['browser', 'desktop', 'other'],
    minAffection: 3,
  }),
  officialPerformance('official-together', 'Relationship_Up_1', {
    minAffection: 6,
    weight: 2,
  }),
  officialPerformance('official-welcome', 'LogIn_1', {
    scenes: ['browser', 'desktop', 'other'],
    minSystemIdleSeconds: 30,
    maxSystemIdleSeconds: 120,
    weight: 3,
  }),
  officialPerformance('official-annoyed', 'Battle_Damage_2', {
    maxMood: 30,
  }),
  officialPerformance('official-still-there', 'Battle_Move_2', {
    minSystemIdleSeconds: 75,
    maxSystemIdleSeconds: 120,
  }),
]

export function getSceneCompanionDialogueTexts(): string[] {
  return [...new Set(IDLE_PERFORMANCES.map((entry) => entry.text))]
}

export class SceneCompanion {
  private candidateScene: SceneKind | null = null
  private candidateSince = 0
  private nextEligibleAt = Number.NEGATIVE_INFINITY
  private recentPerformanceIds: string[] = []

  constructor(
    private readonly random: () => number = Math.random,
    private readonly options: {
      stableMs?: number
      cooldownMs?: number
      minCooldownMs?: number
      maxCooldownMs?: number
      maximumIdleSeconds?: number
      recentLimit?: number
    } = {},
  ) {}

  observe(context: SceneCompanionContext): SceneCompanionSelection | null {
    if (!isEligible(context)) {
      this.candidateScene = null
      return null
    }
    if (this.candidateScene !== context.scene) {
      this.candidateScene = context.scene
      this.candidateSince = context.now
      return null
    }

    const stableMs = this.options.stableMs ?? 20_000
    const maximumIdleSeconds = this.options.maximumIdleSeconds ?? 120
    if (
      context.now - this.candidateSince < stableMs ||
      context.now < this.nextEligibleAt ||
      context.systemIdleSeconds > maximumIdleSeconds
    ) {
      return null
    }

    const eligible = IDLE_PERFORMANCES.filter((entry) => matchesContext(entry, context))
    if (eligible.length === 0) {
      return null
    }
    const fresh = eligible.filter((entry) => !this.recentPerformanceIds.includes(entry.id))
    const candidates = fresh.length > 0 ? fresh : eligible
    const selected = pickWeighted(candidates, context, this.random)
    if (!selected) {
      return null
    }

    const recentLimit = Math.max(1, this.options.recentLimit ?? 10)
    this.recentPerformanceIds = [...this.recentPerformanceIds, selected.id].slice(-recentLimit)
    this.nextEligibleAt = context.now + this.nextCooldownMs()
    return {
      id: selected.id,
      scene: context.scene,
      dialogue: selected.text,
      action: selected.action,
      expression: selected.expression,
      voice: selected.voicePath,
      modelClip: selected.modelClip,
      restRecovery: selected.restRecovery,
      speak: true,
    }
  }

  private nextCooldownMs(): number {
    if (this.options.cooldownMs !== undefined) {
      return this.options.cooldownMs
    }
    const minimum = this.options.minCooldownMs ?? 70_000
    const maximum = Math.max(minimum, this.options.maxCooldownMs ?? 180_000)
    return minimum + this.random() * (maximum - minimum)
  }
}

function matchesContext(entry: IdlePerformance, context: SceneCompanionContext): boolean {
  return (
    entry.scenes?.includes(context.scene) === true &&
    (!entry.timePeriods || entry.timePeriods.includes(context.timePeriod)) &&
    (entry.minEnergy === undefined || context.energy >= entry.minEnergy) &&
    (entry.maxEnergy === undefined || context.energy <= entry.maxEnergy) &&
    (entry.minMood === undefined || context.mood >= entry.minMood) &&
    (entry.maxMood === undefined || context.mood <= entry.maxMood) &&
    (entry.minAffection === undefined || context.affectionLevel >= entry.minAffection) &&
    (entry.minSystemIdleSeconds === undefined ||
      context.systemIdleSeconds >= entry.minSystemIdleSeconds) &&
    (entry.maxSystemIdleSeconds === undefined ||
      context.systemIdleSeconds <= entry.maxSystemIdleSeconds)
  )
}

function pickWeighted(
  candidates: readonly IdlePerformance[],
  context: SceneCompanionContext,
  random: () => number,
): IdlePerformance | null {
  const weights = candidates.map((entry) => {
    let weight = Math.max(0.1, entry.weight ?? 1)
    if (entry.restRecovery && context.energy < 40) {
      weight += 3
    }
    if (entry.timePeriods?.includes(context.timePeriod)) {
      weight += 2
    }
    if (entry.minAffection !== undefined) {
      weight += 1
    }
    return weight
  })
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let roll = Math.max(0, Math.min(1 - Number.EPSILON, random())) * total
  for (let index = 0; index < candidates.length; index += 1) {
    roll -= weights[index] ?? 0
    if (roll < 0) {
      return candidates[index] ?? null
    }
  }
  return candidates.at(-1) ?? null
}

function isEligible(context: SceneCompanionContext): boolean {
  return (
    context.visible &&
    !context.dragging &&
    !context.clickThrough &&
    !context.screenLocked &&
    !context.suspended &&
    context.randomVoiceEnabled &&
    context.scene !== 'system' &&
    context.scene !== 'unknown'
  )
}

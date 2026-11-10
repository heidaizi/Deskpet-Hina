import {
  EMOTION_KINDS,
  type EmotionCause,
  type EmotionKind,
  type EmotionState,
  type PresenceCandidate,
  type PresenceTag,
  type RelationshipProfile,
} from '../../shared/presence'
import type { InteractionKind } from '../../shared/types'
import type { TimeSceneContext } from '../../shared/time-scene'

const MAX_CAUSES = 12
const CAUSE_LIFETIME_MS = 5 * 60_000
const MAX_ELAPSED_MINUTES = 6 * 60
const MAX_EVENT_DELTA = 6

export interface EmotionTickContext {
  now: number
  scene: TimeSceneContext
  energy: number
  mood: number
  affectionLevel: number
}

export interface EmotionInteractionContext extends EmotionTickContext {
  kind: InteractionKind
  area: string
}

export function createDefaultEmotionState(
  now: number,
  energy = 78,
  mood = 62,
  affectionLevel = 1,
): EmotionState {
  const state: EmotionState = {
    schemaVersion: 1,
    valence: clamp(50 + (mood - 60) * 0.18, 0, 100),
    activation: 48,
    fatigue: clamp(100 - energy, 0, 100),
    patience: clamp(68 + (affectionLevel - 1) * 2.5, 0, 100),
    socialBattery: clamp(55 + (affectionLevel - 1) * 2, 0, 100),
    dominant: 'calm',
    causes: [],
    updatedAt: now,
  }
  return {
    ...state,
    dominant: getDominantEmotion(state),
  }
}

export function normalizeEmotionState(raw: unknown, fallback: EmotionState): EmotionState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fallback
  }
  const value = raw as Partial<EmotionState>
  const normalized: EmotionState = {
    schemaVersion: 1,
    valence: normalizedNumber(value.valence, fallback.valence),
    activation: normalizedNumber(value.activation, fallback.activation),
    fatigue: normalizedNumber(value.fatigue, fallback.fatigue),
    patience: normalizedNumber(value.patience, fallback.patience),
    socialBattery: normalizedNumber(value.socialBattery, fallback.socialBattery),
    dominant: isEmotionKind(value.dominant) ? value.dominant : fallback.dominant,
    causes: normalizeCauses(value.causes),
    updatedAt:
      typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : fallback.updatedAt,
  }
  return {
    ...normalized,
    dominant: getDominantEmotion(normalized),
  }
}

export function advanceEmotion(state: EmotionState, context: EmotionTickContext): EmotionState {
  const elapsedMinutes = clamp((context.now - state.updatedAt) / 60_000, 0, MAX_ELAPSED_MINUTES)
  if (elapsedMinutes <= 0 && !hasExpiredCauses(state.causes, context.now)) {
    return state
  }

  const relationship = getRelationshipProfile(context.affectionLevel)
  const focusScene = context.scene.scene === 'focus' || context.scene.scene === 'development'
  const quietScene = focusScene || context.scene.scene === 'communication'
  const lateNight = context.scene.timePeriod === 'late_night'
  const fatigueTarget = clamp(
    100 - context.energy + (focusScene ? 10 : 0) + (lateNight ? 8 : 0),
    0,
    100,
  )
  const patienceTarget = clamp(
    66 + (context.affectionLevel - 1) * 2.5 - fatigueTarget * 0.08,
    15,
    92,
  )
  const socialTarget = clamp(
    54 + (context.affectionLevel - 1) * 2 + (quietScene ? 2 : 0) - (lateNight ? 5 : 0),
    15,
    95,
  )

  const next: EmotionState = {
    ...state,
    valence: approach(state.valence, 50 + (context.mood - 60) * 0.18, 0.035, elapsedMinutes),
    activation: approach(
      state.activation,
      clamp(48 + (context.mood - 50) * 0.15 - fatigueTarget * 0.14, 15, 85),
      0.08,
      elapsedMinutes,
    ),
    fatigue: approach(state.fatigue, fatigueTarget, 0.055, elapsedMinutes),
    patience: approach(
      state.patience,
      patienceTarget,
      0.08 * relationship.patienceRecoveryMultiplier,
      elapsedMinutes,
    ),
    socialBattery: approach(
      state.socialBattery,
      socialTarget,
      0.045 * relationship.socialRecoveryMultiplier,
      elapsedMinutes,
    ),
    causes: normalizeCauses(state.causes, context.now),
    updatedAt: context.now,
  }
  return {
    ...next,
    dominant: getDominantEmotion(next),
  }
}

export function applyInteractionEmotion(
  state: EmotionState,
  context: EmotionInteractionContext,
): EmotionState {
  const advanced = advanceEmotion(state, context)
  const relationship = getRelationshipProfile(context.affectionLevel)
  let valence = advanced.valence
  let activation = advanced.activation
  let fatigue = advanced.fatigue
  let patience = advanced.patience
  let socialBattery = advanced.socialBattery
  let source = `${context.kind}:${context.area}`
  let label = '普通互动'

  if (context.area === 'head' && context.kind === 'hold') {
    const recentHeadpats = countRecentCauses(advanced.causes, 'hold:head', context.now)
    valence += recentHeadpats >= 2 ? 0.5 : 2.2
    patience += recentHeadpats >= 2 ? -0.8 : 1.5
    socialBattery -= 0.3
    activation += 1.5
    label = '被轻轻摸头'
  } else if (context.area === 'head' && context.kind === 'double_tap') {
    valence -= 0.8
    patience -= 1.8 * relationship.negativeSensitivity
    activation += 2
    label = '头部被连续戳'
  } else if (context.area === 'head') {
    const recentTaps = countRecentCauses(advanced.causes, 'tap:head', context.now)
    const diminishingPenalty = Math.max(0.35, 0.9 - recentTaps * 0.18)
    valence += recentTaps === 0 ? 0.8 : -0.2
    patience -= diminishingPenalty * relationship.negativeSensitivity
    socialBattery -= 0.45
    activation += 1
    label = recentTaps >= 2 ? '头部被连续戳' : '头部被戳了一下'
    source = 'tap:head'
  } else if (context.area.startsWith('horn') || context.area === 'halo') {
    valence -= 2.4
    patience -= 4 * relationship.negativeSensitivity
    socialBattery -= 1.5
    activation += 3
    label = '敏感部位被碰'
  } else if (context.kind === 'drag') {
    valence -= 1.5
    patience -= 3 * relationship.negativeSensitivity
    socialBattery -= 2
    activation += 4
    fatigue += 0.8
    label = '被突然提起'
  } else if (context.area === 'body') {
    valence += 0.4
    patience -= 0.25 * relationship.negativeSensitivity
    socialBattery -= 0.25
    activation += 2
    label = '身体被戳'
  }

  const next: EmotionState = {
    ...advanced,
    valence: boundedChange(advanced.valence, valence),
    activation: boundedChange(advanced.activation, activation),
    fatigue: boundedChange(advanced.fatigue, fatigue),
    patience: boundedChange(advanced.patience, patience),
    socialBattery: boundedChange(advanced.socialBattery, socialBattery),
    causes: appendCause(advanced.causes, {
      source,
      delta: roundOne(valence - advanced.valence),
      label,
      startedAt: context.now,
      expiresAt: context.now + CAUSE_LIFETIME_MS,
    }),
    updatedAt: context.now,
  }
  return {
    ...next,
    dominant: getDominantEmotion(next),
  }
}

export function applyPresenceEmotion(
  state: EmotionState,
  candidate: PresenceCandidate,
  now: number,
): EmotionState {
  let valence = state.valence
  let activation = state.activation
  let fatigue = state.fatigue
  let patience = state.patience
  let socialBattery = state.socialBattery
  let label = candidate.reason

  if (candidate.ruleId === 'focus-first-milestone') {
    fatigue += 2.2
    patience -= 0.5
    socialBattery -= 0.3
    label = '注意到老师持续专注'
  } else if (candidate.ruleId === 'focus-long-milestone' || candidate.ruleId === 'rest-needed') {
    fatigue -= 8
    patience += 3.5
    socialBattery += 3
    valence += 1
    label = '一起短暂休息'
  } else if (candidate.ruleId === 'late-night-first') {
    fatigue += 3
    valence -= 0.7
    activation += 1
    label = '担心老师熬夜'
  } else if (candidate.ruleId === 'return-greeting') {
    valence += 1.2
    socialBattery += 3.5
    activation += 2
    label = '老师回来了'
  } else if (candidate.tags.includes('scene_comment')) {
    socialBattery += candidate.speech === 'none' ? 0.2 : 0.7
  }

  const next: EmotionState = {
    ...state,
    valence: clamp(roundOne(valence), 0, 100),
    activation: clamp(roundOne(activation), 0, 100),
    fatigue: clamp(roundOne(fatigue), 0, 100),
    patience: clamp(roundOne(patience), 0, 100),
    socialBattery: clamp(roundOne(socialBattery), 0, 100),
    causes: appendCause(state.causes, {
      source: candidate.ruleId,
      delta: roundOne(valence - state.valence),
      label,
      startedAt: now,
      expiresAt: now + 10 * 60_000,
    }),
    updatedAt: now,
  }
  return {
    ...next,
    dominant: getDominantEmotion(next),
  }
}

export function getRelationshipProfile(affectionLevel: number): RelationshipProfile {
  const level = clamp(Math.trunc(affectionLevel), 1, 8)
  return {
    closeness: level >= 6 ? 'close' : level >= 3 ? 'familiar' : 'reserved',
    negativeSensitivity: clamp(1.12 - level * 0.045, 0.72, 1.12),
    patienceRecoveryMultiplier: clamp(0.9 + level * 0.06, 0.9, 1.4),
    socialRecoveryMultiplier: clamp(0.92 + level * 0.045, 0.92, 1.3),
  }
}

export function getEmotionScoreAdjustment(
  candidate: PresenceCandidate,
  emotion: EmotionState | undefined,
  relationship: RelationshipProfile | undefined,
): number {
  if (!emotion) {
    return 0
  }
  let adjustment = 0
  const tags = new Set<PresenceTag>(candidate.tags)
  if (emotion.fatigue >= 65) {
    if (tags.has('rest')) {
      adjustment += 3.5
    }
    if (tags.has('scene_comment') && candidate.speech !== 'none') {
      adjustment -= 1.8
    }
  }
  if (emotion.socialBattery <= 25) {
    if (candidate.speech !== 'none') {
      adjustment -= 2.2
    } else if (candidate.ruleId === 'idle-micro-motion' || candidate.ruleId === 'autonomous-walk') {
      adjustment += 0.8
    }
  }
  if (emotion.patience <= 30) {
    if (tags.has('scene_comment') && candidate.speech !== 'none') {
      adjustment -= 1.5
    }
    if (tags.has('affection')) {
      adjustment -= 1
    }
  }
  if (emotion.valence >= 62 && relationship?.closeness === 'close') {
    if (tags.has('affection')) {
      adjustment += 1.3
    }
    if (candidate.ruleId === 'return-greeting') {
      adjustment += 1
    }
  }
  if (emotion.activation >= 70 && candidate.ruleId === 'autonomous-walk') {
    adjustment += 0.8
  }
  return clamp(adjustment, -4, 4)
}

export function getVoiceEmotion(
  emotion: EmotionState,
  affectionLevel: number,
  relationship = getRelationshipProfile(affectionLevel),
): string {
  if (emotion.fatigue >= 70 || emotion.dominant === 'tired') {
    return 'tired'
  }
  if ((emotion.patience <= 30 && emotion.valence < 45) || emotion.dominant === 'annoyed') {
    return 'annoyed'
  }
  if (emotion.dominant === 'embarrassed') {
    return 'embarrassed'
  }
  if (emotion.dominant === 'concerned') {
    return emotion.patience <= 35 ? 'warning' : 'soft'
  }
  if (emotion.dominant === 'content') {
    return affectionLevel >= 5 || relationship.closeness === 'close' ? 'soft' : 'calm'
  }
  return emotion.activation <= 32 ? 'soft' : 'calm'
}

export function getVoicePerformanceStyle(
  emotion: EmotionState,
  affectionLevel: number,
  explicitEmotion?: string | null,
  relationship = getRelationshipProfile(affectionLevel),
): {
  emotion: string
  durationScale: number
  activationBucket: number
} {
  const voiceEmotion = explicitEmotion || getVoiceEmotion(emotion, affectionLevel, relationship)
  const baseScale: Record<string, number> = {
    tired: 1.09,
    soft: 1.05,
    calm: 1,
    embarrassed: 1.04,
    annoyed: 0.96,
    warning: 0.97,
  }
  const activationAdjustment = ((emotion.activation - 50) / 100) * 0.08
  const fatigueAdjustment = (Math.max(0, emotion.fatigue - 35) / 100) * 0.07
  const closenessAdjustment = relationship.closeness === 'close' ? 0.01 : 0
  const durationScale = roundTwo(
    clamp(
      (baseScale[voiceEmotion] ?? 1) -
        activationAdjustment +
        fatigueAdjustment +
        closenessAdjustment,
      0.9,
      1.12,
    ),
  )
  return {
    emotion: voiceEmotion,
    durationScale,
    activationBucket: Math.round(emotion.activation / 10),
  }
}

function getDominantEmotion(state: EmotionState): EmotionKind {
  const recentEmbarrassed = state.causes.some(
    (cause) =>
      cause.source.startsWith('tap:head') && state.updatedAt - cause.startedAt < CAUSE_LIFETIME_MS,
  )
  if (recentEmbarrassed && state.valence >= 50 && state.patience > 35) {
    return 'embarrassed'
  }
  if (state.fatigue >= 72) {
    return 'tired'
  }
  if (state.patience <= 30 && state.valence < 45) {
    return 'annoyed'
  }
  if (state.valence < 38 || (state.fatigue >= 58 && state.patience < 45)) {
    return 'concerned'
  }
  if (state.valence >= 62 && state.socialBattery >= 45) {
    return 'content'
  }
  return 'calm'
}

function normalizeCauses(value: unknown, now = Number.POSITIVE_INFINITY): EmotionCause[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .flatMap((entry): EmotionCause[] => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return []
      }
      const cause = entry as Partial<EmotionCause>
      if (
        typeof cause.source !== 'string' ||
        typeof cause.label !== 'string' ||
        typeof cause.startedAt !== 'number' ||
        !Number.isFinite(cause.startedAt) ||
        typeof cause.delta !== 'number' ||
        !Number.isFinite(cause.delta)
      ) {
        return []
      }
      const expiresAt =
        typeof cause.expiresAt === 'number' && Number.isFinite(cause.expiresAt)
          ? cause.expiresAt
          : undefined
      if (expiresAt !== undefined && expiresAt <= now) {
        return []
      }
      return [
        {
          source: cause.source.slice(0, 80),
          delta: roundOne(cause.delta),
          label: cause.label.slice(0, 120),
          startedAt: cause.startedAt,
          ...(expiresAt === undefined ? {} : { expiresAt }),
        },
      ]
    })
    .slice(-MAX_CAUSES)
}

function appendCause(causes: readonly EmotionCause[], cause: EmotionCause): EmotionCause[] {
  return normalizeCauses([...causes, cause], cause.startedAt)
}

function countRecentCauses(causes: readonly EmotionCause[], source: string, now: number): number {
  return causes.filter(
    (cause) => cause.source === source && now - cause.startedAt < CAUSE_LIFETIME_MS,
  ).length
}

function hasExpiredCauses(causes: readonly EmotionCause[], now: number): boolean {
  return causes.some((cause) => cause.expiresAt !== undefined && cause.expiresAt <= now)
}

function approach(
  current: number,
  target: number,
  ratePerMinute: number,
  elapsedMinutes: number,
): number {
  const delta = target - current
  const maximum = ratePerMinute * elapsedMinutes
  return clamp(roundOne(current + clamp(delta, -maximum, maximum)), 0, 100)
}

function boundedChange(current: number, requested: number): number {
  return clamp(current + clamp(requested - current, -MAX_EVENT_DELTA, MAX_EVENT_DELTA), 0, 100)
}

function normalizedNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(roundOne(value), 0, 100)
    : fallback
}

function isEmotionKind(value: unknown): value is EmotionKind {
  return typeof value === 'string' && EMOTION_KINDS.includes(value as EmotionKind)
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

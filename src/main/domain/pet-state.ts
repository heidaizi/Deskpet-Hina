import type { AppSettings, PetStateView } from '../../shared/types'
import { MODEL_SCALE_MAX, MODEL_SCALE_MIN } from '../../shared/model-animations'
import type { AffectionConfig, PetState, PetSettings } from './types'

export const PET_STATE_SCHEMA_VERSION = 1
export const SETTINGS_SCHEMA_VERSION = 11

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function roundToOne(value: number): number {
  return Math.round(value * 10) / 10
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getAffectionLevel(
  affectionXp: number,
  levels: readonly { level: number; minXp: number; title: string; unlocks: string[] }[],
): {
  level: number
  title: string
  nextLevelXp: number | null
  nextLevelTitle: string | null
  unlockedContent: string[]
  nextLevelUnlocks: string[]
} {
  const sorted = [...levels].sort((left, right) => left.minXp - right.minXp)
  let current = sorted[0] ?? {
    level: 1,
    minXp: 0,
    title: '初识',
    unlocks: [],
  }

  for (const level of sorted) {
    if (affectionXp >= level.minXp) {
      current = level
    } else {
      break
    }
  }

  const next = sorted.find((level) => level.minXp > affectionXp)
  return {
    level: current.level,
    title: current.title,
    nextLevelXp: next?.minXp ?? null,
    nextLevelTitle: next?.title ?? null,
    unlockedContent: sorted
      .filter((level) => level.minXp <= current.minXp)
      .flatMap((level) => level.unlocks),
    nextLevelUnlocks: next?.unlocks ?? [],
  }
}

export function createDefaultPetState(config: AffectionConfig, dateKey: string): PetState {
  const affection = getAffectionLevel(config.starting.affectionXp, config.levels)
  return {
    schemaVersion: PET_STATE_SCHEMA_VERSION,
    affectionXp: roundToOne(config.starting.affectionXp),
    affectionLevel: affection.level,
    mood: roundToOne(clamp(config.starting.mood, 0, 100)),
    energy: roundToOne(clamp(config.starting.energy, 0, 100)),
    lastInteractionAt: null,
    dailyGains: {
      date: dateKey,
      affectionXp: 0,
      interactions: 0,
    },
    cooldowns: {},
    flags: {},
    dialogueHistory: [],
  }
}

export function refreshDailyState(
  state: PetState,
  dateKey: string,
  recovery: AffectionConfig['dailyRecovery'],
): PetState {
  if (state.dailyGains.date === dateKey) {
    return state
  }

  const next = structuredClone(state)
  next.mood = roundToOne(clamp(next.mood + recovery.mood, 0, 100))
  next.energy = roundToOne(clamp(next.energy + recovery.energy, 0, 100))
  next.dailyGains = {
    date: dateKey,
    affectionXp: 0,
    interactions: 0,
  }
  return next
}

export function normalizePetState(
  raw: unknown,
  config: AffectionConfig,
  dateKey: string,
): PetState {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Pet state is not an object.')
  }

  const candidate = raw as Partial<PetState>
  if (
    Number.isFinite(candidate.schemaVersion) &&
    Number(candidate.schemaVersion) > PET_STATE_SCHEMA_VERSION
  ) {
    throw new Error(`Unsupported pet state schema: ${candidate.schemaVersion}`)
  }

  const defaults = createDefaultPetState(config, dateKey)
  const affectionXp =
    typeof candidate.affectionXp === 'number' && Number.isFinite(candidate.affectionXp)
      ? Math.max(0, candidate.affectionXp)
      : defaults.affectionXp
  const affection = getAffectionLevel(affectionXp, config.levels)

  const cooldowns: Record<string, number> = {}
  if (candidate.cooldowns && typeof candidate.cooldowns === 'object') {
    for (const [key, value] of Object.entries(candidate.cooldowns)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        cooldowns[key] = value
      }
    }
  }

  const flags: Record<string, string | number | boolean> = {}
  if (candidate.flags && typeof candidate.flags === 'object') {
    for (const [key, value] of Object.entries(candidate.flags)) {
      if (['string', 'number', 'boolean'].includes(typeof value)) {
        flags[key] = value as string | number | boolean
      }
    }
  }

  const dailyDate =
    candidate.dailyGains && typeof candidate.dailyGains.date === 'string'
      ? candidate.dailyGains.date
      : dateKey
  const sameDay = dailyDate === dateKey
  const dailyGains = {
    date: dateKey,
    affectionXp:
      sameDay &&
      typeof candidate.dailyGains?.affectionXp === 'number' &&
      Number.isFinite(candidate.dailyGains.affectionXp)
        ? clamp(candidate.dailyGains.affectionXp, 0, config.dailyAffectionCap)
        : 0,
    interactions:
      sameDay &&
      typeof candidate.dailyGains?.interactions === 'number' &&
      Number.isFinite(candidate.dailyGains.interactions)
        ? Math.max(0, Math.floor(candidate.dailyGains.interactions))
        : 0,
  }
  const mood =
    typeof candidate.mood === 'number' && Number.isFinite(candidate.mood)
      ? roundToOne(clamp(candidate.mood, 0, 100))
      : defaults.mood
  const energy =
    typeof candidate.energy === 'number' && Number.isFinite(candidate.energy)
      ? roundToOne(clamp(candidate.energy, 0, 100))
      : defaults.energy

  return {
    schemaVersion: PET_STATE_SCHEMA_VERSION,
    affectionXp: roundToOne(affectionXp),
    affectionLevel: affection.level,
    mood: sameDay ? mood : roundToOne(clamp(mood + config.dailyRecovery.mood, 0, 100)),
    energy: sameDay ? energy : roundToOne(clamp(energy + config.dailyRecovery.energy, 0, 100)),
    lastInteractionAt:
      typeof candidate.lastInteractionAt === 'number' &&
      Number.isFinite(candidate.lastInteractionAt)
        ? candidate.lastInteractionAt
        : null,
    dailyGains,
    cooldowns,
    flags,
    dialogueHistory: Array.isArray(candidate.dialogueHistory)
      ? candidate.dialogueHistory
          .filter((item): item is string => typeof item === 'string')
          .slice(-12)
      : [],
  }
}

export function toPetStateView(state: PetState, config: AffectionConfig): PetStateView {
  const affection = getAffectionLevel(state.affectionXp, config.levels)
  const levelMinXp = config.levels.find((level) => level.level === affection.level)?.minXp ?? 0
  return {
    affectionXp: state.affectionXp,
    affectionLevel: affection.level,
    affectionTitle: affection.title,
    affectionLevelMinXp: levelMinXp,
    nextLevelXp: affection.nextLevelXp,
    nextLevelTitle: affection.nextLevelTitle,
    unlockedContent: affection.unlockedContent,
    nextLevelUnlocks: affection.nextLevelUnlocks,
    mood: state.mood,
    energy: state.energy,
    dailyAffectionXp: state.dailyGains.affectionXp,
    dailyInteractions: state.dailyGains.interactions,
    dailyAffectionCap: config.dailyAffectionCap,
    affectionGainCooldownMs: config.affectionGainCooldownMs,
  }
}

export function normalizeSettings(raw: unknown): PetSettings {
  const candidate = raw && typeof raw === 'object' ? (raw as Partial<PetSettings>) : {}
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    alwaysOnTop: typeof candidate.alwaysOnTop === 'boolean' ? candidate.alwaysOnTop : true,
    interactionsPaused:
      typeof candidate.interactionsPaused === 'boolean' ? candidate.interactionsPaused : false,
    rendererMode:
      candidate.rendererMode === '3d' || candidate.rendererMode === '2d'
        ? candidate.rendererMode
        : '2d',
    rendererId: typeof candidate.rendererId === 'string' ? candidate.rendererId.slice(0, 64) : '',
    outfitRotationEnabled:
      typeof candidate.outfitRotationEnabled === 'boolean' ? candidate.outfitRotationEnabled : true,
    outfitRotationDays:
      typeof candidate.outfitRotationDays === 'number' &&
      candidate.outfitRotationDays >= 1 &&
      candidate.outfitRotationDays <= 30
        ? Math.round(candidate.outfitRotationDays)
        : 3,
    modelScale:
      typeof candidate.modelScale === 'number' && Number.isFinite(candidate.modelScale)
        ? Math.min(MODEL_SCALE_MAX, Math.max(MODEL_SCALE_MIN, candidate.modelScale))
        : 1,
    randomVoiceEnabled:
      typeof candidate.randomVoiceEnabled === 'boolean' ? candidate.randomVoiceEnabled : true,
    localTtsEnabled:
      typeof candidate.localTtsEnabled === 'boolean' ? candidate.localTtsEnabled : true,
    presenceMemoryEnabled:
      typeof candidate.presenceMemoryEnabled === 'boolean' ? candidate.presenceMemoryEnabled : true,
    presenceEmotionEnabled:
      typeof candidate.presenceEmotionEnabled === 'boolean'
        ? candidate.presenceEmotionEnabled
        : true,
    presenceAutonomyEnabled:
      typeof candidate.presenceAutonomyEnabled === 'boolean'
        ? candidate.presenceAutonomyEnabled
        : true,
    presenceIntensity:
      candidate.presenceIntensity === 'quiet' || candidate.presenceIntensity === 'lively'
        ? candidate.presenceIntensity
        : 'balanced',
    aiEnabled: typeof candidate.aiEnabled === 'boolean' ? candidate.aiEnabled : false,
    aiProactiveEnabled:
      typeof candidate.aiProactiveEnabled === 'boolean' ? candidate.aiProactiveEnabled : false,
    aiWindowTitleEnabled:
      typeof candidate.aiWindowTitleEnabled === 'boolean' ? candidate.aiWindowTitleEnabled : false,
    conversationMemoryEnabled:
      typeof candidate.conversationMemoryEnabled === 'boolean'
        ? candidate.conversationMemoryEnabled
        : true,
    // v11 起默认质量优先；旧存档一次性迁移到 quality，之后仍尊重用户选择。
    ttsQuality:
      (candidate.schemaVersion ?? 0) >= 11 &&
      (candidate.ttsQuality === 'quality' ||
        candidate.ttsQuality === 'balanced' ||
        candidate.ttsQuality === 'speed')
        ? candidate.ttsQuality
        : 'quality',
    ttsEngine: candidate.ttsEngine === 'aivis' ? 'aivis' : 'irodori',
    intelligenceLevel:
      candidate.intelligenceLevel === 'off' ||
      candidate.intelligenceLevel === 'basic' ||
      candidate.intelligenceLevel === 'adaptive'
        ? candidate.intelligenceLevel
        : 'basic',
    aiSelectedTextEnabled:
      typeof candidate.aiSelectedTextEnabled === 'boolean'
        ? candidate.aiSelectedTextEnabled
        : false,
    screenPerceptionEnabled:
      typeof candidate.screenPerceptionEnabled === 'boolean'
        ? candidate.screenPerceptionEnabled
        : false,
    screenPerceptionPaused:
      typeof candidate.screenPerceptionPaused === 'boolean'
        ? candidate.screenPerceptionPaused
        : false,
  }
}

export function defaultSettings(): AppSettings {
  return normalizeSettings(null)
}

/**
 * 按现有字段类型合并设置补丁。
 *
 * 这里不再维护第二份字段白名单：只要 AppSettings 增加字段，
 * 补丁就能直接生效，避免再次出现"界面显示已保存、实际被丢弃"的问题。
 */
export function applySettingsPatch(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  const next: Record<string, unknown> = { ...current }
  for (const key of Object.keys(current) as Array<keyof AppSettings>) {
    if (key === 'schemaVersion') {
      continue
    }
    const value = patch[key]
    if (value === undefined) {
      continue
    }
    if (typeof value === typeof current[key]) {
      next[key] = value
    }
  }
  return next as unknown as AppSettings
}

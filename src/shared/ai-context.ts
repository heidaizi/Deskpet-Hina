import type { SceneKind, TimePeriod } from './time-scene'
import type { PetAnimation } from './types'

export const AI_CONTEXT_MODES = ['task', 'selection'] as const
export type AiContextMode = (typeof AI_CONTEXT_MODES)[number]
export const MAX_AI_SELECTED_TEXT_CHARACTERS = 4_000

export const AI_EMOTIONS = [
  'neutral',
  'tired',
  'annoyed',
  'stern',
  'suspicious',
  'soft',
  'embarrassed',
  'reluctant',
  'warning',
  'deadpan',
  'calm',
] as const
export type AiEmotion = (typeof AI_EMOTIONS)[number]

export const AI_ACTIONS = [
  'idle',
  'look_at_cursor',
  'happy',
  'annoyed',
  'embarrassed',
  'surprised',
  'wave',
  'stretch',
  'sleep',
] as const satisfies readonly PetAnimation[]
export type AiAction = (typeof AI_ACTIONS)[number]

export const AI_PROACTIVE_INTENTS = [
  'gentle_reminder',
  'quiet_company',
  'notice',
  'light_tease',
  'concern',
] as const

export type AiProactiveIntent = (typeof AI_PROACTIVE_INTENTS)[number]

export interface AiContextInput {
  scene: SceneKind
  timePeriod: TimePeriod
  localTime: string
  isWeekend: boolean
  windowTitle?: string
  selectedText?: string
}

export interface AiContextPreview {
  id: string
  mode: AiContextMode
  createdAt: number
  expiresAt: number
  context: AiContextInput
  manualSelectionRequired: boolean
  selectedTextTruncated: boolean
  selectedTextCharacters: number
  windowTitleCharacters: number
}

export interface AiPetReply {
  reply_zh: string
  reply_ja: string
  emotion: AiEmotion
  action: AiAction
  confidence: number
}

export interface AiProactiveMemory {
  id: string
  summary: string
  tags: string[]
  importance: number
}

export interface AiProactiveContext {
  scene: SceneKind
  timePeriod: TimePeriod
  localTime: string
  isWeekend: boolean
  emotion: {
    dominant: string
    valence: number
    activation: number
    fatigue: number
    patience: number
    socialBattery: number
  } | null
  relationship: 'reserved' | 'familiar' | 'close'
  localTrigger: {
    ruleId: string
    reason: string
    tags: string[]
  }
  memories: AiProactiveMemory[]
}

export interface AiProactivePlan {
  should_speak: boolean
  intent: AiProactiveIntent
  reply_zh?: string
  reply_ja?: string
  emotion: AiEmotion
  action: AiAction
  memory_reference_ids: string[]
  confidence: number
}

export interface AiServiceStatus {
  enabled: boolean
  proactiveEnabled: boolean
  proactiveRequestsLastHour: number
  proactiveRequestLimit: number
  proactiveLastOutcome: string | null
  proactiveLastIntent: string | null
  keyConfigured: boolean
  encryptionAvailable: boolean
  accessibilityTrusted: boolean
  model: string
  lastError?: string
}

export interface AiSendResult {
  reply: AiPetReply
  elapsedMs: number
}

export function isAiContextMode(value: unknown): value is AiContextMode {
  return typeof value === 'string' && AI_CONTEXT_MODES.includes(value as AiContextMode)
}

export function isAiEmotion(value: unknown): value is AiEmotion {
  return typeof value === 'string' && AI_EMOTIONS.includes(value as AiEmotion)
}

export function isAiAction(value: unknown): value is AiAction {
  return typeof value === 'string' && AI_ACTIONS.includes(value as AiAction)
}

export function isAiProactiveIntent(value: unknown): value is AiProactiveIntent {
  return typeof value === 'string' && AI_PROACTIVE_INTENTS.includes(value as AiProactiveIntent)
}

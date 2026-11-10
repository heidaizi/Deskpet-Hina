import type { SceneKind, TimePeriod, TimeSceneContext } from './time-scene'
import type {
  DeliveryLifecycleEvent,
  InteractionKind,
  PerformanceLifecycleEvent,
  PerformanceState,
  PetAnimation,
  PetExpression,
  PresenceIntensity,
} from './types'

export type { DeliveryLifecycleEvent, PerformanceLifecycleEvent, PerformanceState } from './types'

export const PRESENCE_MODES = ['legacy', 'shadow', 'active'] as const

export type PresenceMode = (typeof PRESENCE_MODES)[number]

export type SpeechState = 'idle' | 'synthesizing' | 'speaking' | 'interrupted'

export const PRESENCE_TAGS = [
  'late_night',
  'rest',
  'focus',
  'return',
  'affection',
  'scene_comment',
] as const

export type PresenceTag = (typeof PRESENCE_TAGS)[number]

export interface ReturnEpisode {
  id: string
  awayStartedAt: number
  returnedAt: number
  awayMs: number
  reason: 'unlock' | 'wake' | 'system-idle' | 'restart'
  greeted: boolean
}

export interface PresenceDialogueHistoryEntry {
  at: number
  dialogueId: string
  textHash: string
  tags: PresenceTag[]
}

export interface PresenceSessionState {
  schemaVersion: 1
  sessionStartedAt: number
  lastSeenAt: number
  lastInteractionAt: number | null
  lastExternalScene: SceneKind | null
  lastTimePeriod: TimePeriod | null
  recentDialogues: PresenceDialogueHistoryEntry[]
  tagLastUsedAt: Partial<Record<PresenceTag, number>>
}

export const EMOTION_KINDS = [
  'calm',
  'content',
  'concerned',
  'embarrassed',
  'annoyed',
  'tired',
] as const

export type EmotionKind = (typeof EMOTION_KINDS)[number]

export interface EmotionCause {
  source: string
  delta: number
  label: string
  startedAt: number
  expiresAt?: number
}

export interface EmotionState {
  schemaVersion: 1
  valence: number
  activation: number
  fatigue: number
  patience: number
  socialBattery: number
  dominant: EmotionKind
  causes: EmotionCause[]
  updatedAt: number
}

export interface RelationshipProfile {
  closeness: 'reserved' | 'familiar' | 'close'
  negativeSensitivity: number
  patienceRecoveryMultiplier: number
  socialRecoveryMultiplier: number
}

export const EPISODIC_MEMORY_KINDS = [
  'late_night_work',
  'long_focus',
  'frequent_return',
  'relationship_milestone',
  'explicit_preference',
] as const

export type EpisodicMemoryKind = (typeof EPISODIC_MEMORY_KINDS)[number]

export interface EpisodicMemory {
  id: string
  kind: EpisodicMemoryKind
  dedupeKey: string
  summary: string
  tags: PresenceTag[]
  importance: number
  createdAt: number
  updatedAt: number
  lastReferencedAt: number | null
  expiresAt: number | null
  sourceEventIds: string[]
  evidenceCount: number
}

export interface EpisodicMemoryState {
  schemaVersion: 1
  memories: EpisodicMemory[]
}

export interface PresenceRuntimeState {
  visible: boolean
  dragging: boolean
  clickThrough: boolean
  interactionsPaused: boolean
  randomVoiceEnabled: boolean
  autonomyEnabled: boolean
  intensity: PresenceIntensity
  speechState: SpeechState
  performanceState: PerformanceState
  energy: number
  mood: number
  affectionLevel: number
  lastInteractionAt: number
}

export interface PresenceContextV1 {
  now: number
  scene: TimeSceneContext
  pet: {
    mood: number
    energy: number
    affectionLevel: number
  }
  runtime: {
    visible: boolean
    dragging: boolean
    clickThrough: boolean
    interactionsPaused: boolean
    randomVoiceEnabled: boolean
    autonomyEnabled: boolean
    intensity: PresenceIntensity
    speechState: SpeechState
    performanceState: PerformanceState
    lastInteractionAt: number
  }
  emotion?: EmotionState
  relationship?: RelationshipProfile
}

export interface PresenceCandidate {
  ruleId: string
  priority: number
  cooldownKey: string
  cooldownMs: number
  speech: 'none' | 'optional' | 'required'
  bodyPolicy: 'none' | 'overlay' | 'replace'
  canRunWhileSpeaking: boolean
  action?: PetAnimation
  modelClip?: string
  microMotion?: 'gaze' | 'breath' | 'hair' | 'gaze_breath'
  performanceId?: string
  expression?: PetExpression
  dialogue?: string
  voice?: string
  spokenText?: string
  ttsEmotion?: string
  ttsSeed?: number
  aiIntent?: string
  memoryReferenceIds?: string[]
  restRecovery?: boolean
  reason: string
  tags: PresenceTag[]
}

export type PresenceDecision =
  | {
      kind: 'silent'
      reason: string
      selectedAt: number
      eventEpoch: number
    }
  | {
      kind: 'perform'
      candidate: PresenceCandidate
      eventEpoch: number
      selectedAt: number
      score: number
    }

export interface PresenceDiagnostics {
  mode: PresenceMode
  memoryEnabled: boolean
  emotionEnabled: boolean
  emotionDominant: EmotionKind | null
  emotionValence: number | null
  emotionActivation: number | null
  emotionFatigue: number | null
  emotionPatience: number | null
  emotionSocialBattery: number | null
  speechState: SpeechState
  performanceState: PerformanceState
  activePerformanceToken: string | null
  lastPerformanceEvent: PerformanceLifecycleEvent['type'] | null
  activeDeliveryId: string | null
  lastEventType: string | null
  lastRuleId: string | null
  lastPerformedRuleId: string | null
  lastDecision: PresenceDecision['kind'] | null
  lastDecisionReason: string | null
  lastDecisionAt: number | null
  lastPerformedAt: number | null
  decisionCount: number
  deliveredCount: number
  speechCountLastHour: number
  lastReturnAwayMs: number | null
  recentDialogueCount: number
  memoryCount: number
  proactiveAiRequestsLastHour: number
  proactiveAiRequestLimit: number
  lastProactiveAiOutcome: string | null
  lastProactiveAiIntent: string | null
}

export type PresenceEvent =
  | {
      id: string
      at: number
      epoch: number
      source: 'main'
      type: 'scene_changed'
      payload: { scene: TimeSceneContext['scene'] }
    }
  | {
      id: string
      at: number
      epoch: number
      source: 'main'
      type: 'user_interaction'
      payload: { kind: InteractionKind; area: string }
    }
  | {
      id: string
      at: number
      epoch: number
      source: 'renderer'
      type: 'delivery_lifecycle'
      payload: DeliveryLifecycleEvent
    }
  | {
      id: string
      at: number
      epoch: number
      source: 'main'
      type: 'return_episode'
      payload: ReturnEpisode
    }
  | {
      id: string
      at: number
      epoch: number
      source: 'scene'
      type: 'periodic_tick'
      payload: { timePeriod: TimePeriod }
    }

export function parsePresenceMode(value: unknown): PresenceMode {
  if (value === undefined || value === null || value === '') {
    return 'active'
  }
  return value === 'legacy' || value === 'active' || value === 'shadow' ? value : 'shadow'
}

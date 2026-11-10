import type {
  AppSettings,
  CharacterInfo,
  InteractionKind,
  PetAnimation,
  PetExpression,
} from '../../shared/types'

export type ConditionOperator = '>=' | '>' | '<=' | '<' | '==' | '!='
export type BehaviorTrigger = InteractionKind | '*'

export interface RuleCondition {
  field: string
  op: ConditionOperator
  value: string | number | boolean
}

export interface RuleEffect {
  field: 'affectionXp' | 'mood' | 'energy'
  delta?: number
  set?: number
  min?: number
  max?: number
}

export interface ActionRule {
  id: string
  trigger: BehaviorTrigger
  area: string
  priority: number
  weight?: number
  cooldownMs: number
  fallback?: boolean
  conditions: RuleCondition[]
  effects: RuleEffect[]
  animation: PetAnimation
  expression: PetExpression
  dialoguePool: string
}

export interface ActionsConfig {
  schemaVersion: number
  rules: ActionRule[]
}

export interface DialogueEntry {
  id: string
  text: string
  weight?: number
  conditions?: RuleCondition[]
  source?: {
    page: string
    clip: string
    japanese: string
    translation: 'official-cn' | 'project-cn'
  }
}

export interface DialoguePool {
  entries: DialogueEntry[]
}

export interface DialoguesConfig {
  schemaVersion: number
  pools: Record<string, DialoguePool>
}

export interface AffectionLevel {
  level: number
  minXp: number
  title: string
  unlocks: string[]
}

export interface AffectionConfig {
  schemaVersion: number
  starting: {
    affectionXp: number
    mood: number
    energy: number
  }
  dailyAffectionCap: number
  affectionGainCooldownMs: number
  dailyRecovery: {
    mood: number
    energy: number
  }
  idleRecovery: {
    mood: number
    energy: number
    intervalMs: number
  }
  levels: AffectionLevel[]
}

export interface BehaviorBundle {
  character: CharacterConfig
  actions: ActionsConfig
  dialogues: DialoguesConfig
  affection: AffectionConfig
}

export interface CharacterConfig extends CharacterInfo {
  schemaVersion: number
}

export interface PetState {
  schemaVersion: number
  affectionXp: number
  affectionLevel: number
  mood: number
  energy: number
  lastInteractionAt: number | null
  dailyGains: {
    date: string
    affectionXp: number
    interactions: number
  }
  cooldowns: Record<string, number>
  flags: Record<string, string | number | boolean>
  dialogueHistory: string[]
}

export type PetSettings = AppSettings

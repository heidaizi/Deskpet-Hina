import type {
  AppSettings,
  AppliedEffect,
  InteractionResult,
  PetInteraction,
  SettingsSnapshot,
} from '../../shared/types'
import type { PetStateView } from '../../shared/types'
import { isPetAnimation, isPetExpression } from '../../shared/types'
import { MODEL_SCALE_MAX, MODEL_SCALE_MIN } from '../../shared/model-animations'
import type { TimeSceneContext } from '../../shared/time-scene'
import { BehaviorEngine, applyEffect } from './behavior-engine'
import { DialogueService } from './dialogue-service'
import {
  applySettingsPatch,
  clamp,
  formatLocalDateKey,
  refreshDailyState,
  roundToOne,
  toPetStateView,
} from './pet-state'
import type { PetStateStore, SettingsStore } from './persistent-stores'
import type { BehaviorBundle, PetSettings } from './types'

const SAVE_DEBOUNCE_MS = 300
const LAST_IDLE_REST_AT = 'lastIdleRestAt'

interface PetControllerOptions {
  version: string
  onStateChanged?: (snapshot: SettingsSnapshot) => void
  getTimeSceneContext?: () => TimeSceneContext
  now?: () => number
  random?: () => number
}

export class PetController {
  private state
  private settings
  private saveTimer: NodeJS.Timeout | null = null
  private revision = 0

  constructor(
    private readonly bundle: BehaviorBundle,
    private readonly stateStore: PetStateStore,
    private readonly settingsStore: SettingsStore,
    private readonly engine: BehaviorEngine,
    private readonly dialogueService: DialogueService,
    private readonly options: PetControllerOptions,
  ) {
    this.state = this.stateStore.load()
    this.settings = this.settingsStore.load()
  }

  getSettings(): PetSettings {
    return structuredClone(this.settings)
  }

  getSettingsSnapshot(): SettingsSnapshot {
    const now = this.options.now?.() ?? Date.now()
    const dateKey = formatLocalDateKey(new Date(now))
    if (this.state.dailyGains.date !== dateKey) {
      this.state = refreshDailyState(this.state, dateKey, this.bundle.affection.dailyRecovery)
      this.scheduleSave()
    }
    return {
      revision: this.revision,
      version: this.options.version,
      state: toPetStateView(this.state, this.bundle.affection),
      settings: structuredClone(this.settings),
      contentRuleCount: this.bundle.actions.rules.length,
      character: {
        id: this.bundle.character.id,
        displayName: this.bundle.character.displayName,
        renderers: structuredClone(this.bundle.character.renderers),
      },
    }
  }

  interact(interaction: PetInteraction): InteractionResult {
    const now = this.options.now?.() ?? Date.now()
    const timeScene = this.options.getTimeSceneContext?.()

    if (this.settings.interactionsPaused) {
      const dialogue = this.dialogueService.select('paused', this.state, timeScene)
      this.state = dialogue.state
      this.revision += 1
      this.scheduleSave()
      this.emitStateChanged()
      return {
        ruleId: 'paused',
        animation: 'annoyed',
        expression: 'annoyed',
        dialogue: dialogue.dialogue,
        voice: dialogue.voice,
        state: toPetStateView(this.state, this.bundle.affection),
        appliedEffects: [],
      }
    }

    const dateKey = formatLocalDateKey(new Date(now))
    const evaluation = this.engine.evaluate(interaction, this.state, now, dateKey, timeScene)
    const dialogue = this.dialogueService.select(
      evaluation.rule.dialoguePool,
      evaluation.state,
      timeScene,
    )
    this.state = dialogue.state
    this.revision += 1
    this.scheduleSave()
    this.emitStateChanged()
    return {
      ruleId: evaluation.rule.id,
      animation: isPetAnimation(evaluation.rule.animation) ? evaluation.rule.animation : 'idle',
      expression: isPetExpression(evaluation.rule.expression)
        ? evaluation.rule.expression
        : 'neutral',
      dialogue: dialogue.dialogue,
      voice: dialogue.voice,
      state: toPetStateView(this.state, this.bundle.affection),
      appliedEffects: evaluation.appliedEffects as AppliedEffect[],
    }
  }

  /** 对话带来的好感与心情变化；受每日上限与冷却限制。 */
  noteChat(sentiment: 'positive' | 'neutral' | 'negative'): {
    affectionDelta: number
    moodDelta: number
  } {
    const now = this.options.now?.() ?? Date.now()
    if (this.settings.interactionsPaused) {
      return { affectionDelta: 0, moodDelta: 0 }
    }
    const applied: AppliedEffect[] = []
    applyEffect(
      this.state,
      { field: 'affectionXp', delta: sentiment === 'positive' ? 2 : 1 },
      this.bundle.affection,
      now,
      applied,
    )
    applyEffect(
      this.state,
      { field: 'mood', delta: sentiment === 'positive' ? 3 : sentiment === 'negative' ? -2 : 1 },
      this.bundle.affection,
      now,
      applied,
    )
    if (applied.length > 0) {
      this.revision += 1
      this.scheduleSave()
      this.emitStateChanged()
    }
    const deltaOf = (field: AppliedEffect['field']): number =>
      applied
        .filter((effect) => effect.field === field)
        .reduce((sum, effect) => sum + effect.delta, 0)
    return { affectionDelta: deltaOf('affectionXp'), moodDelta: deltaOf('mood') }
  }

  getStateView(): PetStateView {
    return toPetStateView(this.state, this.bundle.affection)
  }

  updateSettings(patch: Partial<AppSettings>): SettingsSnapshot {
    this.settings = applySettingsPatch(this.settings, patch)
    this.settingsStore.save(this.settings)
    this.revision += 1
    this.emitStateChanged()
    return this.getSettingsSnapshot()
  }

  resetState(): SettingsSnapshot {
    this.flush()
    this.state = this.stateStore.reset(this.options.now ? new Date(this.options.now()) : new Date())
    this.revision += 1
    this.emitStateChanged()
    return this.getSettingsSnapshot()
  }

  recoverFromRest(now = this.options.now?.() ?? Date.now()): {
    energy: number
    mood: number
  } {
    const recovery = this.bundle.affection.idleRecovery
    const lastRestAt = this.state.flags[LAST_IDLE_REST_AT]
    if (
      typeof lastRestAt === 'number' &&
      Number.isFinite(lastRestAt) &&
      now - lastRestAt < recovery.intervalMs
    ) {
      return { energy: 0, mood: 0 }
    }
    if (this.state.energy >= 100 && this.state.mood >= 100) {
      return { energy: 0, mood: 0 }
    }

    const nextEnergy = roundToOne(clamp(this.state.energy + recovery.energy, 0, 100))
    const nextMood = roundToOne(clamp(this.state.mood + recovery.mood, 0, 100))
    const energyDelta = roundToOne(nextEnergy - this.state.energy)
    const moodDelta = roundToOne(nextMood - this.state.mood)
    this.state = {
      ...this.state,
      energy: nextEnergy,
      mood: nextMood,
      flags: {
        ...this.state.flags,
        [LAST_IDLE_REST_AT]: now,
      },
    }
    this.revision += 1
    this.scheduleSave()
    this.emitStateChanged()
    return { energy: energyDelta, mood: moodDelta }
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.stateStore.save(this.state)
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.stateStore.save(this.state)
    }, SAVE_DEBOUNCE_MS)
  }

  private emitStateChanged(): void {
    this.options.onStateChanged?.(this.getSettingsSnapshot())
  }
}

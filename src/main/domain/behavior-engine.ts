import type {
  AppliedEffect,
  InteractionKind,
  PetAnimation,
  PetExpression,
} from '../../shared/types'
import type { TimeSceneContext } from '../../shared/time-scene'
import { matchesConditions } from './conditions'
import { clamp, getAffectionLevel, refreshDailyState, roundToOne } from './pet-state'
import type { ActionRule, BehaviorBundle, BehaviorTrigger, PetState, RuleEffect } from './types'

const AFFECTION_GAIN_COOLDOWN_KEY = 'affection-gain'

export interface BehaviorEvaluation {
  state: PetState
  rule: ActionRule
  appliedEffects: AppliedEffect[]
}

export interface BehaviorInput {
  kind: InteractionKind
  area: string
}

interface WeightedItem<T> {
  item: T
  weight: number
}

function chooseWeighted<T>(items: readonly WeightedItem<T>[], random: () => number): T | null {
  if (items.length === 0) {
    return null
  }

  const totalWeight = items.reduce((total, item) => total + Math.max(0, item.weight), 0)
  if (totalWeight <= 0) {
    return items[0]?.item ?? null
  }

  let threshold = random() * totalWeight
  for (const item of items) {
    threshold -= Math.max(0, item.weight)
    if (threshold <= 0) {
      return item.item
    }
  }
  return items.at(-1)?.item ?? null
}

function areaMatches(ruleArea: string, interactionArea: string): boolean {
  if (ruleArea === '*') {
    return true
  }
  if (ruleArea.endsWith('*')) {
    return interactionArea.startsWith(ruleArea.slice(0, -1))
  }
  return ruleArea === interactionArea
}

function isCooldownReady(rule: ActionRule, state: PetState, now: number): boolean {
  const lastTriggeredAt = state.cooldowns[rule.id]
  return lastTriggeredAt === undefined || now - lastTriggeredAt >= rule.cooldownMs
}

function ruleMatches(
  rule: ActionRule,
  input: BehaviorInput,
  state: PetState,
  now: number,
  timeScene?: TimeSceneContext,
): boolean {
  return (
    !rule.fallback &&
    (rule.trigger === '*' || rule.trigger === input.kind) &&
    areaMatches(rule.area, input.area) &&
    matchesConditions(state, rule.conditions, { timeScene }) &&
    isCooldownReady(rule, state, now)
  )
}

function chooseHighestPriority(
  rules: readonly ActionRule[],
  random: () => number,
): ActionRule | null {
  if (rules.length === 0) {
    return null
  }
  const highestPriority = Math.max(...rules.map((rule) => rule.priority))
  return chooseWeighted(
    rules
      .filter((rule) => rule.priority === highestPriority)
      .map((rule) => ({ item: rule, weight: rule.weight ?? 1 })),
    random,
  )
}

function fallbackRule(
  bundle: BehaviorBundle,
  input: BehaviorInput,
  state: PetState,
  timeScene?: TimeSceneContext,
): ActionRule {
  const candidates = bundle.actions.rules.filter(
    (rule) =>
      rule.fallback &&
      (rule.trigger === '*' || rule.trigger === input.kind) &&
      areaMatches(rule.area, input.area) &&
      matchesConditions(state, rule.conditions, { timeScene }),
  )
  return (
    candidates[0] ?? {
      id: 'hard-fallback',
      trigger: '*' as BehaviorTrigger,
      area: '*',
      priority: 0,
      weight: 1,
      cooldownMs: 0,
      fallback: true,
      conditions: [],
      effects: [],
      animation: 'annoyed' as PetAnimation,
      expression: 'annoyed' as PetExpression,
      dialoguePool: 'cooldown',
    }
  )
}

export function applyEffect(
  state: PetState,
  effect: RuleEffect,
  affection: BehaviorBundle['affection'],
  now: number,
  appliedEffects: AppliedEffect[],
): void {
  const current = state[effect.field]
  let next = effect.set ?? current + (effect.delta ?? 0)

  if (typeof effect.min === 'number') {
    next = Math.max(effect.min, next)
  }
  if (typeof effect.max === 'number') {
    next = Math.min(effect.max, next)
  }

  if (effect.field === 'affectionXp') {
    next = Math.max(0, next)
    const requestedDelta = next - current
    if (requestedDelta > 0) {
      const lastGainAt = state.cooldowns[AFFECTION_GAIN_COOLDOWN_KEY]
      if (lastGainAt !== undefined && now - lastGainAt < affection.affectionGainCooldownMs) {
        next = current
      } else {
        const remainingDaily = Math.max(
          0,
          affection.dailyAffectionCap - state.dailyGains.affectionXp,
        )
        const allowedDelta = Math.min(requestedDelta, remainingDaily)
        next = current + allowedDelta
        state.dailyGains.affectionXp = roundToOne(state.dailyGains.affectionXp + allowedDelta)
        if (allowedDelta > 0) {
          state.cooldowns[AFFECTION_GAIN_COOLDOWN_KEY] = now
        }
      }
    }
  } else {
    next = clamp(next, 0, 100)
  }

  next = roundToOne(next)
  const actualDelta = roundToOne(next - current)
  state[effect.field] = next
  if (actualDelta !== 0) {
    appliedEffects.push({ field: effect.field, delta: actualDelta })
  }
}

function applyRule(
  state: PetState,
  rule: ActionRule,
  bundle: BehaviorBundle,
  now: number,
): { state: PetState; appliedEffects: AppliedEffect[] } {
  const next = structuredClone(state)
  const appliedEffects: AppliedEffect[] = []
  next.lastInteractionAt = now
  next.dailyGains.interactions += 1

  for (const effect of rule.effects) {
    applyEffect(next, effect, bundle.affection, now, appliedEffects)
  }

  next.affectionLevel = getAffectionLevel(next.affectionXp, bundle.affection.levels).level
  next.cooldowns[rule.id] = now
  return { state: next, appliedEffects }
}

export class BehaviorEngine {
  constructor(
    private readonly bundle: BehaviorBundle,
    private readonly random: () => number = Math.random,
  ) {}

  evaluate(
    input: BehaviorInput,
    state: PetState,
    now: number,
    dateKey: string,
    timeScene?: TimeSceneContext,
  ): BehaviorEvaluation {
    const currentState = refreshDailyState(state, dateKey, this.bundle.affection.dailyRecovery)
    const matchingRules = this.bundle.actions.rules.filter((rule) =>
      ruleMatches(rule, input, currentState, now, timeScene),
    )
    const rule =
      chooseHighestPriority(matchingRules, this.random) ??
      fallbackRule(this.bundle, input, currentState, timeScene)
    const result = applyRule(currentState, rule, this.bundle, now)
    return {
      state: result.state,
      rule,
      appliedEffects: result.appliedEffects,
    }
  }
}

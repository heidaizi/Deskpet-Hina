import type { TimeSceneContext } from '../../shared/time-scene'
import type { PetState, RuleCondition } from './types'

export interface ConditionContext {
  timeScene?: TimeSceneContext
}

export function getStateField(
  state: PetState,
  field: string,
  context: ConditionContext = {},
): unknown {
  if (field.startsWith('flags.')) {
    return state.flags[field.slice('flags.'.length)]
  }
  const timeScene = context.timeScene
  if (field.startsWith('time.') || field.startsWith('calendar.')) {
    if (!timeScene) {
      return undefined
    }
    switch (field) {
      case 'time.hour':
        return Number(timeScene.localTime.slice(0, 2))
      case 'time.minute':
        return Number(timeScene.localTime.slice(3, 5))
      case 'time.period':
        return timeScene.timePeriod
      case 'calendar.weekday':
        return timeScene.weekday
      case 'calendar.isWeekend':
        return timeScene.isWeekend
      default:
        return undefined
    }
  }
  if (field.startsWith('scene.')) {
    if (!timeScene) {
      return undefined
    }
    switch (field) {
      case 'scene.kind':
        return timeScene.scene
      case 'scene.app':
        return timeScene.foregroundApp
      default:
        return undefined
    }
  }
  if (field.startsWith('system.')) {
    if (!timeScene) {
      return undefined
    }
    switch (field) {
      case 'system.idleSeconds':
        return timeScene.systemIdleSeconds
      case 'system.onBattery':
        return timeScene.onBatteryPower
      case 'system.screenLocked':
        return timeScene.screenLocked
      case 'system.suspended':
        return timeScene.suspended
      default:
        return undefined
    }
  }

  switch (field) {
    case 'affectionXp':
      return state.affectionXp
    case 'affectionLevel':
      return state.affectionLevel
    case 'mood':
      return state.mood
    case 'energy':
      return state.energy
    case 'lastInteractionAt':
      return state.lastInteractionAt
    case 'dailyAffectionXp':
      return state.dailyGains.affectionXp
    case 'dailyInteractions':
      return state.dailyGains.interactions
    default:
      return undefined
  }
}

export function matchesCondition(
  state: PetState,
  condition: RuleCondition,
  context: ConditionContext = {},
): boolean {
  const actual = getStateField(state, condition.field, context)

  if (actual === undefined || actual === null) {
    return false
  }

  switch (condition.op) {
    case '>=':
      return typeof actual === 'number' && typeof condition.value === 'number'
        ? actual >= condition.value
        : false
    case '>':
      return typeof actual === 'number' && typeof condition.value === 'number'
        ? actual > condition.value
        : false
    case '<=':
      return typeof actual === 'number' && typeof condition.value === 'number'
        ? actual <= condition.value
        : false
    case '<':
      return typeof actual === 'number' && typeof condition.value === 'number'
        ? actual < condition.value
        : false
    case '==':
      return actual === condition.value
    case '!=':
      return actual !== condition.value
    default:
      return false
  }
}

export function matchesConditions(
  state: PetState,
  conditions: readonly RuleCondition[] | undefined,
  context: ConditionContext = {},
): boolean {
  return (conditions ?? []).every((condition) => matchesCondition(state, condition, context))
}

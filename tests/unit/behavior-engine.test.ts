import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BehaviorEngine } from '../../src/main/domain/behavior-engine'
import { loadContent } from '../../src/main/domain/content-loader'
import { DialogueService } from '../../src/main/domain/dialogue-service'
import { createDefaultPetState, formatLocalDateKey } from '../../src/main/domain/pet-state'
import type { PetState } from '../../src/main/domain/types'
import { createTimeSceneContext } from '../../src/shared/time-scene'

const bundle = loadContent(join(process.cwd(), 'content'))
const dateKey = formatLocalDateKey(new Date('2026-10-22T12:00:00+08:00'))

function createState(overrides: Partial<PetState> = {}): PetState {
  return {
    ...createDefaultPetState(bundle.affection, dateKey),
    ...overrides,
  }
}

describe('behavior engine', () => {
  it('applies the matching head rule and records affection', () => {
    const engine = new BehaviorEngine(bundle, () => 0)
    const result = engine.evaluate({ kind: 'tap', area: 'head' }, createState(), 1_000, dateKey)

    expect(result.rule.id).toBe('tap_head')
    expect(result.state.affectionXp).toBe(1)
    expect(result.state.mood).toBe(64)
    expect(result.state.dailyGains.interactions).toBe(1)
    expect(result.appliedEffects).toEqual([
      { field: 'affectionXp', delta: 1 },
      { field: 'mood', delta: 2 },
    ])
  })

  it('uses fallback with no affection while the same rule is cooling down', () => {
    const engine = new BehaviorEngine(bundle, () => 0)
    const first = engine.evaluate({ kind: 'tap', area: 'head' }, createState(), 1_000, dateKey)
    const second = engine.evaluate({ kind: 'tap', area: 'head' }, first.state, 2_000, dateKey)

    expect(second.rule.id).toBe('cooldown_fallback')
    expect(second.state.affectionXp).toBe(first.state.affectionXp)
    expect(second.state.dailyGains.interactions).toBe(2)
  })

  it('caps daily affection gains at the configured limit', () => {
    const engine = new BehaviorEngine(bundle, () => 0)
    const state = createState({
      dailyGains: {
        date: dateKey,
        affectionXp: 11.5,
        interactions: 5,
      },
    })
    const result = engine.evaluate({ kind: 'tap', area: 'head' }, state, 1_000, dateKey)

    expect(result.state.affectionXp).toBe(0.5)
    expect(result.state.dailyGains.affectionXp).toBe(12)
  })

  it('selects trusted headpat dialogue at level three', () => {
    const engine = new BehaviorEngine(bundle, () => 0)
    const state = createState({
      affectionXp: 32,
      affectionLevel: 3,
    })
    const result = engine.evaluate({ kind: 'hold', area: 'head' }, state, 1_000, dateKey)

    expect(result.rule.id).toBe('headpat_trusted')
    expect(result.rule.dialoguePool).toBe('headpat_trusted')
  })

  it('selects affectionate headpat dialogue at level four', () => {
    const engine = new BehaviorEngine(bundle, () => 0)
    const state = createState({
      affectionXp: 64,
      affectionLevel: 4,
    })
    const result = engine.evaluate({ kind: 'hold', area: 'head' }, state, 1_000, dateKey)

    expect(result.rule.id).toBe('headpat_friendly')
    expect(result.rule.dialoguePool).toBe('headpat_friendly')
  })

  it('limits rapid affection gains while still applying mood effects', () => {
    const engine = new BehaviorEngine(bundle, () => 0)
    const first = engine.evaluate({ kind: 'tap', area: 'head' }, createState(), 1_000, dateKey)
    const rapidPat = engine.evaluate({ kind: 'hold', area: 'head' }, first.state, 5_000, dateKey)

    expect(rapidPat.rule.id).toBe('headpat_basic')
    expect(rapidPat.state.affectionXp).toBe(first.state.affectionXp)
    expect(rapidPat.state.mood).toBeGreaterThan(first.state.mood)
  })

  it('unlocks trusted body and close head interactions at higher levels', () => {
    const engine = new BehaviorEngine(bundle, () => 0)
    const body = engine.evaluate(
      { kind: 'tap', area: 'body' },
      createState({ affectionXp: 104, affectionLevel: 5 }),
      1_000,
      dateKey,
    )
    const head = engine.evaluate(
      { kind: 'tap', area: 'head' },
      createState({ affectionXp: 152, affectionLevel: 6 }),
      1_000,
      dateKey,
    )

    expect(body.rule.id).toBe('tap_body_trusted')
    expect(body.rule.dialoguePool).toBe('body_trusted')
    expect(head.rule.id).toBe('tap_head_close')
    expect(head.rule.dialoguePool).toBe('head_close')
  })

  it('matches horn wildcard areas and applies a negative mood effect', () => {
    const engine = new BehaviorEngine(bundle, () => 0)
    const result = engine.evaluate(
      { kind: 'tap', area: 'horn-left' },
      createState(),
      1_000,
      dateKey,
    )

    expect(result.rule.id).toBe('tap_horn')
    expect(result.state.mood).toBe(60)
  })

  it('allows a new JSON rule to override an existing area without renderer changes', () => {
    const customBundle = structuredClone(bundle)
    customBundle.actions.rules.push({
      id: 'custom_body_response',
      trigger: 'tap',
      area: 'body',
      priority: 99,
      weight: 1,
      cooldownMs: 0,
      conditions: [],
      effects: [{ field: 'mood', delta: 4 }],
      animation: 'tap_body',
      expression: 'surprised',
      dialoguePool: 'body',
    })

    const engine = new BehaviorEngine(customBundle, () => 0)
    const result = engine.evaluate({ kind: 'tap', area: 'body' }, createState(), 1_000, dateKey)

    expect(result.rule.id).toBe('custom_body_response')
    expect(result.state.mood).toBe(66)
  })

  it('evaluates time and foreground-scene conditions from live context', () => {
    const customBundle = structuredClone(bundle)
    customBundle.actions.rules.push({
      id: 'late_night_browser_head',
      trigger: 'tap',
      area: 'head',
      priority: 99,
      weight: 1,
      cooldownMs: 0,
      conditions: [
        { field: 'time.period', op: '==', value: 'late_night' },
        { field: 'scene.kind', op: '==', value: 'browser' },
        { field: 'system.idleSeconds', op: '>=', value: 30 },
      ],
      effects: [],
      animation: 'tap_head',
      expression: 'neutral',
      dialoguePool: 'head',
    })

    const context = createTimeSceneContext(new Date(2026, 9, 24, 2, 15), 'Google Chrome', 45, {
      onBatteryPower: false,
      screenLocked: false,
      suspended: false,
    })
    const engine = new BehaviorEngine(customBundle, () => 0)
    const result = engine.evaluate(
      { kind: 'tap', area: 'head' },
      createState(),
      1_000,
      dateKey,
      context,
    )

    expect(result.rule.id).toBe('late_night_browser_head')
  })
})

describe('dialogue service', () => {
  it('keeps provenance for official dialogue entries', () => {
    const sourced = Object.values(bundle.dialogues.pools)
      .flatMap((pool) => pool.entries)
      .filter((entry) => entry.source)

    expect(sourced.length).toBeGreaterThanOrEqual(12)
    for (const entry of sourced) {
      expect(entry.source?.page).toMatch(/^https:\/\//)
      expect(entry.source?.clip).not.toBe('')
      expect(entry.source?.japanese).not.toBe('')
      expect(['official-cn', 'project-cn']).toContain(entry.source?.translation)
    }
  })

  it('avoids the two most recently used lines when alternatives exist', () => {
    const service = new DialogueService(bundle, () => 0)
    const state = createState({
      dialogueHistory: ['head-1', 'head-2'],
    })
    const result = service.select('head', state)

    expect(result.dialogueId).toBe('head-3')
    expect(result.state.dialogueHistory.at(-1)).toBe('head-3')
  })
})

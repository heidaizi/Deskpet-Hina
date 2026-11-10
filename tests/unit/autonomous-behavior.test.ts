import { describe, expect, it } from 'vitest'
import { chooseAutonomousAction, type AutonomousContext } from '../../src/main/autonomous-behavior'

function context(overrides: Partial<AutonomousContext> = {}): AutonomousContext {
  return {
    now: 100_000,
    lastInteractionAt: 0,
    energy: 70,
    mood: 60,
    visible: true,
    dragging: false,
    clickThrough: false,
    timePeriod: 'afternoon',
    scene: 'other',
    systemIdleSeconds: 0,
    ...overrides,
  }
}

function sequence(...values: number[]): () => number {
  let index = 0
  return () => values[index++] ?? values.at(-1) ?? 0
}

describe('autonomous behavior', () => {
  it('selects walk for a calm idle pet', () => {
    expect(chooseAutonomousAction(context(), () => 0.1)).toBe('walk')
  })

  it('selects sleep when energy is critically low', () => {
    expect(chooseAutonomousAction(context({ energy: 8 }), () => 0.99)).toBe('sleep')
  })

  it('does not act while dragging or fully transparent to the mouse', () => {
    expect(chooseAutonomousAction(context({ dragging: true }), () => 0.1)).toBeNull()
    expect(chooseAutonomousAction(context({ clickThrough: true }), () => 0.1)).toBeNull()
  })

  it('prefers quiet observation when mood is low', () => {
    expect(chooseAutonomousAction(context({ mood: 10 }), () => 0.2)).toBe('look_at_cursor')
  })

  it('keeps focus and development scenes quiet', () => {
    expect(chooseAutonomousAction(context({ scene: 'focus' }), sequence(0.3, 0.5))).toBe(
      'look_at_cursor',
    )
    expect(chooseAutonomousAction(context({ scene: 'development' }), sequence(0.9, 0.1))).toBe(
      'look_at_cursor',
    )
  })

  it('prefers rest at night and after long system idle periods', () => {
    expect(
      chooseAutonomousAction(
        context({ timePeriod: 'night', energy: 60, lastInteractionAt: 20_000 }),
        () => 0.2,
      ),
    ).toBe('sleep')
    expect(chooseAutonomousAction(context({ systemIdleSeconds: 420, energy: 50 }), () => 0.1)).toBe(
      'sleep',
    )
  })
})

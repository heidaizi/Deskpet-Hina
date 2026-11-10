import { describe, expect, it } from 'vitest'
import { PET_ANIMATIONS, type PetAnimation } from '../../src/shared/types'
import {
  ACTION_FALLBACKS,
  normalizeRendererAction,
  normalizeRendererExpression,
  resolveSupportedAction,
} from '../../src/renderer/src/renderers/action-map'

describe('renderer action mapping', () => {
  it('defines a fallback for every unified action ID', () => {
    for (const action of PET_ANIMATIONS) {
      expect(ACTION_FALLBACKS[action]).toBeTypeOf('string')
    }
  })

  it('normalizes unknown content values to safe defaults', () => {
    expect(normalizeRendererAction('unknown-action')).toBe('idle')
    expect(normalizeRendererExpression('unknown-expression')).toBe('neutral')
  })

  it('falls back when a renderer does not support an action', () => {
    const supported = new Set<PetAnimation>(['idle', 'happy'])
    expect(resolveSupportedAction('feed', supported)).toBe('happy')
    expect(resolveSupportedAction('walk', supported)).toBe('idle')
  })
})

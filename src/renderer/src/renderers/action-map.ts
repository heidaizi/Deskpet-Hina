import {
  PET_ANIMATIONS,
  isPetAnimation,
  isPetExpression,
  type PetAnimation,
  type PetExpression,
} from '@shared/types'

export const ACTION_FALLBACKS: Record<PetAnimation, PetAnimation> = {
  idle: 'idle',
  look_at_cursor: 'idle',
  walk: 'idle',
  sleep: 'idle',
  wake: 'surprised',
  tap_head: 'embarrassed',
  tap_horn: 'annoyed',
  tap_halo: 'annoyed',
  tap_body: 'surprised',
  headpat: 'happy',
  drag_start: 'surprised',
  drag_loop: 'annoyed',
  drag_end: 'idle',
  happy: 'idle',
  annoyed: 'idle',
  embarrassed: 'idle',
  surprised: 'idle',
  feed: 'happy',
  wave: 'idle',
  stretch: 'idle',
}

export function normalizeRendererAction(value: unknown): PetAnimation {
  return isPetAnimation(value) ? value : 'idle'
}

export function normalizeRendererExpression(value: unknown): PetExpression {
  return isPetExpression(value) ? value : 'neutral'
}

export function resolveSupportedAction(
  requested: PetAnimation,
  supported: ReadonlySet<PetAnimation>,
): PetAnimation {
  if (supported.has(requested)) {
    return requested
  }
  const fallback = ACTION_FALLBACKS[requested] ?? 'idle'
  return supported.has(fallback) ? fallback : 'idle'
}

export const ALL_PET_ANIMATIONS = PET_ANIMATIONS

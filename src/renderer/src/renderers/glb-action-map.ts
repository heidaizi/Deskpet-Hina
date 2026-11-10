import type { PetAnimation } from '@shared/types'

export interface GLBAnimationBinding {
  clip: string
  loop: boolean
  speed?: number
}

export const GLB_ANIMATION_MAP: Record<PetAnimation, GLBAnimationBinding> = {
  idle: { clip: 'Cafe_Idle', loop: true },
  look_at_cursor: { clip: 'Cafe_Idle', loop: true, speed: 0.9 },
  walk: { clip: 'Cafe_Walk', loop: true },
  sleep: { clip: 'Cafe_Idle', loop: true, speed: 0.22 },
  wake: { clip: 'Cafe_Reaction', loop: false },
  tap_head: { clip: 'Cafe_Reaction', loop: false },
  tap_horn: { clip: 'Cafe_Reaction', loop: false },
  tap_halo: { clip: 'Cafe_Reaction', loop: false },
  tap_body: { clip: 'Cafe_Reaction', loop: false },
  headpat: { clip: 'Cafe_Reaction', loop: false },
  drag_start: { clip: 'Formation_Pickup', loop: true },
  drag_loop: { clip: 'Cafe_Idle', loop: true, speed: 0.7 },
  drag_end: { clip: 'Cafe_Idle', loop: true },
  happy: { clip: 'Public01', loop: false },
  annoyed: { clip: 'Cafe_Reaction', loop: false },
  embarrassed: { clip: 'Cafe_Reaction', loop: false },
  surprised: { clip: 'Vital_Panic', loop: false },
  feed: { clip: 'Formation_Pickup', loop: false },
  wave: { clip: 'Normal_Callsign', loop: false },
  stretch: { clip: 'Normal_Reload', loop: false },
}

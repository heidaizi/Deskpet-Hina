import { describe, expect, it } from 'vitest'
import { PET_ANIMATIONS } from '../../src/shared/types'
import { HINA_SWIMSUIT_ANIMATIONS } from '../../src/shared/model-animations'
import { GLB_ANIMATION_MAP } from '../../src/renderer/src/renderers/glb-action-map'

describe('official GLB animation map', () => {
  it('maps every unified action to a model animation', () => {
    for (const action of PET_ANIMATIONS) {
      expect(GLB_ANIMATION_MAP[action]).toBeDefined()
      expect(GLB_ANIMATION_MAP[action].clip).toMatch(
        /^(Cafe|Formation|Normal|Public|Victory|Vital)/,
      )
    }
  })

  it('exposes all 23 official clips and uses Formation_Pickup when lifted', () => {
    expect(HINA_SWIMSUIT_ANIMATIONS).toHaveLength(23)
    expect(new Set(HINA_SWIMSUIT_ANIMATIONS.map((animation) => animation.clip)).size).toBe(23)
    expect(GLB_ANIMATION_MAP.drag_start.clip).toBe('Formation_Pickup')
    expect(GLB_ANIMATION_MAP.drag_start.loop).toBe(true)

    const clipNames = new Set(HINA_SWIMSUIT_ANIMATIONS.map((animation) => animation.clip))
    for (const binding of Object.values(GLB_ANIMATION_MAP)) {
      expect(clipNames.has(binding.clip)).toBe(true)
    }
  })
})

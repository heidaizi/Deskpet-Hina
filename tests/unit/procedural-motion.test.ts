import { describe, expect, it } from 'vitest'
import { dampMotion, stableUnitHash } from '../../src/renderer/src/renderers/procedural-motion'

describe('procedural motion helpers', () => {
  it('smooths gaze motion without overshooting', () => {
    const firstStep = dampMotion(0, 1, 1 / 60, 9)
    expect(firstStep).toBeGreaterThan(0)
    expect(firstStep).toBeLessThan(1)

    let value = 0
    for (let frame = 0; frame < 180; frame += 1) {
      value = dampMotion(value, 1, 1 / 60, 9)
    }
    expect(value).toBeGreaterThan(0.99)
    expect(value).toBeLessThanOrEqual(1)
  })

  it('derives stable hair phases within one unit interval', () => {
    const phase = stableUnitHash('bone_hair_B_02')
    expect(phase).toBe(stableUnitHash('bone_hair_B_02'))
    expect(phase).toBeGreaterThanOrEqual(0)
    expect(phase).toBeLessThanOrEqual(1)
    expect(phase).not.toBe(stableUnitHash('bone_hair_L_02'))
  })
})

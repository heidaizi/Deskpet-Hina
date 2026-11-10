import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GAZE_ANCHOR,
  idleGazeOffset,
  normalizeGazeTarget,
  resolveRenderPixelRatio,
} from '../../src/renderer/src/renderers/gaze'

describe('gaze normalization', () => {
  it('maps the anchor centre to zero and clamps beyond the edges', () => {
    const centre = normalizeGazeTarget({
      x: DEFAULT_GAZE_ANCHOR.originX,
      y: DEFAULT_GAZE_ANCHOR.originY,
    })
    expect(centre.x).toBeCloseTo(0)
    expect(centre.y).toBeCloseTo(0)

    const farLeft = normalizeGazeTarget({ x: -1_000, y: 10_000 })
    expect(farLeft.x).toBe(-1)
    expect(farLeft.y).toBe(-1)

    const farRight = normalizeGazeTarget({ x: 10_000, y: -10_000 })
    expect(farRight.x).toBe(1)
    expect(farRight.y).toBe(1)
  })

  it('keeps the original 170/110 and 145/130 proportions', () => {
    const point = { x: DEFAULT_GAZE_ANCHOR.originX + DEFAULT_GAZE_ANCHOR.spanX / 2, y: 80 }
    const target = normalizeGazeTarget(point)
    expect(target.x).toBeCloseTo(0.5)
    expect(target.y).toBeCloseTo((145 - 80) / 130)
  })

  it('falls back to zero for non-finite input', () => {
    expect(normalizeGazeTarget({ x: Number.NaN, y: Number.POSITIVE_INFINITY })).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('supports a custom anchor', () => {
    const target = normalizeGazeTarget(
      { x: 50, y: 50 },
      {
        originX: 0,
        spanX: 100,
        originY: 0,
        spanY: 100,
      },
    )
    expect(target.x).toBeCloseTo(0.5)
    expect(target.y).toBeCloseTo(-0.5)
  })
})

describe('idle gaze scan', () => {
  it('stays within the subtle idle range', () => {
    for (let seconds = 0; seconds < 60; seconds += 0.37) {
      const offset = idleGazeOffset(seconds)
      expect(Math.abs(offset.x)).toBeLessThan(0.08)
      expect(Math.abs(offset.y)).toBeLessThan(0.045)
    }
  })

  it('scales with the micro-motion boost and tolerates bad input', () => {
    const base = idleGazeOffset(3.2, 1)
    const boosted = idleGazeOffset(3.2, 2.6)
    expect(boosted.x).toBeCloseTo(base.x * 2.6)
    const fallback = idleGazeOffset(Number.NaN, Number.NaN)
    expect(Number.isFinite(fallback.x)).toBe(true)
    expect(Number.isFinite(fallback.y)).toBe(true)
  })
})

describe('render pixel ratio', () => {
  it('multiplies device ratio, supersample and clamps to the maximum', () => {
    expect(resolveRenderPixelRatio(2, 1.5, 'active', 3)).toBe(3)
    expect(resolveRenderPixelRatio(1, 1.5, 'active', 3)).toBeCloseTo(1.5)
  })

  it('lowers resolution on low power', () => {
    expect(resolveRenderPixelRatio(1, 1.5, 'low-power', 3)).toBeCloseTo(1.08)
    expect(resolveRenderPixelRatio(1, 1.5, 'idle', 3)).toBeCloseTo(1.5)
  })

  it('guards against invalid inputs', () => {
    expect(resolveRenderPixelRatio(0, 1.5, 'active', 3)).toBeCloseTo(1.5)
    expect(resolveRenderPixelRatio(Number.NaN, Number.NaN, 'active', 3)).toBe(1)
  })
})

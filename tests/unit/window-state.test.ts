import { describe, expect, it } from 'vitest'
import type { DisplayDescriptor } from '../../src/shared/types'
import {
  chooseAutonomousWalkPlan,
  clampBoundsToWorkArea,
  defaultBounds,
  isPointInsideAnyHitArea,
  isPointInsideHitArea,
  resolveWindowBounds,
} from '../../src/main/window-state'

function sequence(...values: number[]): () => number {
  let index = 0
  return () => values[index++] ?? values.at(-1) ?? 0
}

const primary: DisplayDescriptor = {
  id: 1,
  workArea: { x: 0, y: 25, width: 1440, height: 875 },
}

const secondary: DisplayDescriptor = {
  id: 2,
  workArea: { x: 1440, y: 0, width: 1920, height: 1080 },
}

describe('window state', () => {
  it('chooses both left and right autonomous walk directions', () => {
    expect(chooseAutonomousWalkPlan(500, 100, 900, sequence(0.1, 0.5))?.direction).toBe(-1)
    expect(chooseAutonomousWalkPlan(500, 100, 900, sequence(0.9, 0.5))?.direction).toBe(1)
  })

  it('avoids repeating the previous direction when both sides are available', () => {
    expect(chooseAutonomousWalkPlan(500, 100, 900, sequence(0.9, 0.1, 0.5), 1)?.direction).toBe(-1)
  })

  it('walks toward the only available side near a display edge', () => {
    expect(chooseAutonomousWalkPlan(880, 100, 900, () => 0.2)?.direction).toBe(-1)
    expect(chooseAutonomousWalkPlan(100, 100, 120, () => 0.2)).toBeNull()
  })

  it('clamps a window into the visible work area', () => {
    expect(
      clampBoundsToWorkArea({ x: 1700, y: -100, width: 340, height: 460 }, secondary.workArea),
    ).toEqual({
      x: 1700,
      y: 0,
      width: 340,
      height: 460,
    })
  })

  it('positions a new window at the bottom-right of the primary display', () => {
    expect(defaultBounds(primary.workArea, { width: 340, height: 460 })).toEqual({
      x: 1064,
      y: 412,
      width: 340,
      height: 460,
    })
  })

  it('restores a valid saved display position', () => {
    expect(
      resolveWindowBounds(
        {
          x: 1600,
          y: 120,
          width: 340,
          height: 460,
          displayId: secondary.id,
        },
        [primary, secondary],
        primary.id,
        { width: 340, height: 460 },
      ),
    ).toEqual({
      x: 1600,
      y: 120,
      width: 340,
      height: 460,
      displayId: secondary.id,
    })
  })

  it('uses the current renderer size instead of the saved window size', () => {
    expect(
      resolveWindowBounds(
        {
          x: 1600,
          y: 120,
          width: 340,
          height: 460,
          displayId: secondary.id,
        },
        [primary, secondary],
        primary.id,
        { width: 197, height: 270 },
      ),
    ).toEqual({
      x: 1600,
      y: 120,
      width: 197,
      height: 270,
      displayId: secondary.id,
    })
  })

  it('returns to the primary display when the saved display was disconnected', () => {
    expect(
      resolveWindowBounds(
        {
          x: 1650,
          y: 130,
          width: 340,
          height: 460,
          displayId: 99,
        },
        [primary],
        primary.id,
        { width: 340, height: 460 },
      ),
    ).toEqual({
      x: 1100,
      y: 130,
      width: 340,
      height: 460,
      displayId: primary.id,
    })
  })
})

describe('hit areas', () => {
  it('detects circle and rectangle hit areas', () => {
    expect(
      isPointInsideHitArea(
        { x: 10, y: 10 },
        { id: 'head', type: 'circle', x: 10, y: 10, radius: 5 },
      ),
    ).toBe(true)
    expect(
      isPointInsideHitArea(
        { x: 12, y: 12 },
        { id: 'body', type: 'rect', x: 0, y: 0, width: 10, height: 10 },
      ),
    ).toBe(false)
  })

  it('applies hit padding while preserving pass-through gaps', () => {
    const areas = [
      { id: 'head', type: 'circle' as const, x: 100, y: 100, radius: 20 },
      { id: 'body', type: 'rect' as const, x: 60, y: 130, width: 80, height: 120 },
    ]
    expect(isPointInsideAnyHitArea({ x: 123, y: 100 }, areas, 5)).toBe(true)
    expect(isPointInsideAnyHitArea({ x: 20, y: 20 }, areas, 5)).toBe(false)
  })
})

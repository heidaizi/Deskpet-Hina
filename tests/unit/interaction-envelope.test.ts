import { describe, expect, it } from 'vitest'
import {
  calculateBubbleDisplayDurationMs,
  calculateBubbleLayout,
  calculateInteractionEnvelope,
  PET_LOGICAL_HEIGHT,
  PET_LOGICAL_WIDTH,
} from '../../src/shared/interaction-envelope'

describe('interaction envelope', () => {
  it('keeps the full logical window for 2D', () => {
    expect(calculateInteractionEnvelope('2d', 0.3)).toEqual({
      cropX: 0,
      cropY: 0,
      width: PET_LOGICAL_WIDTH,
      height: PET_LOGICAL_HEIGHT,
      modelOffsetY: 0,
      logicalHeight: PET_LOGICAL_HEIGHT,
    })
  })

  it('crops transparent space around a scaled 3D model and its bubble', () => {
    const full = calculateInteractionEnvelope('3d', 1)
    const half = calculateInteractionEnvelope('3d', 0.5)
    const small = calculateInteractionEnvelope('3d', 0.3)

    expect(full.width).toBeLessThanOrEqual(PET_LOGICAL_WIDTH)
    expect(full.height).toBeLessThanOrEqual(full.logicalHeight)
    expect(half.width).toBeLessThan(full.width)
    expect(half.height).toBeLessThan(full.height)
    expect(small.width).toBeLessThan(half.width)
    expect(small.height).toBeLessThan(half.height)
    expect(small.cropX).toBeGreaterThan(0)
    expect(small.cropY).toBeGreaterThan(200)
  })

  it('keeps the bubble inside the calculated envelope', () => {
    const envelope = calculateInteractionEnvelope('3d', 0.5)
    const bubble = calculateBubbleLayout(0.5)
    const bubbleLeft = PET_LOGICAL_WIDTH / 2 - bubble.maxWidth / 2
    const bubbleRight = PET_LOGICAL_WIDTH / 2 + bubble.maxWidth / 2
    const bubbleBottom = envelope.logicalHeight - bubble.bottom
    const headTop = envelope.modelOffsetY + bubble.headTop

    expect(bubbleLeft).toBeGreaterThanOrEqual(envelope.cropX)
    expect(bubbleRight).toBeLessThanOrEqual(envelope.cropX + envelope.width)
    expect(bubbleBottom).toBeGreaterThanOrEqual(envelope.cropY)
    expect(bubbleBottom).toBeLessThan(headTop)
  })

  it('allocates more reading time to longer dialogue', () => {
    const short = calculateBubbleDisplayDurationMs('好。')
    const medium = calculateBubbleDisplayDurationMs('等、等一下，老师！')
    const long = calculateBubbleDisplayDurationMs(
      '诶，总之先一起跳进海里吧？等、等一下老师！我、我还没做好心理准备……！',
    )

    expect(short).toBe(3_200)
    expect(medium).toBeGreaterThan(short)
    expect(long).toBeGreaterThan(medium)
    expect(long).toBeGreaterThan(5_000)
    expect(long).toBeLessThanOrEqual(8_000)
    expect(calculateBubbleDisplayDurationMs('长'.repeat(200))).toBe(8_000)
  })
})

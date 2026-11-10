import { MODEL_SCALE_MAX, MODEL_SCALE_MIN } from './model-animations'

export const PET_LOGICAL_WIDTH = 340
export const PET_LOGICAL_HEIGHT = 460
export const PET_ANCHOR_X = 170
export const PET_ANCHOR_Y = 400
export const PET_BUBBLE_GAP = 12
export const PET_3D_BUBBLE_RESERVE_Y = 176

const MODEL_HEAD_CENTER_Y = 140
const MODEL_HEAD_RADIUS = 67
const MODEL_HALO_CENTER_Y = 55
const MODEL_HALO_RADIUS = 14
const MODEL_FULL_WIDTH = 340
const MODEL_BELOW_ANCHOR = 50
const MAX_DIALOGUE_CHARACTERS = 90
const BUBBLE_ESTIMATE_MARGIN = 8

export interface InteractionEnvelope {
  cropX: number
  cropY: number
  width: number
  height: number
  modelOffsetY: number
  logicalHeight: number
}

export interface BubbleLayout {
  headTop: number
  visualTop: number
  bottom: number
  maxWidth: number
  fontSize: number
  paddingY: number
  paddingX: number
  borderRadius: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function calculateBubbleLayout(scale: number): BubbleLayout {
  const normalized = clamp(scale, MODEL_SCALE_MIN, MODEL_SCALE_MAX)
  const headTop =
    PET_ANCHOR_Y + (MODEL_HEAD_CENTER_Y - MODEL_HEAD_RADIUS - PET_ANCHOR_Y) * normalized
  const haloTop =
    PET_ANCHOR_Y + (MODEL_HALO_CENTER_Y - MODEL_HALO_RADIUS - PET_ANCHOR_Y) * normalized
  const visualTop = Math.min(headTop, haloTop)

  return {
    headTop,
    visualTop,
    bottom: PET_LOGICAL_HEIGHT - (visualTop - PET_BUBBLE_GAP),
    maxWidth: 112 + 133 * normalized,
    fontSize: 10 + 3 * normalized,
    paddingY: 6 + 4 * normalized,
    paddingX: 9 + 5 * normalized,
    borderRadius: 10 + 6 * normalized,
  }
}

export function calculateBubbleDisplayDurationMs(text: string): number {
  const characters = Array.from(text.trim())
  const visibleCharacters = characters.filter((character) => !/\s/u.test(character)).length
  const punctuation = characters.filter((character) =>
    /[，。！？、；：…,.!?;:]/u.test(character),
  ).length
  const readingTime = 1_700 + visibleCharacters * 170 + punctuation * 60
  return Math.round(clamp(readingTime, 3_200, 8_000))
}

export function calculateInteractionEnvelope(
  mode: '2d' | '3d',
  scale: number,
): InteractionEnvelope {
  if (mode !== '3d') {
    return {
      cropX: 0,
      cropY: 0,
      width: PET_LOGICAL_WIDTH,
      height: PET_LOGICAL_HEIGHT,
      modelOffsetY: 0,
      logicalHeight: PET_LOGICAL_HEIGHT,
    }
  }

  const normalized = clamp(scale, MODEL_SCALE_MIN, MODEL_SCALE_MAX)
  const bubble = calculateBubbleLayout(normalized)
  const modelOffsetY = PET_3D_BUBBLE_RESERVE_Y
  const logicalHeight = PET_LOGICAL_HEIGHT + modelOffsetY
  const desiredWidth = Math.max(MODEL_FULL_WIDTH * normalized, bubble.maxWidth) + 28
  const width = Math.round(clamp(desiredWidth, Math.min(156, PET_LOGICAL_WIDTH), PET_LOGICAL_WIDTH))
  const cropX = Math.round(clamp(PET_ANCHOR_X - width / 2, 0, PET_LOGICAL_WIDTH - width))
  const bubbleBottomY = logicalHeight - bubble.bottom
  const bubbleHeight = estimateMaximumBubbleHeight(bubble)
  const bubbleTopY = bubbleBottomY - bubbleHeight - BUBBLE_ESTIMATE_MARGIN
  const cropY = Math.floor(clamp(bubbleTopY, 0, logicalHeight - 150))
  const contentBottom = modelOffsetY + PET_ANCHOR_Y + MODEL_BELOW_ANCHOR * normalized + 16
  const bottom = Math.ceil(clamp(contentBottom, cropY + 150, logicalHeight))

  return {
    cropX,
    cropY,
    width,
    height: bottom - cropY,
    modelOffsetY,
    logicalHeight,
  }
}

function estimateMaximumBubbleHeight(bubble: BubbleLayout): number {
  const contentWidth = Math.max(1, bubble.maxWidth - bubble.paddingX * 2)
  const averageCharacterWidth = bubble.fontSize * 1.08
  const charactersPerLine = Math.max(1, Math.floor(contentWidth / averageCharacterWidth))
  const lines = Math.ceil(MAX_DIALOGUE_CHARACTERS / charactersPerLine)
  return lines * bubble.fontSize * 1.45 + bubble.paddingY * 2 + 2
}

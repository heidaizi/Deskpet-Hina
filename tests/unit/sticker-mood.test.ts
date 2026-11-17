import { describe, expect, it } from 'vitest'
import { stickerMoodForEmotion } from '../../src/main/chat/bridge'

describe('sticker moods', () => {
  it('maps AI emotions to sticker emotions', () => {
    expect(stickerMoodForEmotion('happy')).toBe('happy')
    expect(stickerMoodForEmotion('embarrassed')).toBe('embarrassed')
    expect(stickerMoodForEmotion('reluctant')).toBe('embarrassed')
    expect(stickerMoodForEmotion('annoyed')).toBe('annoyed')
    expect(stickerMoodForEmotion('stern')).toBe('annoyed')
    expect(stickerMoodForEmotion('tired')).toBe('calm')
  })

  it('does not attach stickers to neutral replies', () => {
    expect(stickerMoodForEmotion('neutral')).toBeNull()
    expect(stickerMoodForEmotion(undefined)).toBeNull()
  })
})

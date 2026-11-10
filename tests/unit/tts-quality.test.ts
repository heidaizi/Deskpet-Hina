import { describe, expect, it } from 'vitest'
import { TTS_QUALITY_PROFILES } from '../../src/main/domain/local-tts-service'

describe('tts quality profiles', () => {
  it('orders the three profiles from best quality to fastest', () => {
    expect(TTS_QUALITY_PROFILES.quality.numSteps).toBeGreaterThan(
      TTS_QUALITY_PROFILES.balanced.numSteps,
    )
    expect(TTS_QUALITY_PROFILES.balanced.numSteps).toBeGreaterThan(
      TTS_QUALITY_PROFILES.speed.numSteps,
    )
  })

  it('keeps denoising in every profile', () => {
    expect(TTS_QUALITY_PROFILES.quality.denoise).toBe(true)
    expect(TTS_QUALITY_PROFILES.balanced.denoise).toBe(true)
    expect(TTS_QUALITY_PROFILES.speed.denoise).toBe(true)
  })
})

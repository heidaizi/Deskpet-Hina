import { describe, expect, it } from 'vitest'
import { normalizeTtsText } from '../../src/shared/tts-text'

describe('tts text normalization', () => {
  it('drops a leading ellipsis so the model does not add a breath', () => {
    expect(normalizeTtsText('……先生にだけは、こうなるの。')).toBe('先生にだけは、こうなるの。')
    expect(normalizeTtsText('…… うん。')).toBe('うん。')
  })

  it('turns inner ellipses into a short pause', () => {
    expect(normalizeTtsText('急に触らないで……でも、やめてとは言ってない。')).toBe(
      '急に触らないで、でも、やめてとは言ってない。',
    )
  })

  it('collapses repeated punctuation and spaces', () => {
    expect(normalizeTtsText('そう……  ……ですね')).toBe('そう、ですね')
    expect(normalizeTtsText('   ')).toBe('')
  })

  it('keeps plain text untouched', () => {
    expect(normalizeTtsText('今日の作業はここまでにしましょうか。')).toBe(
      '今日の作業はここまでにしましょうか。',
    )
  })
})

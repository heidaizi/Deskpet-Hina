import { describe, expect, it } from 'vitest'
import { chatSentiment } from '../../src/shared/chat-sentiment'

describe('chat sentiment', () => {
  it('classifies warm replies as positive', () => {
    expect(chatSentiment('soft')).toBe('positive')
    expect(chatSentiment('embarrassed')).toBe('positive')
    expect(chatSentiment('calm')).toBe('positive')
  })

  it('classifies sharp replies as negative', () => {
    expect(chatSentiment('annoyed')).toBe('negative')
    expect(chatSentiment('stern')).toBe('negative')
    expect(chatSentiment('warning')).toBe('negative')
  })

  it('falls back to neutral', () => {
    expect(chatSentiment('neutral')).toBe('neutral')
    expect(chatSentiment(undefined)).toBe('neutral')
  })
})

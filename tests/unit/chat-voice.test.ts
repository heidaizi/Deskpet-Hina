import { describe, expect, it } from 'vitest'
import { resolveChatTtsEmotion } from '../../src/shared/chat-voice'

describe('chat tts emotion', () => {
  it('keeps the voice steady for ordinary emotions', () => {
    for (const emotion of [
      'happy',
      'soft',
      'embarrassed',
      'tired',
      'sad',
      'neutral',
      undefined,
      '',
    ]) {
      expect(resolveChatTtsEmotion(emotion)).toBe('neutral')
    }
  })

  it('only becomes firm when the reply is clearly annoyed', () => {
    for (const emotion of ['angry', 'annoyed', 'stern', 'warning', 'ANNOYED']) {
      expect(resolveChatTtsEmotion(emotion)).toBe('annoyed')
    }
  })
})

describe('relationship-aware voice', () => {
  it('keeps soft out until the relationship is close enough', () => {
    expect(resolveChatTtsEmotion('embarrassed', 1)).toBe('neutral')
    expect(resolveChatTtsEmotion('embarrassed', 2)).toBe('neutral')
    expect(resolveChatTtsEmotion('embarrassed', 3)).toBe('soft')
  })

  it('allows more softness at the closest stage', () => {
    expect(resolveChatTtsEmotion('happy', 3)).toBe('neutral')
    expect(resolveChatTtsEmotion('happy', 4)).toBe('soft')
    expect(resolveChatTtsEmotion('annoyed', 4)).toBe('annoyed')
  })
})

describe('chat voice world state', () => {
  it('keeps the voice calm during pomodoro focus', async () => {
    const { resolveChatTtsEmotion } = await import('../../src/shared/chat-voice')
    expect(resolveChatTtsEmotion('happy', 5, { pomodoroActive: true })).toBe('neutral')
    expect(resolveChatTtsEmotion('annoyed', 5, { pomodoroActive: true })).toBe('annoyed')
  })

  it('softens the voice when Hina is very tired', async () => {
    const { resolveChatTtsEmotion } = await import('../../src/shared/chat-voice')
    expect(resolveChatTtsEmotion('neutral', 4, { fatigue: 80 })).toBe('soft')
    expect(resolveChatTtsEmotion('neutral', 1, { fatigue: 80 })).toBe('neutral')
  })

  it('adjusts speech rate from focus and fatigue', async () => {
    const { resolveChatTtsDurationScale } = await import('../../src/shared/chat-voice')
    expect(resolveChatTtsDurationScale('neutral', { fatigue: 80 })).toBe(1.04)
    expect(resolveChatTtsDurationScale('neutral', { pomodoroActive: true })).toBe(0.98)
    expect(resolveChatTtsDurationScale('annoyed', { fatigue: 80 })).toBeUndefined()
  })
})

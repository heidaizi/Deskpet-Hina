import type { AiEmotion } from './ai-context'

export type ChatSentiment = 'positive' | 'neutral' | 'negative'

const POSITIVE: readonly AiEmotion[] = ['soft', 'embarrassed', 'calm', 'happy' as AiEmotion]
const NEGATIVE: readonly AiEmotion[] = ['annoyed', 'stern', 'warning', 'suspicious']

/** 把对话回复的情绪归类，供好感与心情使用。 */
export function chatSentiment(emotion: string | undefined): ChatSentiment {
  const value = (emotion ?? '').trim().toLowerCase()
  if (POSITIVE.includes(value as AiEmotion)) {
    return 'positive'
  }
  if (NEGATIVE.includes(value as AiEmotion)) {
    return 'negative'
  }
  return 'neutral'
}

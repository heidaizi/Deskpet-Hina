import { describe, expect, it } from 'vitest'
import { buildChatMessages, buildChatRequestMessages } from '../../src/main/domain/deepseek-client'

const context = {
  selectedText: 'const a = 1',
  windowTitle: 'main.ts',
  appName: 'Cursor',
  timeOfDay: '晚上',
  interactionsPaused: false,
  affectionLevel: 3,
  moodLabel: '平静',
  energyLevel: 0.6,
  presenceMemory: [],
  recentEvents: [],
} as never

function systemOf(messages: Array<{ role: string; content: string }>): string {
  return messages.find((message) => message.role === 'system')?.content ?? ''
}

describe('character voice prompt', () => {
  it('is present in every prompt builder', () => {
    const builders = [
      systemOf(buildChatMessages(context)),
      systemOf(buildChatRequestMessages('你好', [], context)),
    ]
    for (const prompt of builders) {
      expect(prompt).toContain('空崎日奈')
      expect(prompt).toContain('reply_ja')
      expect(prompt).toContain('私下')
      expect(prompt).toContain('官方台词参考')
      expect(prompt).toContain('この水着')
      expect(prompt).toContain('ドレスだと')
      expect(prompt.toLowerCase()).toContain('json')
    }
  })
})

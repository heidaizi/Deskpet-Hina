import { describe, expect, it } from 'vitest'
import { buildVisionPrompt, parseVisionReply } from '../../src/main/perception/screen-vision-core'

describe('screen vision parsing', () => {
  it('parses a JSON activity reply', () => {
    const vision = parseVisionReply(
      '{"activity":"coding","summary":"在改一个 Electron 项目，屏幕上是代码编辑器"}',
      123,
    )
    expect(vision).toMatchObject({ activity: 'coding', at: 123 })
    expect(vision?.summary).toContain('Electron')
  })

  it('falls back to other for unknown activity', () => {
    expect(parseVisionReply('{"activity":"unknown","summary":"看着一个网页"}')?.activity).toBe(
      'other',
    )
  })

  it('rejects replies without usable JSON', () => {
    expect(parseVisionReply('我看不到屏幕')).toBeNull()
    expect(parseVisionReply('{"activity":"coding"}')).toBeNull()
  })

  it('renders a prompt without claiming to watch the screen', () => {
    const prompt = buildVisionPrompt({ activity: 'coding', summary: '在写测试', at: 1 })
    expect(prompt).toContain('写代码')
    expect(prompt).toContain('我看到你的屏幕')
  })
})

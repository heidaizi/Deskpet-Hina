import { describe, expect, it } from 'vitest'
import { detectChatIntent } from '../../src/shared/chat-intent'

describe('chat intent', () => {
  it('detects screen questions', () => {
    expect(detectChatIntent('你能知道我现在在做什么吗')).toContain('screen')
    expect(detectChatIntent('我屏幕上是什么')).toContain('screen')
  })

  it('detects page and media questions', () => {
    expect(detectChatIntent('我在看什么网页')).toContain('page')
    expect(detectChatIntent('我在听什么歌')).toContain('media')
  })

  it('detects schedule and time questions', () => {
    expect(detectChatIntent('今天有什么安排')).toContain('schedule')
    expect(detectChatIntent('现在几点了')).toContain('time')
  })

  it('returns nothing for ordinary chat', () => {
    expect(detectChatIntent('今天好累')).toEqual([])
  })
})

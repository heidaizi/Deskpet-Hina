import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CONTEXT_CHAR_BUDGET,
  ConversationBuffer,
} from '../../src/main/domain/memory/conversation-buffer'

const directories: string[] = []

function makeBuffer(): { buffer: ConversationBuffer; directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'deskpet-conversation-'))
  directories.push(directory)
  const path = join(directory, 'conversation.json')
  return { buffer: new ConversationBuffer(path), directory, path }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('conversation buffer', () => {
  it('appends turns and returns them in order', () => {
    const { buffer } = makeBuffer()
    buffer.append('user', '帮我看这段代码')
    buffer.append('pet', '这行是防抖。', { emotion: 'calm' })

    const recent = buffer.recent(4)
    expect(recent).toHaveLength(2)
    expect(recent[0].role).toBe('user')
    expect(recent[1].role).toBe('pet')
    expect(recent[1].emotion).toBe('calm')
  })

  it('drops the oldest turns beyond the storage cap', () => {
    const { buffer } = makeBuffer()
    for (let index = 0; index < 30; index += 1) {
      buffer.append(index % 2 === 0 ? 'user' : 'pet', `第 ${index} 条`)
    }
    expect(buffer.size()).toBe(24)
    expect(buffer.recent(1)[0].text).toBe('第 29 条')
  })

  it('builds history oldest-first with assistant mapping', () => {
    const { buffer } = makeBuffer()
    buffer.append('user', '问题一')
    buffer.append('pet', '回答一')
    buffer.append('user', '问题二')

    const history = buffer.buildHistory(4)
    expect(history).toEqual([
      { role: 'user', content: '问题一' },
      { role: 'assistant', content: '回答一' },
      { role: 'user', content: '问题二' },
    ])
  })

  it('keeps injected history within the character budget', () => {
    const { buffer } = makeBuffer()
    for (let index = 0; index < 6; index += 1) {
      buffer.append('user', '很长的内容'.repeat(40))
    }
    const history = buffer.buildHistory(6)
    const total = history.reduce((sum, turn) => sum + Array.from(turn.content).length, 0)
    expect(total).toBeLessThanOrEqual(CONTEXT_CHAR_BUDGET)
    expect(history.length).toBeGreaterThan(0)
  })

  it('persists and restores across instances', () => {
    const { buffer, path } = makeBuffer()
    buffer.append('user', '记住这段')
    buffer.append('pet', '好。')

    const restored = new ConversationBuffer(path)
    expect(restored.size()).toBe(2)
    expect(restored.recent(2)[1].text).toBe('好。')
  })

  it('resets and backs up a corrupted file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deskpet-conversation-'))
    directories.push(directory)
    const path = join(directory, 'conversation.json')
    writeFileSync(path, '{ not json', 'utf8')

    const buffer = new ConversationBuffer(path)
    expect(buffer.size()).toBe(0)
    buffer.append('user', '继续')
    expect(JSON.parse(readFileSync(path, 'utf8')).turns).toHaveLength(1)
  })

  it('clears all turns', () => {
    const { buffer } = makeBuffer()
    buffer.append('user', '一')
    buffer.clear()
    expect(buffer.size()).toBe(0)
    expect(buffer.buildHistory()).toEqual([])
  })
})

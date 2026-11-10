import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LongTermMemory } from '../../src/main/domain/memory/long-term-memory'

const dirs: string[] = []

function create(): LongTermMemory {
  const dir = mkdtempSync(join(tmpdir(), 'deskpet-ltm-'))
  dirs.push(dir)
  return new LongTermMemory(dir)
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('long term memory', () => {
  it('remembers a conversation and persists it', () => {
    const memory = create()
    memory.remember('老师：我在改 Electron 项目；日奈：别太累着。')
    expect(memory.size()).toBe(1)

    const reloaded = new LongTermMemory(join(dirs[0]))
    expect(reloaded.size()).toBe(1)
  })

  it('deduplicates identical memories', () => {
    const memory = create()
    memory.remember('老师：今天在写测试。')
    memory.remember('老师：今天在写测试。')
    expect(memory.size()).toBe(1)
  })

  it('recalls related memories and counts hits', () => {
    const memory = create()
    memory.remember('老师：我在改 Electron 的窗口逻辑。')
    memory.remember('老师：晚上吃了拉面。')

    const hits = memory.search('Electron 窗口又崩了', 2)
    expect(hits[0].text).toContain('Electron')
    expect(hits[0].hits).toBe(1)
  })

  it('ignores overly short or unrelated memories', () => {
    const memory = create()
    expect(memory.remember('嗯')).toBeNull()
    memory.remember('老师：在写 TypeScript 测试。')
    expect(memory.search('完全无关的天气话题')).toEqual([])
  })

  it('builds a prompt block', () => {
    const memory = create()
    const entry = memory.remember('老师：项目叫 Deskpet；日奈：记住了。')!
    expect(memory.buildPrompt([entry])).toContain('你记得和老师聊过')
  })
})

describe('semantic recall', () => {
  it('uses vector similarity when an embedder is available', async () => {
    const memory = create()
    // 假的嵌入：按关键词给不同向量，验证余弦排序生效。
    memory.setEmbedder(async (text) => {
      if (text.includes('代码') || text.includes('Electron')) return [1, 0, 0, 0]
      if (text.includes('拉面')) return [0, 1, 0, 0]
      return [0, 0, 1, 0]
    })
    memory.remember('老师：今天在改 Electron 代码。')
    memory.remember('老师：晚上去吃了拉面。')
    await new Promise((resolve) => setTimeout(resolve, 10))

    const hits = await memory.searchSemantic('代码又报错了', 2)
    expect(hits[0].text).toContain('Electron')
    expect(hits.some((entry) => entry.text.includes('拉面'))).toBe(false)
  })

  it('falls back to lexical search without an embedder', async () => {
    const memory = create()
    memory.remember('老师：今天在改 Electron 代码。')
    const hits = await memory.searchSemantic('Electron 崩了', 2)
    expect(hits[0].text).toContain('Electron')
  })
})

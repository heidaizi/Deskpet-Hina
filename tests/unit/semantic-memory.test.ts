import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SemanticMemoryStore } from '../../src/main/domain/memory/semantic-memory'

const directories: string[] = []

function makeStore(): { store: SemanticMemoryStore; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'deskpet-semantic-'))
  directories.push(directory)
  const path = join(directory, 'semantic.json')
  return { store: new SemanticMemoryStore(path), path }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('semantic memory', () => {
  it('stores an explicit statement verbatim', () => {
    const { store } = makeStore()
    const memory = store.remember('老师最近在写 TypeScript 的桌宠项目')
    expect(memory?.statement).toBe('老师最近在写 TypeScript 的桌宠项目')
    expect(store.list()).toHaveLength(1)
  })

  it('collapses whitespace and rejects empty input', () => {
    const { store } = makeStore()
    store.remember('  多行\n内容   合并  ')
    expect(store.list()[0].statement).toBe('多行 内容 合并')
    expect(store.remember('   ')).toBeNull()
    expect(store.list()).toHaveLength(1)
  })

  it('updates the timestamp instead of duplicating the same statement', () => {
    const { store } = makeStore()
    store.remember('喜欢深色模式', 1_000)
    store.remember('喜欢深色模式', 5_000)
    expect(store.list()).toHaveLength(1)
    expect(store.list()[0].at).toBe(5_000)
  })

  it('persists across instances', () => {
    const { store, path } = makeStore()
    store.remember('周末通常下午才有空')
    expect(new SemanticMemoryStore(path).list()).toHaveLength(1)
  })

  it('searches by character overlap', () => {
    const { store } = makeStore()
    store.remember('老师最近在写 TypeScript 的桌宠项目')
    store.remember('喜欢在深夜写代码')
    const hits = store.search('TypeScript 桌宠')
    expect(hits).toHaveLength(1)
    expect(hits[0].statement).toContain('TypeScript')
  })

  it('deletes and clears entries', () => {
    const { store } = makeStore()
    const first = store.remember('第一条')
    store.remember('第二条')
    store.delete(first!.id)
    expect(store.list()).toHaveLength(1)
    store.clear()
    expect(store.list()).toHaveLength(0)
  })
})

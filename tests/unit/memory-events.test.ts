import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryEventStore } from '../../src/main/domain/memory/memory-events'

const dirs: string[] = []

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deskpet-memory-events-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('memory event store', () => {
  it('records events newest first and persists them', () => {
    const dir = makeDir()
    const store = new MemoryEventStore(dir)
    store.record({ kind: 'outfit', summary: '换上「礼服」', at: 1_000, importance: 2 })
    store.record({ kind: 'routine', summary: '开始专注，25 分钟', at: 2_000, importance: 2 })
    store.record({ kind: 'sticker', summary: '送出「开心」贴纸', at: 3_000 })

    const list = store.list()
    expect(list.map((event) => event.summary)).toEqual([
      '送出「开心」贴纸',
      '开始专注，25 分钟',
      '换上「礼服」',
    ])
    expect(list[2].importance).toBe(2)

    const reloaded = new MemoryEventStore(dir)
    expect(reloaded.list()).toHaveLength(3)
  })

  it('ignores corrupt files and invalid events', () => {
    const dir = makeDir()
    mkdirSync(join(dir, 'memory'), { recursive: true })
    writeFileSync(join(dir, 'memory', 'events.json'), '{not json')
    const store = new MemoryEventStore(dir)
    expect(store.list()).toEqual([])
    expect(store.record({ kind: 'outfit', summary: '' })).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildMemoryPrompt,
  findExact,
  findSimilar,
  normalizeZh,
  type MemoryEntry,
} from '../../src/main/domain/translation-memory'

const entries: MemoryEntry[] = [
  { zh: '这件泳装，不奇怪吗……？', ja: 'この水着、変じゃないかな……？', source: 'official' },
  {
    zh: '老师，已经很晚了，先休息一下吧。',
    ja: '先生、もう遅いよ。少し休んで。',
    source: 'prebuilt',
  },
  { zh: '今天辛苦了。', ja: '今日はお疲れさま。', source: 'prebuilt' },
]

describe('translation memory', () => {
  it('normalizes punctuation and case', () => {
    expect(normalizeZh('老师，已经很晚了！')).toBe(normalizeZh('老师已经很晚了'))
  })

  it('finds an exact match regardless of punctuation', () => {
    expect(findExact(entries, '这件泳装不奇怪吗')?.ja).toContain('この水着')
    expect(findExact(entries, '完全无关的一句话')).toBeUndefined()
  })

  it('retrieves similar entries for prompt hints', () => {
    const similar = findSimilar(entries, '老师，已经这么晚了，早点休息吧')
    expect(similar.length).toBeGreaterThan(0)
    expect(similar[0].zh).toContain('很晚')
  })

  it('builds a compact prompt block', () => {
    const prompt = buildMemoryPrompt(entries.slice(0, 2))
    expect(prompt).toContain('相似台词')
    expect(prompt).toContain('この水着')
  })
})

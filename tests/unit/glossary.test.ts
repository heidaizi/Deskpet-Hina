import { describe, expect, it } from 'vitest'
import {
  MAX_GLOSSARY_INJECTION,
  buildGlossaryPrompt,
  findGlossaryViolations,
  loadGlossary,
  matchGlossary,
  parseGlossary,
  type GlossaryEntry,
} from '../../src/main/domain/glossary'
import { join } from 'node:path'

const entries: GlossaryEntry[] = [
  {
    zh: '空崎日奈',
    ja: '空崎ヒナ',
    kana: 'そらさきヒナ',
    aliases: ['日奈', 'ヒナ'],
    category: 'character',
    confidence: 'high',
  },
  { zh: '老师', ja: '先生', aliases: ['Sensei'], category: 'address', confidence: 'high' },
  { zh: '风纪委员会', ja: '風紀委員会', category: 'organization', confidence: 'high' },
]

describe('glossary matching', () => {
  it('matches entries by Chinese name or alias', () => {
    expect(matchGlossary(entries, ['今天日奈有点累']).map((entry) => entry.zh)).toEqual([
      '空崎日奈',
    ])
    expect(matchGlossary(entries, ['Sensei，早上好']).map((entry) => entry.zh)).toEqual(['老师'])
  })

  it('returns nothing when no entry is mentioned', () => {
    expect(matchGlossary(entries, ['今天天气不错'])).toEqual([])
    expect(matchGlossary(entries, [undefined, ''])).toEqual([])
  })

  it('caps the injected entries', () => {
    const many: GlossaryEntry[] = Array.from({ length: 30 }, (_, index) => ({
      zh: `词条${index}`,
      ja: `用語${index}`,
      category: 'term' as const,
      confidence: 'high' as const,
    }))
    const text = many.map((entry) => entry.zh).join(' ')
    expect(matchGlossary(many, [text])).toHaveLength(MAX_GLOSSARY_INJECTION)
  })
})

describe('glossary prompt', () => {
  it('renders a compact mapping with kana when available', () => {
    const prompt = buildGlossaryPrompt(entries.slice(0, 2))
    expect(prompt).toContain('空崎日奈 → 空崎ヒナ（そらさきヒナ）')
    expect(prompt).toContain('老师 → 先生')
    expect(prompt).toContain('必须严格按对照翻译')
  })

  it('is empty when there is nothing to inject', () => {
    expect(buildGlossaryPrompt([])).toBe('')
  })
})

describe('glossary validation', () => {
  it('flags a Chinese name that was not rendered with the agreed Japanese term', () => {
    const violations = findGlossaryViolations(
      entries,
      '空崎日奈在看着你。',
      '空崎陽菜は見ています。',
    )
    expect(violations.map((entry) => entry.zh)).toEqual(['空崎日奈'])
  })

  it('passes when the agreed term is used', () => {
    expect(findGlossaryViolations(entries, '空崎日奈在看着你。', '空崎ヒナは見ています。')).toEqual(
      [],
    )
  })

  it('ignores entries that do not appear in the reply', () => {
    expect(findGlossaryViolations(entries, '今天很安静。', '今日は静かです。')).toEqual([])
  })
})

describe('glossary file', () => {
  it('loads the project glossary and rejects malformed entries', () => {
    const loaded = loadGlossary(join(process.cwd(), 'content', 'glossary.json'))
    expect(loaded.length).toBeGreaterThan(10)
    expect(loaded.every((entry) => entry.zh && entry.ja)).toBe(true)
    expect(
      parseGlossary({ entries: [{ zh: 'x' }, null, { zh: 'a', ja: 'b', category: 'term' }] }),
    ).toHaveLength(1)
  })
})

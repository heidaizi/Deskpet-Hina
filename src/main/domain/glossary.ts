import { existsSync, readFileSync } from 'node:fs'

export interface GlossaryEntry {
  zh: string
  ja: string
  kana?: string
  aliases?: string[]
  category: 'character' | 'address' | 'organization' | 'school' | 'term'
  confidence: 'high' | 'medium' | 'low'
}

interface GlossaryFile {
  schemaVersion: number
  updatedAt?: string
  note?: string
  entries: GlossaryEntry[]
}

/** 一次注入的条目上限，避免术语表过长挤占 prompt 预算。 */
export const MAX_GLOSSARY_INJECTION = 12

function isEntry(value: unknown): value is GlossaryEntry {
  if (!value || typeof value !== 'object') {
    return false
  }
  const entry = value as Partial<GlossaryEntry>
  return (
    typeof entry.zh === 'string' &&
    entry.zh.trim().length > 0 &&
    typeof entry.ja === 'string' &&
    entry.ja.trim().length > 0 &&
    typeof entry.category === 'string'
  )
}

export function parseGlossary(raw: unknown): GlossaryEntry[] {
  if (!raw || typeof raw !== 'object') {
    return []
  }
  const file = raw as Partial<GlossaryFile>
  return Array.isArray(file.entries) ? file.entries.filter(isEntry) : []
}

export function loadGlossary(filePath: string): GlossaryEntry[] {
  if (!existsSync(filePath)) {
    return []
  }
  try {
    return parseGlossary(JSON.parse(readFileSync(filePath, 'utf8')))
  } catch (error) {
    console.error('Glossary was invalid and has been ignored:', error)
    return []
  }
}

function entryPatterns(entry: GlossaryEntry): string[] {
  return [entry.zh, ...(entry.aliases ?? [])].filter((term) => term.trim().length > 0)
}

/**
 * 只挑出与当前输入真正相关的条目，避免每次把整张表塞进 prompt。
 */
export function matchGlossary(
  entries: readonly GlossaryEntry[],
  texts: readonly (string | undefined)[],
  limit = MAX_GLOSSARY_INJECTION,
): GlossaryEntry[] {
  const haystack = texts.filter((text): text is string => Boolean(text && text.trim())).join('\n')
  if (!haystack) {
    return []
  }
  const matched: GlossaryEntry[] = []
  for (const entry of entries) {
    if (entryPatterns(entry).some((pattern) => haystack.includes(pattern))) {
      matched.push(entry)
      if (matched.length >= limit) {
        break
      }
    }
  }
  return matched
}

/** 生成注入 prompt 的紧凑术语表，只保留必要字段。 */
export function buildGlossaryPrompt(entries: readonly GlossaryEntry[]): string {
  if (entries.length === 0) {
    return ''
  }
  const rows = entries.map((entry) => {
    const kana = entry.kana ? `（${entry.kana}）` : ''
    return `- ${entry.zh} → ${entry.ja}${kana}`
  })
  return ['术语表：以下专有名词必须严格按对照翻译，不得改写、音译或省略。', ...rows].join('\n')
}

/**
 * 校验日文回复是否用上了约定的写法。
 *
 * 只在中文里出现了约定译名时才检查，避免误报；
 * 返回缺失的条目，调用方可以记录告警而不是直接失败。
 */
export function findGlossaryViolations(
  entries: readonly GlossaryEntry[],
  replyZh: string,
  replyJa: string,
): GlossaryEntry[] {
  return entries.filter((entry) => {
    const mentionedInZh = entryPatterns(entry).some((pattern) => replyZh.includes(pattern))
    return mentionedInZh && !replyJa.includes(entry.ja)
  })
}

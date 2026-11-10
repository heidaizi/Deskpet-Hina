import { existsSync, readFileSync } from 'node:fs'

export interface MemoryEntry {
  zh: string
  ja: string
  source: string
  clip?: string | null
}

export function loadTranslationMemory(path: string): MemoryEntry[] {
  if (!existsSync(path)) {
    return []
  }
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as { entries?: MemoryEntry[] }
    return (data.entries ?? []).filter((entry) => entry.zh && entry.ja)
  } catch {
    return []
  }
}

/** 比较用的归一化：全半角、空白、标点都忽略。 */
export function normalizeZh(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\s。、，,．.!！？?…‥·・~〜ー「」『』（）()]/gu, '')
    .toLowerCase()
}

export function findExact(entries: readonly MemoryEntry[], zh: string): MemoryEntry | undefined {
  const key = normalizeZh(zh)
  return entries.find((entry) => normalizeZh(entry.zh) === key)
}

function bigrams(text: string): Set<string> {
  const chars = Array.from(normalizeZh(text))
  const set = new Set<string>()
  for (let i = 0; i < chars.length - 1; i += 1) {
    set.add(chars[i] + chars[i + 1])
  }
  return set
}

/** 按字符二元组重合度找相似台词，用于提示词参考。 */
export function findSimilar(
  entries: readonly MemoryEntry[],
  text: string,
  limit = 3,
): MemoryEntry[] {
  const target = bigrams(text)
  if (target.size === 0) {
    return []
  }
  return entries
    .map((entry) => {
      const source = bigrams(entry.zh)
      let shared = 0
      for (const gram of target) {
        if (source.has(gram)) {
          shared += 1
        }
      }
      const score = shared / Math.max(1, target.size + source.size - shared)
      return { entry, score }
    })
    .filter((item) => item.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.entry)
}

export function buildMemoryPrompt(entries: readonly MemoryEntry[]): string {
  if (entries.length === 0) {
    return ''
  }
  return [
    '相似台词的既有译法（优先保持用词一致）：',
    ...entries.map((entry) => `- 「${entry.zh}」→「${entry.ja}」`),
  ].join('\n')
}

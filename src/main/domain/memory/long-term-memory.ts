import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Embedder } from './embedding-service'

export interface LongTermEntry {
  id: string
  text: string
  createdAt: number
  /** 被召回次数，用于淘汰低频记忆。 */
  hits: number
  /** 语义向量（384 维），模型不可用时为空。 */
  vector?: number[]
}

interface MemoryFile {
  schemaVersion: number
  entries: LongTermEntry[]
}

const MAX_ENTRIES = 500
const MAX_TEXT_CHARS = 160

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\s。、，,．.!！？?…‥·・~〜ー「」『』（）()]/gu, '')
    .toLowerCase()
}

function bigrams(text: string): Set<string> {
  const chars = Array.from(normalize(text))
  const set = new Set<string>()
  for (let i = 0; i < chars.length - 1; i += 1) {
    set.add(chars[i] + chars[i + 1])
  }
  return set
}

export class LongTermMemory {
  private readonly filePath: string
  private entries: LongTermEntry[] = []
  private embedder: Embedder | null = null

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'memory', 'long-term.json')
    this.load()
  }

  setEmbedder(embedder: Embedder): void {
    this.embedder = embedder
  }

  /** 为历史记忆补齐向量；返回补齐条数。 */
  async backfill(limit = 50): Promise<number> {
    if (!this.embedder) {
      return 0
    }
    let filled = 0
    for (const entry of this.entries) {
      if (entry.vector || filled >= limit) {
        continue
      }
      const vector = await this.embedder(entry.text)
      if (vector) {
        entry.vector = vector.map((value) => Math.round(value * 1e4) / 1e4)
        filled += 1
      }
    }
    if (filled > 0) {
      this.persist()
    }
    return filled
  }

  private cosine(a: readonly number[], b: readonly number[]): number {
    let dot = 0
    let na = 0
    let nb = 0
    const length = Math.min(a.length, b.length)
    for (let i = 0; i < length; i += 1) {
      dot += a[i] * b[i]
      na += a[i] * a[i]
      nb += b[i] * b[i]
    }
    return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0
  }

  /** 语义召回；模型不可用时退回归一化词面召回。 */
  async searchSemantic(query: string, limit = 3): Promise<LongTermEntry[]> {
    if (!this.embedder) {
      return this.search(query, limit)
    }
    const queryVector = await this.embedder(query)
    if (!queryVector) {
      return this.search(query, limit)
    }
    const scored = this.entries
      .filter((entry) => Array.isArray(entry.vector) && entry.vector.length > 0)
      .map((entry) => ({ entry, score: this.cosine(queryVector, entry.vector!) }))
      .filter((item) => item.score >= 0.72)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => {
        item.entry.hits += 1
        return item.entry
      })
    return scored.length > 0 ? scored : this.search(query, limit)
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return
    }
    try {
      const data = JSON.parse(readFileSync(this.filePath, 'utf8')) as MemoryFile
      this.entries = (data.entries ?? []).filter((entry) => entry.id && entry.text)
    } catch {
      this.entries = []
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const data: MemoryFile = { schemaVersion: 1, entries: this.entries }
    writeFileSync(this.filePath, JSON.stringify(data, null, 2) + '\n')
  }

  /** 记录一段对话要点；重复内容会被合并。 */
  remember(text: string): LongTermEntry | null {
    const trimmed = text.trim().replace(/\s+/gu, ' ').slice(0, MAX_TEXT_CHARS)
    if (trimmed.length < 4) {
      return null
    }
    const key = normalize(trimmed)
    const existing = this.entries.find((entry) => normalize(entry.text) === key)
    if (existing) {
      existing.createdAt = Date.now()
      this.persist()
      return existing
    }
    const entry: LongTermEntry = {
      id: randomUUID(),
      text: trimmed,
      createdAt: Date.now(),
      hits: 0,
    }
    this.entries.unshift(entry)
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.sort((a, b) => b.hits - a.hits || b.createdAt - a.createdAt)
      this.entries = this.entries.slice(0, MAX_ENTRIES)
    }
    this.persist()
    if (this.embedder) {
      void this.embedder(trimmed).then((vector) => {
        if (vector) {
          entry.vector = vector.map((value) => Math.round(value * 1e4) / 1e4)
          this.persist()
        }
      })
    }
    return entry
  }

  /** 按字面相似度召回，命中会累计 hits。 */
  search(query: string, limit = 3): LongTermEntry[] {
    const target = bigrams(query)
    if (target.size === 0) {
      return []
    }
    return this.entries
      .map((entry) => {
        const source = bigrams(entry.text)
        let shared = 0
        for (const gram of target) {
          if (source.has(gram)) {
            shared += 1
          }
        }
        const score = shared / Math.max(1, target.size + source.size - shared)
        return { entry, score }
      })
      .filter((item) => item.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => {
        item.entry.hits += 1
        return item.entry
      })
  }

  buildPrompt(entries: readonly LongTermEntry[]): string {
    if (entries.length === 0) {
      return ''
    }
    return [
      '你记得和老师聊过这些事（自然地带出来，不要生硬复述）：',
      ...entries.map((entry) => `- ${entry.text}`),
    ].join('\n')
  }

  size(): number {
    return this.entries.length
  }

  clear(): void {
    this.entries = []
    this.persist()
  }
}

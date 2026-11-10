import { existsSync, readFileSync } from 'node:fs'
import { backupBrokenFile, writeJsonAtomic } from '../persistent-stores'

const MAX_SEMANTIC_MEMORIES = 200
const MAX_STATEMENT_CHARS = 400

import type { SemanticMemoryView } from '../../../shared/types'

export type SemanticMemory = SemanticMemoryView

interface SemanticMemoryFile {
  schemaVersion: 1
  memories: SemanticMemory[]
}

function isMemory(value: unknown): value is SemanticMemory {
  if (!value || typeof value !== 'object') {
    return false
  }
  const memory = value as Partial<SemanticMemory>
  return (
    typeof memory.id === 'string' &&
    typeof memory.at === 'number' &&
    typeof memory.statement === 'string' &&
    memory.statement.trim().length > 0
  )
}

function normalize(text: string): string {
  const collapsed = text.replace(/\s+/gu, ' ').trim()
  return Array.from(collapsed).slice(0, MAX_STATEMENT_CHARS).join('')
}

/**
 * 语义记忆（最小版）。
 *
 * 只保存用户明确要求“记住”的内容，不做自动提取，也不做推断，
 * 避免在用户不知情的情况下累积画像。
 */
export class SemanticMemoryStore {
  private memories: SemanticMemory[] = []

  constructor(private readonly filePath: string) {
    this.load()
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return
    }
    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      const file = raw as Partial<SemanticMemoryFile>
      this.memories = Array.isArray(file.memories)
        ? file.memories.filter(isMemory).slice(-MAX_SEMANTIC_MEMORIES)
        : []
    } catch (error) {
      console.error('Semantic memory was invalid and has been reset:', error)
      backupBrokenFile(this.filePath)
      this.memories = []
    }
  }

  private persist(): void {
    try {
      writeJsonAtomic(this.filePath, {
        schemaVersion: 1,
        memories: this.memories,
      } satisfies SemanticMemoryFile)
    } catch (error) {
      console.error('Failed to persist semantic memory:', error)
    }
  }

  remember(text: string, now = Date.now()): SemanticMemory | null {
    const statement = normalize(text)
    if (!statement) {
      return null
    }
    // 相同内容不重复记录，只更新时间。
    const existing = this.memories.find((memory) => memory.statement === statement)
    if (existing) {
      existing.at = now
      this.persist()
      return existing
    }
    const memory: SemanticMemory = {
      id: `${now}-${this.memories.length}`,
      at: now,
      source: 'explicit',
      statement,
    }
    this.memories.push(memory)
    if (this.memories.length > MAX_SEMANTIC_MEMORIES) {
      this.memories = this.memories.slice(-MAX_SEMANTIC_MEMORIES)
    }
    this.persist()
    return memory
  }

  list(): SemanticMemory[] {
    return this.memories.slice()
  }

  /** 按字符重叠度做最简单的关键词匹配，阶段 1 不引入向量检索。 */
  search(query: string, limit = 5): SemanticMemory[] {
    const characters = new Set(Array.from(query.replace(/\s+/gu, '')))
    if (characters.size === 0) {
      return []
    }
    return this.memories
      .map((memory) => {
        const hit = Array.from(memory.statement).filter((char) => characters.has(char)).length
        return { memory, score: hit / Math.max(1, Array.from(memory.statement).length) }
      })
      .filter((entry) => entry.score > 0.15)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((entry) => entry.memory)
  }

  delete(id: string): SemanticMemory[] {
    this.memories = this.memories.filter((memory) => memory.id !== id)
    this.persist()
    return this.list()
  }

  clear(): void {
    this.memories = []
    this.persist()
  }
}

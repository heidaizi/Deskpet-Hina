import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  PROFILE_CATEGORY_LABELS,
  type ProfileCategory,
  type ProfileFactView,
  type ProfileSource,
} from '../../../shared/memory'

export type ProfileFact = ProfileFactView

interface ProfileFile {
  schemaVersion: number
  facts: ProfileFact[]
}

const MAX_FACTS = 60
const MAX_FACT_CHARS = 60

const PATTERNS: Array<{ category: ProfileCategory; pattern: RegExp }> = [
  {
    category: 'project',
    pattern: /(?:我在(?:做|写|改|开发|维护)|正在(?:做|写|改|开发))([^。！？!?\n]{2,24})/u,
  },
  {
    category: 'preference',
    pattern: /(?:我(?:很)?(?:喜欢|不喜欢|讨厌|不吃|爱喝|爱玩))([^。！？!?\n]{1,20})/u,
  },
  {
    category: 'schedule',
    pattern:
      /((?:凌晨|早上|晚上|半夜)?\s*[0-9一二三四五六七八九十两]{1,3}\s*点(?:睡|起|工作|下班|开始))|(?:我经常熬夜|我一般很晚睡)/u,
  },
]

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/gu, ' ').slice(0, MAX_FACT_CHARS)
}

function normalizeCategory(value: unknown): ProfileCategory | null {
  return value === 'project' || value === 'preference' || value === 'schedule' || value === 'other'
    ? value
    : null
}

function normalizeFact(raw: unknown, now = Date.now()): ProfileFact | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const value = raw as Partial<ProfileFact>
  const category = normalizeCategory(value.category)
  const text = typeof value.text === 'string' ? normalizeText(value.text) : ''
  if (typeof value.id !== 'string' || !category || text.length < 2) {
    return null
  }
  const createdAt =
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : now
  return {
    id: value.id.slice(0, 80),
    category,
    text,
    createdAt,
    updatedAt:
      typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : createdAt,
    source: value.source === 'manual' ? 'manual' : 'auto',
    pinned: value.pinned === true,
  }
}

export function extractFacts(text: string): Array<{ category: ProfileCategory; text: string }> {
  const found: Array<{ category: ProfileCategory; text: string }> = []
  for (const { category, pattern } of PATTERNS) {
    const match = pattern.exec(text)
    if (match) {
      const value = (match[0] ?? '').trim()
      if (value.length >= 3) {
        found.push({ category, text: value })
      }
    }
  }
  return found
}

export class UserProfile {
  private readonly filePath: string
  private facts: ProfileFact[] = []

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'memory', 'profile.json')
    this.load()
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return
    }
    try {
      const data = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<ProfileFile>
      this.facts = Array.isArray(data.facts)
        ? data.facts
            .flatMap((fact) => {
              const normalized = normalizeFact(fact)
              return normalized ? [normalized] : []
            })
            .slice(0, MAX_FACTS)
        : []
    } catch {
      this.facts = []
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const data: ProfileFile = { schemaVersion: 1, facts: this.facts }
    writeFileSync(this.filePath, JSON.stringify(data, null, 2) + '\n')
  }

  add(
    category: ProfileCategory,
    text: string,
    source: ProfileSource = 'auto',
    now = Date.now(),
  ): ProfileFact | null {
    const trimmed = normalizeText(text)
    if (trimmed.length < 2) {
      return null
    }
    const existing = this.facts.find((fact) => fact.category === category && fact.text === trimmed)
    if (existing) {
      existing.updatedAt = now
      if (source === 'manual') {
        existing.source = 'manual'
      }
      this.persist()
      return existing
    }
    const fact: ProfileFact = {
      id: randomUUID(),
      category,
      text: trimmed,
      createdAt: now,
      updatedAt: now,
      source,
      pinned: false,
    }
    this.facts.unshift(fact)
    if (this.facts.length > MAX_FACTS) {
      this.facts = this.facts.slice(0, MAX_FACTS)
    }
    this.persist()
    return fact
  }

  addManual(category: ProfileCategory, text: string): ProfileFact | null {
    return this.add(category, text, 'manual')
  }

  update(id: string, text: string): ProfileFact[] {
    const trimmed = normalizeText(text)
    if (trimmed.length < 2) {
      return this.list()
    }
    const target = this.facts.find((fact) => fact.id === id)
    if (!target) {
      return this.list()
    }
    const duplicate = this.facts.find(
      (fact) => fact.id !== id && fact.category === target.category && fact.text === trimmed,
    )
    if (duplicate) {
      this.facts = this.facts.filter((fact) => fact.id !== id)
    } else {
      target.text = trimmed
      target.updatedAt = Date.now()
    }
    this.persist()
    return this.list()
  }

  delete(id: string): ProfileFact[] {
    this.facts = this.facts.filter((fact) => fact.id !== id)
    this.persist()
    return this.list()
  }

  setPinned(id: string, pinned: boolean): ProfileFact[] {
    const target = this.facts.find((fact) => fact.id === id)
    if (target) {
      target.pinned = pinned
      target.updatedAt = Date.now()
      this.persist()
    }
    return this.list()
  }

  /** 从用户输入里抽取并记录画像事实。 */
  observe(text: string): number {
    let added = 0
    for (const fact of extractFacts(text)) {
      const before = this.facts.length
      this.add(fact.category, fact.text, 'auto')
      if (this.facts.length > before) {
        added += 1
      }
    }
    return added
  }

  list(): ProfileFact[] {
    return this.facts
      .map((fact) => ({ ...fact }))
      .sort(
        (left, right) =>
          Number(right.pinned) - Number(left.pinned) || right.updatedAt - left.updatedAt,
      )
  }

  buildPrompt(): string {
    if (this.facts.length === 0) {
      return ''
    }
    const ordered = this.facts
      .slice()
      .sort(
        (left, right) =>
          Number(right.pinned) - Number(left.pinned) || right.updatedAt - left.updatedAt,
      )
      .slice(0, 12)
    const lines = ordered.map(
      (fact) =>
        `- ${PROFILE_CATEGORY_LABELS[fact.category]}${fact.pinned ? '（重要）' : ''}：${fact.text}`,
    )
    return ['你对老师的了解（自然地使用，不要逐条复述）：', ...lines].join('\n')
  }

  clear(): void {
    this.facts = []
    this.persist()
  }
}

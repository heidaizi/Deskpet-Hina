import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

export type ProfileCategory = 'project' | 'preference' | 'schedule' | 'other'

export interface ProfileFact {
  id: string
  category: ProfileCategory
  text: string
  createdAt: number
}

interface ProfileFile {
  schemaVersion: number
  facts: ProfileFact[]
}

const MAX_FACTS = 60

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
      const data = JSON.parse(readFileSync(this.filePath, 'utf8')) as ProfileFile
      this.facts = (data.facts ?? []).filter((fact) => fact.id && fact.text)
    } catch {
      this.facts = []
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const data: ProfileFile = { schemaVersion: 1, facts: this.facts }
    writeFileSync(this.filePath, JSON.stringify(data, null, 2) + '\n')
  }

  add(category: ProfileCategory, text: string): ProfileFact | null {
    const trimmed = text.trim().slice(0, 60)
    if (trimmed.length < 3) {
      return null
    }
    const existing = this.facts.find((fact) => fact.category === category && fact.text === trimmed)
    if (existing) {
      return existing
    }
    const fact: ProfileFact = { id: randomUUID(), category, text: trimmed, createdAt: Date.now() }
    this.facts.unshift(fact)
    if (this.facts.length > MAX_FACTS) {
      this.facts = this.facts.slice(0, MAX_FACTS)
    }
    this.persist()
    return fact
  }

  /** 从用户输入里抽取并记录画像事实。 */
  observe(text: string): number {
    let added = 0
    for (const fact of extractFacts(text)) {
      if (this.add(fact.category, fact.text)) {
        added += 1
      }
    }
    return added
  }

  list(): readonly ProfileFact[] {
    return this.facts
  }

  buildPrompt(): string {
    if (this.facts.length === 0) {
      return ''
    }
    const label: Record<ProfileCategory, string> = {
      project: '项目',
      preference: '偏好',
      schedule: '作息',
      other: '其它',
    }
    const lines = this.facts.slice(0, 12).map((fact) => `- ${label[fact.category]}：${fact.text}`)
    return ['你对老师的了解（自然地使用，不要逐条复述）：', ...lines].join('\n')
  }

  clear(): void {
    this.facts = []
    this.persist()
  }
}

import { existsSync, readFileSync } from 'node:fs'
import { backupBrokenFile, writeJsonAtomic } from '../persistent-stores'

/** 磁盘上保留的轮数上限。 */
const MAX_STORED_TURNS = 24
/** 单条内容在磁盘上的字符上限。 */
const MAX_STORED_CHARS = 400
/** 注入上下文时的字符预算：控制 token 增幅在 30% 以内。 */
export const CONTEXT_CHAR_BUDGET = 240
/** 注入上下文时单条的字符上限。 */
const CONTEXT_TURN_CHARS = 80

export type ConversationRole = 'user' | 'pet'

export interface ConversationTurn {
  id: string
  at: number
  role: ConversationRole
  text: string
  emotion?: string
  /** chat 用于对话窗口；context 用于“分析/解释选中文字”。 */
  channel?: 'chat' | 'context'
}

export interface ChatHistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

interface ConversationFile {
  schemaVersion: 1
  turns: ConversationTurn[]
}

function truncate(value: string, limit: number): string {
  const characters = Array.from(value.trim())
  if (characters.length <= limit) {
    return characters.join('')
  }
  return `${characters.slice(0, limit).join('')}…`
}

function isTurn(value: unknown): value is ConversationTurn {
  if (!value || typeof value !== 'object') {
    return false
  }
  const turn = value as Partial<ConversationTurn>
  return (
    typeof turn.id === 'string' &&
    typeof turn.at === 'number' &&
    (turn.role === 'user' || turn.role === 'pet') &&
    typeof turn.text === 'string'
  )
}

/**
 * 工作记忆：保存最近的对话轮次，并在注入 prompt 时按字符预算裁剪。
 *
 * 磁盘上保留完整轮次，注入时只取最近若干条并截断，
 * 这样既能接住上一句，又不会让单次请求的 token 无限增长。
 */
export class ConversationBuffer {
  private turns: ConversationTurn[] = []

  constructor(private readonly filePath: string) {
    this.load()
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return
    }
    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      const file = raw as Partial<ConversationFile>
      const turns = Array.isArray(file.turns) ? file.turns.filter(isTurn) : []
      this.turns = turns
        .map((turn) => ({ ...turn, text: truncate(turn.text, MAX_STORED_CHARS) }))
        .slice(-MAX_STORED_TURNS)
    } catch (error) {
      console.error('Conversation history was invalid and has been reset:', error)
      backupBrokenFile(this.filePath)
      this.turns = []
    }
  }

  private persist(): void {
    try {
      writeJsonAtomic(this.filePath, {
        schemaVersion: 1,
        turns: this.turns,
      } satisfies ConversationFile)
    } catch (error) {
      // 记忆写盘失败不应影响对话主流程。
      console.error('Failed to persist conversation history:', error)
    }
  }

  append(
    role: ConversationRole,
    text: string,
    options: { emotion?: string; channel?: 'chat' | 'context' } = {},
  ): void {
    const content = truncate(text, MAX_STORED_CHARS)
    if (!content) {
      return
    }
    this.turns.push({
      id: `${Date.now()}-${this.turns.length}`,
      at: Date.now(),
      role,
      text: content,
      ...(options.emotion ? { emotion: options.emotion } : {}),
      channel: options.channel ?? 'context',
    })
    if (this.turns.length > MAX_STORED_TURNS) {
      this.turns = this.turns.slice(-MAX_STORED_TURNS)
    }
    this.persist()
  }

  recent(limit = 8): ConversationTurn[] {
    if (limit <= 0) {
      return []
    }
    return this.turns.slice(-limit)
  }

  size(): number {
    return this.turns.length
  }

  clear(): void {
    this.turns = []
    this.persist()
  }

  clearChannel(channel: 'chat' | 'context'): void {
    this.turns = this.turns.filter((turn) => turn.channel !== channel)
    this.persist()
  }

  /**
   * 生成注入用的历史消息：从最新往回累积，直到用完字符预算。
   */
  buildHistory(limit = 4, channel?: 'chat' | 'context'): ChatHistoryTurn[] {
    const selected: ChatHistoryTurn[] = []
    let used = 0
    const source = channel
      ? this.turns.filter((turn) => turn.channel === channel).slice(-limit)
      : this.recent(limit)
    for (const turn of source.slice().reverse()) {
      const content = truncate(turn.text, CONTEXT_TURN_CHARS)
      if (!content) {
        continue
      }
      if (used + content.length > CONTEXT_CHAR_BUDGET) {
        break
      }
      used += content.length
      selected.push({
        role: turn.role === 'pet' ? 'assistant' : 'user',
        content,
      })
    }
    return selected.reverse()
  }
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  RELATIONSHIP_STAGES,
  resolveRelationshipStage,
  type RelationshipStage,
} from '../../shared/relationship'

interface RelationshipFile {
  schemaVersion: number
  stageId: number
  since: number
  firstSeen: number
  lastLevel: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** 关系阶段与认识天数，低等级时缓慢成长，升级后写入长期记忆。 */
export class RelationshipState {
  private readonly filePath: string
  private data: RelationshipFile

  constructor(userDataPath: string, now = Date.now()) {
    this.filePath = join(userDataPath, 'relationship.json')
    this.data = { schemaVersion: 1, stageId: 1, since: now, firstSeen: now, lastLevel: 1 }
    this.load()
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as RelationshipFile
      if (parsed.stageId) {
        this.data = parsed
      }
    } catch {
      // 损坏时保持默认值
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2) + '\n')
  }

  /** 根据亲密度等级刷新阶段；返回是否发生了变化。 */
  refresh(level: number, now = Date.now()): { stage: RelationshipStage; changed: boolean } {
    const stage = resolveRelationshipStage(level, this.data.stageId)
    const changed = stage.id !== this.data.stageId
    if (changed) {
      this.data.stageId = stage.id
      this.data.since = now
    }
    this.data.lastLevel = level
    this.persist()
    return { stage, changed }
  }

  current(): RelationshipStage {
    return (
      RELATIONSHIP_STAGES.find((stage) => stage.id === this.data.stageId) ?? RELATIONSHIP_STAGES[0]
    )
  }

  daysKnown(now = Date.now()): number {
    return Math.max(1, Math.floor((now - this.data.firstSeen) / DAY_MS) + 1)
  }
}

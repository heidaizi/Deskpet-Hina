/** 关系阶段：由亲密度等级推导，带滞后避免边界反复。 */
export interface RelationshipStage {
  id: number
  name: string
  minLevel: number
  /** 该阶段对说话方式的影响。 */
  prompt: string
}

export const RELATIONSHIP_STAGES: readonly RelationshipStage[] = [
  {
    id: 1,
    name: '认识',
    minLevel: 1,
    prompt: '你们还不算熟。保持礼貌和距离，句子简短，不主动打听私事，很少流露情绪。',
  },
  {
    id: 2,
    name: '熟悉',
    minLevel: 3,
    prompt: '你开始习惯老师的存在。可以放松一点，偶尔吐槽，但提到在意的事会含糊带过。',
  },
  {
    id: 3,
    name: '信任',
    minLevel: 5,
    prompt:
      '你信任老师。会主动关心他的状态，被夸时会不好意思，愿意说一点自己的事，但仍称他「先生」。',
  },
  {
    id: 4,
    name: '特别',
    minLevel: 7,
    prompt:
      '老师对你来说是特别的人。会害羞、会轻微撒娇，也会坦率表达在意；但保持日奈的克制，不腻、不叫昵称。',
  },
]

/** 降级需要比升级更低的等级，避免边界抖动。 */
const DOWNGRADE_MARGIN = 1

export function resolveRelationshipStage(
  level: number,
  previousStageId?: number,
): RelationshipStage {
  const previous = RELATIONSHIP_STAGES.find((stage) => stage.id === previousStageId)
  if (previous) {
    const next = RELATIONSHIP_STAGES.find((stage) => stage.id === previous.id + 1)
    if (next && level >= next.minLevel) {
      return next
    }
    if (level < previous.minLevel - DOWNGRADE_MARGIN) {
      // 降一级即可，最多退回上一档，不跨级跳。
      const lower = [...RELATIONSHIP_STAGES]
        .reverse()
        .find((stage) => stage.id < previous.id && level >= stage.minLevel)
      return lower ?? RELATIONSHIP_STAGES[0]
    }
    return previous
  }
  return (
    [...RELATIONSHIP_STAGES].reverse().find((stage) => level >= stage.minLevel) ??
    RELATIONSHIP_STAGES[0]
  )
}

/** 生成注入提示词的关系段。 */
export function relationshipPrompt(stage: RelationshipStage, daysKnown: number): string {
  return [
    `你和老师认识了 ${Math.max(1, Math.round(daysKnown))} 天，当前关系：${stage.name}。`,
    stage.prompt,
  ].join('\n')
}

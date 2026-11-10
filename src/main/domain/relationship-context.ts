import { relationshipPrompt } from '../../shared/relationship'
import { state } from '../app-state'

/**
 * 读取当前关系阶段，生成提示词段落。
 * 阶段变化时会写一条里程碑到长期记忆，让她之后还能提起。
 */
export function buildRelationshipPrompt(): string {
  const relationship = state.relationshipState
  const controller = state.petController
  if (!relationship || !controller) {
    return ''
  }
  const level = controller.getStateView().affectionLevel
  const { stage, changed } = relationship.refresh(level)
  if (changed) {
    state.longTermMemory?.remember(`关系进展：你和老师的关系进入「${stage.name}」阶段。`)
  }
  return relationshipPrompt(stage, relationship.daysKnown())
}

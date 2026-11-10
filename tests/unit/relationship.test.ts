import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  RELATIONSHIP_STAGES,
  relationshipPrompt,
  resolveRelationshipStage,
} from '../../src/shared/relationship'
import { RelationshipState } from '../../src/main/domain/relationship-state'

const dirs: string[] = []
function createState(): RelationshipState {
  const dir = mkdtempSync(join(tmpdir(), 'deskpet-rel-'))
  dirs.push(dir)
  return new RelationshipState(dir)
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('relationship stage', () => {
  it('maps affection levels to four stages', () => {
    expect(resolveRelationshipStage(1).name).toBe('认识')
    expect(resolveRelationshipStage(3).name).toBe('熟悉')
    expect(resolveRelationshipStage(5).name).toBe('信任')
    expect(resolveRelationshipStage(7).name).toBe('特别')
  })

  it('requires a lower level to downgrade (hysteresis)', () => {
    expect(resolveRelationshipStage(2, 2).id).toBe(2)
    expect(resolveRelationshipStage(5, 3).id).toBe(3)
    expect(resolveRelationshipStage(3, 3).id).toBe(2)
  })

  it('builds a prompt with days and stage', () => {
    const stage = RELATIONSHIP_STAGES[2]
    const prompt = relationshipPrompt(stage, 23)
    expect(prompt).toContain('23 天')
    expect(prompt).toContain('信任')
  })
})

describe('relationship state store', () => {
  it('reports stage changes and persists them', () => {
    const state = createState()
    expect(state.refresh(1).changed).toBe(false)
    // 每次 refresh 最多升一级，避免一次跨太多。
    expect(state.refresh(5).stage.name).toBe('熟悉')
    const upgraded = state.refresh(5)
    expect(upgraded.changed).toBe(true)
    expect(upgraded.stage.name).toBe('信任')
  })

  it('counts days since first seen', () => {
    const state = createState()
    const later = Date.now() + 3 * 24 * 60 * 60 * 1000
    expect(state.daysKnown(later)).toBe(4)
  })
})

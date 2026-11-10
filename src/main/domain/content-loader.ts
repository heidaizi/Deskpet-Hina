import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ActionsConfig, AffectionConfig, BehaviorBundle, DialoguesConfig } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readJson(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch (error) {
    throw new Error(`Unable to read content file ${filePath}: ${String(error)}`)
  }
}

function assertActions(value: unknown): asserts value is ActionsConfig {
  if (!isRecord(value) || !Array.isArray(value.rules) || value.rules.length === 0) {
    throw new Error('actions.json must contain a non-empty rules array.')
  }

  for (const [index, rule] of value.rules.entries()) {
    if (
      !isRecord(rule) ||
      typeof rule.id !== 'string' ||
      typeof rule.trigger !== 'string' ||
      typeof rule.area !== 'string' ||
      typeof rule.priority !== 'number' ||
      typeof rule.cooldownMs !== 'number' ||
      !Array.isArray(rule.conditions) ||
      !Array.isArray(rule.effects) ||
      typeof rule.animation !== 'string' ||
      typeof rule.expression !== 'string' ||
      typeof rule.dialoguePool !== 'string'
    ) {
      throw new Error(`actions.json rule ${index} is invalid.`)
    }
  }
}

function assertDialogues(value: unknown): asserts value is DialoguesConfig {
  if (!isRecord(value) || !isRecord(value.pools)) {
    throw new Error('dialogues.json must contain a pools object.')
  }

  for (const [poolId, pool] of Object.entries(value.pools)) {
    if (!isRecord(pool) || !Array.isArray(pool.entries) || pool.entries.length === 0) {
      throw new Error(`Dialogue pool ${poolId} must contain entries.`)
    }
    for (const entry of pool.entries) {
      if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.text !== 'string') {
        throw new Error(`Dialogue pool ${poolId} contains an invalid entry.`)
      }
    }
  }
}

function assertAffection(value: unknown): asserts value is AffectionConfig {
  if (
    !isRecord(value) ||
    !isRecord(value.starting) ||
    typeof value.dailyAffectionCap !== 'number' ||
    typeof value.affectionGainCooldownMs !== 'number' ||
    !isRecord(value.dailyRecovery) ||
    typeof value.dailyRecovery.mood !== 'number' ||
    typeof value.dailyRecovery.energy !== 'number' ||
    !isRecord(value.idleRecovery) ||
    typeof value.idleRecovery.mood !== 'number' ||
    typeof value.idleRecovery.energy !== 'number' ||
    typeof value.idleRecovery.intervalMs !== 'number' ||
    value.idleRecovery.intervalMs <= 0 ||
    !Array.isArray(value.levels) ||
    value.levels.length === 0
  ) {
    throw new Error('affection.json is invalid.')
  }

  for (const level of value.levels) {
    if (
      !isRecord(level) ||
      typeof level.level !== 'number' ||
      typeof level.minXp !== 'number' ||
      typeof level.title !== 'string' ||
      !Array.isArray(level.unlocks) ||
      !level.unlocks.every((unlock) => typeof unlock === 'string')
    ) {
      throw new Error('affection.json contains an invalid level.')
    }
  }
}

export function loadContent(rootPath: string): BehaviorBundle {
  const actions = readJson(join(rootPath, 'actions.json'))
  const dialogues = readJson(join(rootPath, 'dialogues.json'))
  const affection = readJson(join(rootPath, 'affection.json'))
  const character = readJson(join(rootPath, 'character.json'))

  assertActions(actions)
  assertDialogues(dialogues)
  assertAffection(affection)
  if (
    !isRecord(character) ||
    typeof character.id !== 'string' ||
    typeof character.displayName !== 'string' ||
    !Array.isArray(character.renderers) ||
    character.renderers.length === 0
  ) {
    throw new Error('character.json is invalid.')
  }
  if (process.env.DESKPET_3D_ASSET_PATH) {
    const vrmRenderer = (character.renderers as Array<{ mode?: string; assetPath?: string }>).find(
      (renderer) => renderer.mode === '3d',
    )
    if (vrmRenderer) {
      vrmRenderer.assetPath = process.env.DESKPET_3D_ASSET_PATH
    }
  }

  return {
    character: character as unknown as BehaviorBundle['character'],
    actions,
    dialogues,
    affection,
  }
}

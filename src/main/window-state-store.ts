import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SavedWindowState } from '../shared/types'

function isSavedWindowState(value: unknown): value is SavedWindowState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const state = value as Partial<SavedWindowState>
  return (
    Number.isFinite(state.x) &&
    Number.isFinite(state.y) &&
    Number.isFinite(state.width) &&
    Number.isFinite(state.height) &&
    Number.isFinite(state.displayId)
  )
}

export function readWindowState(filePath: string): SavedWindowState | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    return isSavedWindowState(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeWindowState(filePath: string, state: SavedWindowState): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  renameSync(temporaryPath, filePath)

  if (!existsSync(filePath)) {
    rmSync(temporaryPath, { force: true })
    throw new Error('Failed to persist window state.')
  }
}

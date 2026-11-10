import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { rotateServerLog } from '../domain/tts-maintenance'

const MAX_BYTES = 512 * 1024
const BACKUPS = 2

export interface RecordedError {
  at: number
  kind: string
  message: string
}

let lastError: RecordedError | null = null

function errorLogPath(): string | null {
  try {
    return join(app.getPath('userData'), 'logs', 'main-errors.log')
  } catch {
    // 应用尚未初始化到可以解析 userData 时，只保留内存中的最后一条。
    return null
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/**
 * 记录主进程异常。日志自身失败不能影响主流程，因此全部吞掉异常。
 */
export function recordError(kind: string, error: unknown): RecordedError {
  const message = describe(error).slice(0, 800)
  const entry: RecordedError = { at: Date.now(), kind, message }
  lastError = entry

  const path = errorLogPath()
  if (!path) {
    return entry
  }

  try {
    mkdirSync(dirname(path), { recursive: true })
    rotateServerLog(path, { maxBytes: MAX_BYTES, backups: BACKUPS })
    appendFileSync(path, `${new Date(entry.at).toISOString()} [${kind}] ${message}\n`, 'utf8')
  } catch {
    // 日志写入失败时只保留内存副本。
  }

  return entry
}

export function getLastError(): RecordedError | null {
  return lastError
}

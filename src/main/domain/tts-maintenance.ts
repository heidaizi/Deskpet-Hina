import { existsSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

// 语音缓存文件名是 sha256 十六进制摘要，临时文件形如 `<key>.raw.wav` 或 `<key>.<pid>.wav`，
// 用严格模式只匹配最终产物，避免清理到正在进行中的写入。
const CACHE_FILE_PATTERN = /^[a-f0-9]{64}\.wav$/u

export interface CachePruneOptions {
  maxBytes: number
  maxFiles: number
  /** 保护最近写入的文件，避免删除正在被读取或尚未稳定落盘的缓存。 */
  minAgeMs?: number
  now?: number
}

export interface CachePruneResult {
  files: number
  bytes: number
  removed: number
  freedBytes: number
}

export interface LogRotationOptions {
  maxBytes: number
  backups: number
}

export function pruneTtsCache(directory: string, options: CachePruneOptions): CachePruneResult {
  const result: CachePruneResult = { files: 0, bytes: 0, removed: 0, freedBytes: 0 }

  let names: string[]
  try {
    names = readdirSync(directory)
  } catch {
    return result
  }

  const entries: Array<{ path: string; size: number; mtimeMs: number }> = []
  for (const name of names) {
    if (!CACHE_FILE_PATTERN.test(name)) {
      continue
    }
    const path = join(directory, name)
    try {
      const stat = statSync(path)
      if (!stat.isFile()) {
        continue
      }
      entries.push({ path, size: stat.size, mtimeMs: stat.mtimeMs })
      result.files += 1
      result.bytes += stat.size
    } catch {
      // 并发删除或权限问题不应中断清理。
    }
  }

  if (result.bytes <= options.maxBytes && result.files <= options.maxFiles) {
    return result
  }

  const minAgeMs = options.minAgeMs ?? 60_000
  const now = options.now ?? Date.now()
  entries.sort((left, right) => left.mtimeMs - right.mtimeMs)

  for (const entry of entries) {
    if (result.bytes <= options.maxBytes && result.files <= options.maxFiles) {
      break
    }
    // 已按时间升序排列，当前文件都还没达到保护期时，后面的文件只会更年轻。
    if (now - entry.mtimeMs < minAgeMs) {
      break
    }
    try {
      unlinkSync(entry.path)
      result.files -= 1
      result.bytes -= entry.size
      result.removed += 1
      result.freedBytes += entry.size
    } catch {
      // 删除失败时保持原状，下次清理再试。
    }
  }

  return result
}

export function rotateServerLog(path: string, options: LogRotationOptions): boolean {
  let size: number
  try {
    if (!existsSync(path)) {
      return false
    }
    const stat = statSync(path)
    if (!stat.isFile()) {
      return false
    }
    size = stat.size
  } catch {
    return false
  }

  if (size < options.maxBytes) {
    return false
  }

  const backups = Math.max(1, Math.floor(options.backups))
  try {
    // 从最旧的一份开始依次后移，最后把当前日志变成 `.1`。
    for (let index = backups; index >= 1; index -= 1) {
      const source = index === 1 ? path : `${path}.${index - 1}`
      if (!existsSync(source)) {
        continue
      }
      renameSync(source, `${path}.${index}`)
    }
    return true
  } catch {
    return false
  }
}

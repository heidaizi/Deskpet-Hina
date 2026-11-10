import { existsSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pruneTtsCache, rotateServerLog } from '../../src/main/domain/tts-maintenance'

const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)
const KEY_C = 'c'.repeat(64)
// utimesSync 以秒为单位，而缓存判定使用 mtimeMs，这里统一用一个固定基准换算。
const BASE_SECONDS = 1_700_000_000

function makeCacheFile(
  directory: string,
  key: string,
  bytes: number,
  offsetSeconds: number,
): string {
  const path = join(directory, `${key}.wav`)
  writeFileSync(path, Buffer.alloc(bytes))
  const seconds = BASE_SECONDS + offsetSeconds
  utimesSync(path, seconds, seconds)
  return path
}

describe('TTS cache maintenance', () => {
  it('removes the oldest entries until both limits are satisfied', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deskpet-cache-'))
    try {
      const oldest = makeCacheFile(directory, KEY_A, 400, 0)
      const middle = makeCacheFile(directory, KEY_B, 400, 10)
      const newest = makeCacheFile(directory, KEY_C, 400, 20)

      const result = pruneTtsCache(directory, {
        maxBytes: 900,
        maxFiles: 10,
        minAgeMs: 0,
        now: (BASE_SECONDS + 100) * 1_000,
      })

      expect(result.removed).toBe(1)
      expect(result.freedBytes).toBe(400)
      expect(result.files).toBe(2)
      expect(result.bytes).toBe(800)
      expect(existsSync(oldest)).toBe(false)
      expect(existsSync(middle)).toBe(true)
      expect(existsSync(newest)).toBe(true)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('enforces the file count limit independently of the byte limit', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deskpet-cache-'))
    try {
      makeCacheFile(directory, KEY_A, 10, 0)
      makeCacheFile(directory, KEY_B, 10, 10)
      makeCacheFile(directory, KEY_C, 10, 20)

      const result = pruneTtsCache(directory, {
        maxBytes: 1_000_000,
        maxFiles: 2,
        minAgeMs: 0,
        now: (BASE_SECONDS + 100) * 1_000,
      })

      expect(result.removed).toBe(1)
      expect(result.files).toBe(2)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('keeps recently written files and ignores temporary artifacts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deskpet-cache-'))
    try {
      const fresh = makeCacheFile(directory, KEY_A, 400, 90)
      writeFileSync(join(directory, `${KEY_B}.raw.wav`), Buffer.alloc(400))
      writeFileSync(join(directory, `${KEY_C}.12345.wav`), Buffer.alloc(400))

      const result = pruneTtsCache(directory, {
        maxBytes: 100,
        maxFiles: 1,
        minAgeMs: 60_000,
        now: (BASE_SECONDS + 100) * 1_000,
      })

      expect(result.removed).toBe(0)
      expect(existsSync(fresh)).toBe(true)
      expect(existsSync(join(directory, `${KEY_B}.raw.wav`))).toBe(true)
      expect(existsSync(join(directory, `${KEY_C}.12345.wav`))).toBe(true)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('returns a zeroed result for a missing directory', () => {
    const result = pruneTtsCache(join(tmpdir(), 'deskpet-cache-missing'), {
      maxBytes: 1,
      maxFiles: 1,
    })
    expect(result).toEqual({ files: 0, bytes: 0, removed: 0, freedBytes: 0 })
  })
})

describe('TTS server log rotation', () => {
  it('rotates an oversized log and shifts existing backups', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deskpet-log-'))
    try {
      const path = join(directory, 'irodori-server.log')
      writeFileSync(path, 'x'.repeat(300))
      writeFileSync(`${path}.1`, 'previous')

      expect(rotateServerLog(path, { maxBytes: 200, backups: 5 })).toBe(true)
      expect(existsSync(path)).toBe(false)
      expect(statSync(`${path}.1`).size).toBe(300)
      expect(statSync(`${path}.2`).size).toBe(8)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('leaves small logs alone', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deskpet-log-'))
    try {
      const path = join(directory, 'irodori-server.log')
      writeFileSync(path, 'small')

      expect(rotateServerLog(path, { maxBytes: 200, backups: 2 })).toBe(false)
      expect(existsSync(path)).toBe(true)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('shifts backups and keeps the newest ones', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deskpet-log-'))
    try {
      const path = join(directory, 'irodori-server.log')
      writeFileSync(path, 'y'.repeat(300))
      writeFileSync(`${path}.1`, 'backup-1')
      writeFileSync(`${path}.2`, 'backup-2')

      expect(rotateServerLog(path, { maxBytes: 200, backups: 2 })).toBe(true)
      expect(statSync(`${path}.1`).size).toBe(300)
      expect(statSync(`${path}.2`).size).toBe(8)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('reports no rotation when the log does not exist', () => {
    expect(
      rotateServerLog(join(tmpdir(), 'missing-deskpet.log'), { maxBytes: 1, backups: 2 }),
    ).toBe(false)
  })
})

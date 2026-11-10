import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'

/**
 * AivisSpeech 引擎的生命周期管理。
 *
 * 引擎是一个独立的 Python 进程，提供 VOICEVOX 兼容 API（默认 10101 端口）。
 * 只有设置里选了 aivis 引擎才会启动，退出时关闭。
 */

const DEFAULT_PORT = 10101

let engineProcess: ChildProcess | null = null

export function resolveEngineDirectory(homeDir: string): string {
  const override = process.env.DESKPET_AIVIS_ENGINE
  if (override) {
    return override
  }
  return join(homeDir, 'Library', 'Deskpet', 'engine')
}

export function engineBaseUrl(): string {
  return process.env.DESKPET_AIVIS_URL ?? `http://127.0.0.1:${DEFAULT_PORT}`
}

export async function isAivisEngineReady(timeoutMs = 1500): Promise<boolean> {
  try {
    const response = await fetch(`${engineBaseUrl()}/speakers`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    return response.ok
  } catch {
    return false
  }
}

async function waitForReady(timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isAivisEngineReady()) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

/** 返回是否可用；失败时记录原因但不抛异常。 */
export async function ensureAivisEngine(
  homeDir: string,
  log: (message: string) => void,
): Promise<boolean> {
  if (await isAivisEngineReady()) {
    return true
  }
  if (engineProcess && !engineProcess.killed) {
    return waitForReady()
  }
  const engineDir = resolveEngineDirectory(homeDir)
  const binary = join(engineDir, 'run')
  if (!existsSync(binary)) {
    log(`AivisSpeech 引擎不存在：${binary}`)
    return false
  }
  try {
    // 保留引擎输出，否则崩溃时完全没有线索。
    const logDir = join(homeDir, 'Library', 'Logs', 'Deskpet')
    let logFd: number | undefined
    try {
      mkdirSync(logDir, { recursive: true })
      logFd = openSync(join(logDir, 'aivis-engine.log'), 'a')
    } catch {
      logFd = undefined
    }
    const child = spawn(binary, ['--host', '127.0.0.1', '--port', String(DEFAULT_PORT)], {
      cwd: engineDir,
      stdio: ['ignore', logFd ?? 'ignore', logFd ?? 'ignore'],
      detached: false,
    })
    if (logFd !== undefined) {
      try {
        closeSync(logFd)
      } catch {
        // 子进程已继承 fd，父进程关闭即可
      }
    }
    child.once('exit', () => {
      if (engineProcess === child) {
        engineProcess = null
      }
    })
    engineProcess = child
    const ready = await waitForReady()
    if (!ready) {
      log('AivisSpeech 引擎启动超时')
    }
    return ready
  } catch (error) {
    log(`AivisSpeech 引擎启动失败：${String(error)}`)
    return false
  }
}

export function stopAivisEngine(): void {
  if (engineProcess && !engineProcess.killed) {
    engineProcess.kill('SIGTERM')
  }
  engineProcess = null
}

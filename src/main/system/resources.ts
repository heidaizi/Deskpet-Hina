import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ResourceSnapshot, TtsResourceStatus } from '../../shared/types'
import { state } from '../app-state'

const execFileAsync = promisify(execFile)

export async function getResourceSnapshot(): Promise<ResourceSnapshot> {
  const metrics = app.getAppMetrics()
  const appMemoryMB = metrics.reduce(
    (total, metric) => total + (metric.memory?.workingSetSize ?? 0) / 1024,
    0,
  )
  const appCpuPercent = metrics.reduce(
    (total, metric) => total + (metric.cpu?.percentCPUUsage ?? 0),
    0,
  )
  const tts: TtsResourceStatus = state.localTtsService?.getStatus() ?? {
    enabled: false,
    state: 'disabled',
  }
  const userDataPath = app.getPath('userData')

  return {
    tts,
    appCpuPercent,
    appMemoryMB,
    ttsMemoryMB: await readProcessMemoryMB(tts.pid),
    cacheBytes: getDirectorySizeBytes(join(userDataPath, 'tts-cache')),
    logBytes: getFileSizeBytes(join(userDataPath, 'irodori-server.log')),
  }
}

export async function readProcessMemoryMB(pid: number | undefined): Promise<number | null> {
  if (!pid) {
    return null
  }
  try {
    const { stdout } = await execFileAsync('/bin/ps', ['-o', 'rss=', '-p', String(pid)])
    const residentKb = Number(stdout.trim())
    return Number.isFinite(residentKb) && residentKb > 0 ? residentKb / 1024 : null
  } catch {
    return null
  }
}

export function getDirectorySizeBytes(rootPath: string): number {
  if (!existsSync(rootPath)) {
    return 0
  }

  let total = 0
  const pendingDirectories = [rootPath]
  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop()
    if (!directory) {
      continue
    }
    try {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const entryPath = join(directory, entry.name)
        if (entry.isDirectory()) {
          pendingDirectories.push(entryPath)
        } else if (entry.isFile()) {
          total += statSync(entryPath).size
        }
      }
    } catch (error) {
      console.error(`Unable to inspect resource directory ${directory}:`, error)
    }
  }
  return total
}

export function getFileSizeBytes(filePath: string): number {
  if (!existsSync(filePath)) {
    return 0
  }
  try {
    return statSync(filePath).size
  } catch {
    return 0
  }
}

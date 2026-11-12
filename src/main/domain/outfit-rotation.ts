import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { CharacterRendererOption } from '../../shared/types'

const DAY_MS = 24 * 60 * 60 * 1000

interface RotationFile {
  schemaVersion: number
  lastSwitchAt: number
}

let rotationStore: OutfitRotationStore | null = null
let applying = false

export function isApplyingRotation(): boolean {
  return applying
}

/** 依次循环选择下一套可用 3D 服装。 */
export function pickNextOutfit(
  renderers: readonly CharacterRendererOption[],
  currentId: string,
): string | null {
  const outfits = renderers.filter(
    (renderer) => renderer.mode === '3d' && renderer.status === 'available',
  )
  if (outfits.length <= 1) {
    return null
  }
  const index = outfits.findIndex((renderer) => renderer.id === currentId)
  return outfits[(index + 1) % outfits.length].id
}

export function rotationDue(lastSwitchAt: number, days: number, now = Date.now()): boolean {
  if (days <= 0) {
    return false
  }
  return now - lastSwitchAt >= days * DAY_MS
}

export class OutfitRotationStore {
  private readonly filePath: string
  private lastSwitchAt = 0

  constructor(userDataPath: string, now = Date.now()) {
    this.filePath = join(userDataPath, 'outfit-rotation.json')
    this.load(now)
  }

  private load(now: number): void {
    if (!existsSync(this.filePath)) {
      this.lastSwitchAt = now
      this.persist()
      return
    }
    try {
      const data = JSON.parse(readFileSync(this.filePath, 'utf8')) as RotationFile
      this.lastSwitchAt = Number(data.lastSwitchAt) || now
    } catch {
      this.lastSwitchAt = now
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const data: RotationFile = { schemaVersion: 1, lastSwitchAt: this.lastSwitchAt }
    writeFileSync(this.filePath, JSON.stringify(data, null, 2) + '\n')
  }

  getLastSwitchAt(): number {
    return this.lastSwitchAt
  }

  markSwitched(now = Date.now()): void {
    this.lastSwitchAt = now
    this.persist()
  }
}

export function getOutfitRotationStore(): OutfitRotationStore | null {
  return rotationStore
}

export interface OutfitRotationOptions {
  getSettings: () => {
    outfitRotationEnabled: boolean
    outfitRotationDays: number
    rendererId: string
    rendererMode: '2d' | '3d'
  }
  getRenderers: () => readonly CharacterRendererOption[]
  apply: (rendererId: string) => void
  intervalMs?: number
}

/** 定时检查并按天轮换服装；手动选择会重置计时。 */
export function startOutfitRotation(options: OutfitRotationOptions): () => void {
  const check = (): void => {
    const settings = options.getSettings()
    if (!settings.outfitRotationEnabled || settings.rendererMode !== '3d') {
      return
    }
    if (!rotationStore) {
      return
    }
    if (!rotationDue(rotationStore.getLastSwitchAt(), settings.outfitRotationDays)) {
      return
    }
    const next = pickNextOutfit(options.getRenderers(), settings.rendererId)
    if (!next) {
      return
    }
    applying = true
    try {
      options.apply(next)
      rotationStore.markSwitched()
    } finally {
      applying = false
    }
  }

  check()
  const timer = setInterval(check, options.intervalMs ?? 30 * 60_000)
  timer.unref?.()
  return () => clearInterval(timer)
}

export function initOutfitRotationStore(userDataPath: string): OutfitRotationStore {
  rotationStore = new OutfitRotationStore(userDataPath)
  return rotationStore
}

/** 用户手动切换服装时调用，重置轮换计时。 */
export function noteManualOutfitChange(now = Date.now()): void {
  if (rotationStore && !applying) {
    rotationStore.markSwitched(now)
  }
}

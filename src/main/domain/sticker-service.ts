import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { StickerPackView, StickerView } from '../../shared/stickers'

const MAX_STICKER_BYTES = 3 * 1024 * 1024
const ID_PATTERN = /^[a-z0-9][a-z0-9-_]{0,63}$/u
const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

interface StickerManifestEntry {
  id?: unknown
  file?: unknown
  label?: unknown
  emotion?: unknown
  tags?: unknown
  adjective?: unknown
}

interface StickerManifest {
  schemaVersion?: unknown
  stickers?: unknown
  outfits?: unknown
}

interface StickerOutfit {
  directory?: unknown
  stickers?: unknown
}

export class StickerService {
  private readonly pack: StickerPackView

  constructor(private readonly directory: string) {
    this.pack = this.load()
  }

  private load(): StickerPackView {
    const manifestPath = join(this.directory, 'manifest.json')
    if (!existsSync(manifestPath)) {
      return {
        stickers: [],
        directory: this.directory,
        error: '还没有贴纸素材：把 manifest.json 和图片放进素材目录即可。',
      }
    }
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as StickerManifest
      const stickers: StickerView[] = []
      const ids = new Set<string>()
      if (manifest.outfits && typeof manifest.outfits === 'object') {
        for (const [outfitId, value] of Object.entries(
          manifest.outfits as Record<string, StickerOutfit>,
        )) {
          if (!Array.isArray(value?.stickers)) {
            continue
          }
          for (const raw of value.stickers as StickerManifestEntry[]) {
            const sticker = this.parseEntry(raw, ids, outfitId)
            if (sticker) {
              stickers.push(sticker)
            }
          }
        }
        return { stickers, directory: this.directory }
      }
      if (!Array.isArray(manifest.stickers)) {
        return {
          stickers: [],
          directory: this.directory,
          error: 'manifest.json 缺少 stickers 数组。',
        }
      }
      for (const raw of manifest.stickers as StickerManifestEntry[]) {
        const sticker = this.parseEntry(raw, ids)
        if (sticker) {
          stickers.push(sticker)
        }
      }
      return { stickers, directory: this.directory }
    } catch (error) {
      return {
        stickers: [],
        directory: this.directory,
        error: `manifest.json 解析失败：${String(error)}`,
      }
    }
  }

  private parseEntry(
    raw: StickerManifestEntry,
    ids: Set<string>,
    outfit?: string,
  ): StickerView | null {
    const id = typeof raw.id === 'string' ? raw.id : ''
    const file = typeof raw.file === 'string' ? raw.file : ''
    const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 30) : ''
    if (!ID_PATTERN.test(id) || ids.has(id) || !file || !label) {
      return null
    }
    const extension = file.slice(file.lastIndexOf('.')).toLowerCase()
    const mime = MIME_TYPES[extension]
    if (!mime || file.includes('..')) {
      return null
    }
    const path = resolve(this.directory, file)
    if (!path.startsWith(this.directory + '/') || !existsSync(path)) {
      return null
    }
    try {
      if (statSync(path).size > MAX_STICKER_BYTES) {
        return null
      }
      const dataUrl = `data:${mime};base64,${readFileSync(path).toString('base64')}`
      ids.add(id)
      return {
        id,
        label,
        dataUrl,
        ...(outfit ? { outfit } : {}),
        ...(typeof raw.adjective === 'string' ? { adjective: raw.adjective } : {}),
        ...(typeof raw.emotion === 'string' ? { emotion: raw.emotion } : {}),
        ...(Array.isArray(raw.tags)
          ? { tags: raw.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8) }
          : {}),
      }
    } catch {
      return null
    }
  }

  list(): StickerPackView {
    return {
      stickers: this.pack.stickers,
      directory: this.pack.directory,
      ...(this.pack.error ? { error: this.pack.error } : {}),
    }
  }

  get(id: string): StickerView | undefined {
    return this.pack.stickers.find((sticker) => sticker.id === id)
  }

  listFor(outfitId: string): StickerPackView {
    const stickers = this.pack.stickers.filter(
      (sticker) => !sticker.outfit || sticker.outfit === outfitId,
    )
    return {
      stickers,
      directory: this.pack.directory,
      ...(this.pack.error ? { error: this.pack.error } : {}),
    }
  }
}

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { StickerService } from '../../src/main/domain/sticker-service'

// 1x1 透明 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)
const dirs: string[] = []

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deskpet-stickers-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('sticker service', () => {
  it('loads valid stickers and skips broken entries', () => {
    const dir = makeDir()
    writeFileSync(join(dir, 'ok.png'), PNG)
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        stickers: [
          { id: 'ok-1', file: 'ok.png', label: '开心' },
          { id: 'missing', file: 'missing.png', label: '不存在' },
          { id: 'ok-1', file: 'ok.png', label: '重复' },
          { id: 'bad ext', file: 'ok.png', label: '坏 id' },
          { id: 'ok-2', file: 'ok.txt', label: '坏格式' },
        ],
      }),
    )
    const service = new StickerService(dir)
    const pack = service.list()
    expect(pack.stickers).toHaveLength(1)
    expect(pack.stickers[0]).toMatchObject({ id: 'ok-1', label: '开心' })
    expect(pack.stickers[0].dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(service.get('ok-1')?.label).toBe('开心')
  })

  it('returns an empty pack with a hint when the manifest is missing', () => {
    const dir = makeDir()
    const pack = new StickerService(dir).list()
    expect(pack.stickers).toEqual([])
    expect(pack.error).toContain('manifest')
    expect(pack.directory).toBe(dir)
  })

  it('reports a broken manifest instead of throwing', () => {
    const dir = makeDir()
    writeFileSync(join(dir, 'manifest.json'), '{not json')
    const pack = new StickerService(dir).list()
    expect(pack.stickers).toEqual([])
    expect(pack.error).toContain('解析失败')
  })
})

describe('sticker packs per outfit', () => {
  it('loads schema v2 outfits and filters by outfit', () => {
    const dir = makeDir()
    mkdirSync(join(dir, 'faces'))
    writeFileSync(join(dir, 'faces', 'a.png'), PNG)
    writeFileSync(join(dir, 'faces', 'b.png'), PNG)
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 2,
        outfits: {
          'hina-swimsuit': {
            directory: 'faces',
            stickers: [
              {
                id: 'swim-a',
                file: 'faces/a.png',
                label: '平静',
                adjective: 'calm',
                emotion: 'calm',
              },
            ],
          },
          'hina-normal': {
            directory: 'faces',
            stickers: [
              {
                id: 'normal-b',
                file: 'faces/b.png',
                label: '开心',
                adjective: 'happy',
                emotion: 'happy',
              },
            ],
          },
        },
      }),
    )
    const service = new StickerService(dir)
    expect(service.list().stickers).toHaveLength(2)
    expect(service.listFor('hina-swimsuit').stickers.map((s) => s.id)).toEqual(['swim-a'])
    expect(service.listFor('hina-normal').stickers[0]).toMatchObject({
      id: 'normal-b',
      outfit: 'hina-normal',
      adjective: 'happy',
    })
    expect(service.listFor('hina-dress').stickers).toEqual([])
  })
})

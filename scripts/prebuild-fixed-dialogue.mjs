#!/usr/bin/env node
// 为所有固定台词（tts-ja.json）生成预置语音，补齐预生成清单。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const base = process.env.DESKPET_AIVIS_URL ?? 'http://127.0.0.1:10101'
const tts = JSON.parse(readFileSync(join(root, 'content/tts-ja.json'), 'utf8'))
const outDir = join(
  root,
  'assets/characters/hina-swimsuit/private/audio/generated-dialogue/prebuilt-v2',
)
mkdirSync(outDir, { recursive: true })

const speakers = await (await fetch(`${base}/speakers`)).json()
const hina = speakers.find((s) => s.name === 'hina')
if (!hina) {
  console.error('引擎未加载 hina 模型')
  process.exit(1)
}
const styles = Object.fromEntries(hina.styles.map((s) => [s.name.toLowerCase(), s.id]))
const STYLE = {
  angry: 'annoyed',
  annoyed: 'annoyed',
  stern: 'annoyed',
  reluctant: 'annoyed',
  embarrassed: 'soft',
  happy: 'soft',
  soft: 'soft',
  tired: 'soft',
  sad: 'soft',
  calm: 'neutral',
}

const entries = []
let index = 0
for (const [display, line] of Object.entries(tts.lines ?? {})) {
  const text = line.text?.trim()
  if (!text) continue
  const style = styles[STYLE[line.emotion?.toLowerCase()] ?? 'neutral'] ?? hina.styles[0].id
  const q = await fetch(
    `${base}/audio_query?text=${encodeURIComponent(normalizeTtsText(text))}&speaker=${style}`,
    {
      method: 'POST',
    },
  )
  const query = await q.json()
  const r = await fetch(`${base}/synthesis?speaker=${style}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(query),
  })
  const buffer = Buffer.from(await r.arrayBuffer())
  const name = `fixed-${String(index + 1).padStart(2, '0')}.wav`
  const path = join(outDir, name)
  writeFileSync(path, buffer)
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const byteRate = view.getUint32(28, true)
  entries.push({
    text: display,
    japanese: text,
    emotion: line.emotion ?? 'neutral',
    path: `assets/characters/hina-swimsuit/private/audio/generated-dialogue/prebuilt-v2/${name}`,
    durationSeconds: byteRate > 0 ? Number(((buffer.length - 44) / byteRate).toFixed(2)) : 0,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  })
  index += 1
}

const manifestPath = join(root, 'content/prebuilt-tts-supplemental.json')
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : { schemaVersion: 1, entries: [] }
manifest.entries = entries
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`已生成 ${entries.length} 条固定台词`)

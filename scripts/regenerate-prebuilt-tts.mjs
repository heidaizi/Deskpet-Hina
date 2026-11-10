#!/usr/bin/env node
// 用 AivisSpeech 引擎重新生成预生成台词（替换旧声线）。
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = process.cwd()
const base = process.env.DESKPET_AIVIS_URL ?? 'http://127.0.0.1:10101'
function normalizeTtsText(value) {
  return value
    .replace(/^[\s…‥.．・]+/u, '')
    .replace(/[…‥]{2,}/gu, '、')
    .replace(/…/gu, '、')
    .replace(/[、,，]\s*[、,，]+/gu, '、')
    .replace(/^[、,，\s]+/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

const manifestPath = join(root, 'content/prebuilt-tts-ja.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const STYLE = {
  angry: 'annoyed',
  annoyed: 'annoyed',
  stern: 'annoyed',
  embarrassed: 'soft',
  happy: 'soft',
  soft: 'soft',
  tired: 'soft',
  sad: 'soft',
}

const speakers = await (await fetch(`${base}/speakers`)).json()
const hina = speakers.find((s) => s.name === 'hina')
if (!hina) {
  console.error('引擎未加载 hina 模型')
  process.exit(1)
}
const styles = Object.fromEntries(hina.styles.map((s) => [s.name.toLowerCase(), s.id]))

mkdirSync(join(root, 'build/prebuilt-backup'), { recursive: true })

function wavSeconds(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const byteRate = view.getUint32(28, true)
  return byteRate > 0 ? (bytes.length - 44) / byteRate : 0
}

let done = 0
for (const entry of manifest.entries) {
  const path = join(root, entry.path)
  copyFileSync(path, join(root, 'build/prebuilt-backup', entry.path.split('/').pop()))
  const style = styles[STYLE[entry.emotion?.toLowerCase()] ?? 'neutral'] ?? hina.styles[0].id
  const q = await fetch(
    `${base}/audio_query?text=${encodeURIComponent(normalizeTtsText(entry.japanese))}&speaker=${style}`,
    { method: 'POST' },
  )
  const query = await q.json()
  const r = await fetch(`${base}/synthesis?speaker=${style}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(query),
  })
  const buffer = Buffer.from(await r.arrayBuffer())
  writeFileSync(path, buffer)
  entry.durationSeconds = Number(wavSeconds(buffer).toFixed(2))
  entry.sha256 = createHash('sha256').update(buffer).digest('hex')
  done += 1
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`已重新生成 ${done} 条`)

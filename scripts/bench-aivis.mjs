#!/usr/bin/env node

// AivisSpeech（VOICEVOX 兼容 API）基准。
// 与 bench-tts.mjs 用同一 20 句，便于横向对比。
//
// 用法：node scripts/bench-aivis.mjs [--speaker 888753760] [--repeat 1]
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const base = process.env.AIVIS_BASE ?? 'http://127.0.0.1:10101'
const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index < 0 ? fallback : args[index + 1]
}
const repeat = Number(flag('repeat', 1))

const speakersResponse = await fetch(`${base}/speakers`)
if (!speakersResponse.ok) {
  console.error(`无法读取 /speakers：HTTP ${speakersResponse.status}`)
  process.exit(1)
}
const speakers = await speakersResponse.json()
const styleId = Number(flag('speaker', speakers?.[0]?.styles?.[0]?.id ?? 0))
const speakerName = speakers?.find((s) => s.styles?.some((st) => st.id === styleId))?.name ?? '?'
const styleName =
  speakers?.flatMap((s) => s.styles ?? []).find((st) => st.id === styleId)?.name ?? '?'
console.log(`引擎：${base}  说话人：${speakerName} / ${styleName} (styleId=${styleId})`)

const config = JSON.parse(readFileSync(join(root, 'scripts/tts-bench-sentences.json'), 'utf8'))

function wavSeconds(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const byteRate = view.getUint32(28, true)
  return byteRate > 0 ? (bytes.length - 44) / byteRate : 0
}

async function measure(sentence) {
  const startedAt = performance.now()
  const queryResponse = await fetch(
    `${base}/audio_query?text=${encodeURIComponent(sentence.text)}&speaker=${styleId}`,
    { method: 'POST' },
  )
  if (!queryResponse.ok) throw new Error(`audio_query HTTP ${queryResponse.status}`)
  const query = await queryResponse.json()
  const queryMs = performance.now() - startedAt

  const synthesisStartedAt = performance.now()
  const synthesisResponse = await fetch(`${base}/synthesis?speaker=${styleId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(query),
  })
  if (!synthesisResponse.ok) throw new Error(`synthesis HTTP ${synthesisResponse.status}`)
  const bytes = new Uint8Array(await synthesisResponse.arrayBuffer())
  const synthesisMs = performance.now() - synthesisStartedAt
  return {
    id: sentence.id,
    category: sentence.category,
    chars: Array.from(sentence.text).length,
    queryMs: Math.round(queryMs),
    firstChunkMs: Math.round(queryMs + synthesisMs),
    totalMs: Math.round(performance.now() - startedAt),
    audioSeconds: Number(wavSeconds(bytes).toFixed(2)),
  }
}

const results = []
for (const sentence of config.sentences) {
  for (let round = 0; round < repeat; round += 1) {
    try {
      const result = await measure(sentence)
      results.push(result)
      console.log(
        `${result.id.padEnd(12)} ${String(result.chars).padStart(3)}字  ` +
          `query ${String(result.queryMs).padStart(4)}ms  合成 ${String(result.totalMs - result.queryMs).padStart(5)}ms  ` +
          `总 ${String(result.totalMs).padStart(5)}ms  音频 ${result.audioSeconds}s`,
      )
    } catch (error) {
      console.log(`${sentence.id.padEnd(12)} 失败：${error.message}`)
    }
  }
}

const byCategory = new Map()
for (const result of results) {
  const list = byCategory.get(result.category) ?? []
  list.push(result)
  byCategory.set(result.category, list)
}
console.log('\n分类均值（首包 / 总耗时）:')
for (const [category, list] of byCategory) {
  const avg = (key) => Math.round(list.reduce((sum, item) => sum + item[key], 0) / list.length)
  console.log(`  ${category.padEnd(8)} 首包 ${avg('firstChunkMs')}ms  总 ${avg('totalMs')}ms`)
}

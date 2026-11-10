#!/usr/bin/env node

// TTS 选型基准：对 OpenAI 兼容的 /v1/audio/speech 测量首包与整句耗时。
// 支持普通整块返回与 SSE 流式（stream_format: 'sse'）。
//
// 用法：
//   node scripts/bench-tts.mjs                     # 非流式
//   node scripts/bench-tts.mjs --stream            # 流式，测首块
//   node scripts/bench-tts.mjs --steps 16 --repeat 2

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const endpoint = process.env.TTS_ENDPOINT ?? 'http://127.0.0.1:8788/v1/audio/speech'
const voice = process.env.TTS_VOICE ?? 'hina-swimsuit'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  if (index < 0) return fallback
  const value = args[index + 1]
  return value && !value.startsWith('--') ? value : true
}
const stream = Boolean(flag('stream', false))
const steps = Number(flag('steps', 24))
const repeat = Number(flag('repeat', 1))

const config = JSON.parse(readFileSync(join(root, 'scripts/tts-bench-sentences.json'), 'utf8'))

function wavDurationSeconds(buffer) {
  // 解析 PCM WAV 的 data 段大小与采样率，估算音频时长。
  if (buffer.length < 44) return 0
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const byteRate = view.getUint32(28, true)
  return byteRate > 0 ? (buffer.length - 44) / byteRate : 0
}

function requestBody(text) {
  return JSON.stringify({
    model: 'irodori-tts',
    input: text,
    voice,
    response_format: 'wav',
    ...(stream ? { stream_format: 'sse' } : {}),
    irodori: {
      num_steps: steps,
      ...(stream
        ? { chunking_enabled: true, chunk_min_chars: 14, first_sentence_chunk_min_chars: 10 }
        : {}),
    },
  })
}

async function measure(sentence) {
  const startedAt = performance.now()
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: requestBody(sentence.text),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 120)}`)
  }

  let firstByteAt = 0
  let audioBytes = 0
  let chunks = 0

  if (!stream) {
    const buffer = new Uint8Array(await response.arrayBuffer())
    firstByteAt = performance.now() - startedAt
    audioBytes = buffer.byteLength
    chunks = 1
  } else {
    const reader = response.body.getReader()
    let buffer = ''
    const decoder = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const event = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')
        const dataLine = event.split('\n').find((line) => line.startsWith('data:'))
        if (!dataLine) continue
        try {
          const payload = JSON.parse(dataLine.slice(5).trim())
          if (typeof payload.audio_base64 === 'string') {
            chunks += 1
            audioBytes += Buffer.from(payload.audio_base64, 'base64').byteLength
            if (!firstByteAt) firstByteAt = performance.now() - startedAt
          }
        } catch {
          // 忽略非音频事件
        }
      }
    }
  }

  const totalMs = performance.now() - startedAt
  const audioSeconds = wavDurationSeconds(Buffer.alloc(0)) + audioBytes / 2 / 24000
  return {
    id: sentence.id,
    category: sentence.category,
    chars: Array.from(sentence.text).length,
    firstChunkMs: Math.round(firstByteAt),
    totalMs: Math.round(totalMs),
    chunks,
    audioSeconds: Number(audioSeconds.toFixed(2)),
    rtf: audioSeconds > 0 ? Number((totalMs / 1000 / audioSeconds).toFixed(2)) : null,
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
          `首包 ${String(result.firstChunkMs).padStart(5)}ms  总 ${String(result.totalMs).padStart(5)}ms  ` +
          `块 ${result.chunks}  RTF ${result.rtf ?? '-'}`,
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

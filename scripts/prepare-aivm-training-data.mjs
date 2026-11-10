#!/usr/bin/env node

// 把官方语音整理成 Style-Bert-VITS2 可直接训练的数据集：
//   build/aivm-training/hina/raw/<style>/*.wav
//   build/aivm-training/hina/esd.list
//
// 用法：node scripts/prepare-aivm-training-data.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const curate = process.argv.includes('--curate')

// 战斗类台词以喊叫为主，会把"活泼、提高音量"的说话方式带进声线。
const COMBAT_FAMILIES = /^(Battle|ExSkill|Tactic|Formation|CommonSkill|ExWeapon)_/
// 精选后样本变少，只保留两种样本量足够的风格。
const CURATED_STYLE_OF = {
  neutral: 'neutral',
  surprised: 'neutral',
  happy: 'neutral',
  stern: 'neutral',
  annoyed: 'neutral',
  embarrassed: 'soft',
  playful: 'soft',
  soft: 'soft',
  tired: 'soft',
  sad: 'soft',
}
const trainingDir = join(root, 'assets/characters/hina-swimsuit/private/audio/training')
const outDir = join(root, curate ? 'build/aivm-training/hina-curated' : 'build/aivm-training/hina')

// 情绪 → SBV2 样式目录。合并样本过少的类别，避免样式向量不稳。
const STYLE_OF = {
  neutral: 'neutral',
  surprised: 'neutral',
  stern: 'annoyed',
  annoyed: 'annoyed',
  embarrassed: 'embarrassed',
  playful: 'embarrassed',
  tired: 'tired',
  sad: 'tired',
  soft: 'soft',
  happy: 'soft',
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const clipsOf = (data) => data.clips ?? data.entries ?? data.samples ?? []

const expanded = clipsOf(readJson(join(trainingDir, 'hina-training-expanded.json')))
const multiform = clipsOf(readJson(join(trainingDir, 'multiform/hina-multiform-training-v2.json')))

// 按 sha256 去重；multiform 提供情绪标签，优先使用它。
const byHash = new Map()
for (const clip of expanded) {
  byHash.set(clip.sha256, { ...clip, emotion: 'neutral' })
}
for (const clip of multiform) {
  byHash.set(clip.sha256, clip)
}

const incomingDir = join(trainingDir, 'incoming')
const AUDIO_EXT = /\.(mp3|wav|flac|m4a|ogg|opus)$/i

function walkAudio(dir) {
  const out = []
  if (!existsSync(dir)) return out
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (AUDIO_EXT.test(entry.name)) {
        out.push(full)
      }
    }
  }
  return out.sort()
}

// incoming/esd.list：filename|日文文本
const incomingTranscripts = new Map()
const incomingListPath = join(incomingDir, 'esd.list')
if (existsSync(incomingListPath)) {
  for (const line of readFileSync(incomingListPath, 'utf8').split('\n')) {
    const [file, text] = line.split('|')
    if (file && text) incomingTranscripts.set(file.trim(), text.trim())
  }
}

// 参考音频库：参考音频/ + 参考文本.txt（GPT-SoVITS 的 esd.list 格式）
const bankDir = join(incomingDir, '参考音频')
const bankListPath = join(bankDir, '参考文本.txt')
const bankSamples = []
if (existsSync(bankListPath)) {
  for (const line of readFileSync(bankListPath, 'utf8').split('\n')) {
    const parts = line.trim().split('|')
    if (parts.length < 4) continue
    const file = parts[0].split(/[\\/]/).pop()
    const text = parts.slice(3).join('|').trim()
    if (!file || !text) continue
    bankSamples.push({ file, text })
  }
}

const incomingFiles = walkAudio(incomingDir).filter((file) => !file.startsWith(bankDir))
const needsTranscript = []

const candidates = (clip) => [
  join(trainingDir, 'multiform/source', clip.relativePath ?? ''),
  join(trainingDir, 'multiform', clip.relativePath ?? ''),
  join(trainingDir, 'source-expanded', clip.filename ?? ''),
  join(trainingDir, clip.relativePath ?? ''),
]

rmSync(outDir, { recursive: true, force: true })
mkdirSync(join(outDir, 'raw'), { recursive: true })

const lines = []
const stats = new Map()
let converted = 0
let missing = 0

for (const [hash, clip] of byHash) {
  const source = candidates(clip).find((path) => path && existsSync(path))
  if (!source) {
    missing += 1
    continue
  }
  if (curate && COMBAT_FAMILIES.test(clip.clip ?? '')) {
    continue
  }
  const style = (curate ? CURATED_STYLE_OF : STYLE_OF)[clip.emotion] ?? 'neutral'
  const relative = `${style}/${clip.id?.replace(/[^a-zA-Z0-9_-]/g, '_') ?? hash.slice(0, 12)}.wav`
  const target = join(outDir, 'raw', relative)
  mkdirSync(dirname(target), { recursive: true })
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@44100', '-c', '1', source, target], {
    stdio: 'ignore',
  })
  lines.push(`${relative}|hina|JP|${clip.text}`)
  stats.set(style, (stats.get(style) ?? 0) + 1)
  converted += 1
}

for (const source of incomingFiles) {
  const relativePath = source.slice(incomingDir.length + 1)
  const name = source.split('/').pop()
  const id = name.replace(AUDIO_EXT, '').replace(/[^a-zA-Z0-9_-]/g, '_')
  const styleDir = relativePath.includes('/') ? relativePath.split('/')[0] : 'neutral'
  const style = /^[a-z][a-z0-9_-]*$/i.test(styleDir) ? styleDir : 'neutral'
  const text = incomingTranscripts.get(relativePath) ?? incomingTranscripts.get(name) ?? ''
  if (!text.trim()) {
    needsTranscript.push(relativePath)
    continue
  }
  const relative = `${style}/${id}.wav`
  const target = join(outDir, 'raw', relative)
  mkdirSync(dirname(target), { recursive: true })
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@44100', '-c', '1', source, target], {
    stdio: 'ignore',
  })
  lines.push(`${relative}|hina|JP|${text}`)
  stats.set(style, (stats.get(style) ?? 0) + 1)
  converted += 1
}

// 语音库：战斗/技能类归 neutral，日常/亲密类归 soft
const SOFT_FAMILIES =
  /^(Lobby|MemorialLobby|Cafe|Relationship|Season|Growup|EventLobby|EventLogin|EventMission|LogIn|Gachaget|Title)/
for (const sample of bankSamples) {
  const source = join(bankDir, sample.file)
  if (!existsSync(source)) continue
  const id = sample.file.replace(AUDIO_EXT, '').replace(/[^a-zA-Z0-9_-]/g, '_')
  const familyName = sample.file.replace(/^CH\d+_/, '')
  const style = SOFT_FAMILIES.test(familyName) ? 'soft' : 'neutral'
  const relative = `${style}/${id}.wav`
  const target = join(outDir, 'raw', relative)
  mkdirSync(dirname(target), { recursive: true })
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@44100', '-c', '1', source, target], {
    stdio: 'ignore',
  })
  lines.push(`${relative}|hina|JP|${sample.text}`)
  stats.set(style, (stats.get(style) ?? 0) + 1)
  converted += 1
}

writeFileSync(join(outDir, 'esd.list'), lines.join('\n') + '\n')
writeFileSync(
  join(outDir, 'manifest.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      total: converted,
      missing,
      styles: Object.fromEntries(stats),
      note: '仅包含官方语音，按 sha256 去重；情绪标签合并为 5 种样式。',
      incomingNeedsTranscript: needsTranscript,
    },
    null,
    2,
  ) + '\n',
)

console.log(`已转换 ${converted} 条，缺失 ${missing} 条`)
console.log('样式分布:', JSON.stringify(Object.fromEntries(stats)))
console.log('输出目录:', outDir)
if (needsTranscript.length > 0) {
  console.log(`需要转写的 incoming 文件: ${needsTranscript.length} 个`)
  for (const file of needsTranscript.slice(0, 10)) console.log(' -', file)
}

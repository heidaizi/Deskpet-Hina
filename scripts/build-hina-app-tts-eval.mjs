import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const contentRoot = join(process.cwd(), 'content')
const config = JSON.parse(await readFile(join(contentRoot, 'tts-ja.json'), 'utf8'))
const revision = String(config.modelRevision ?? '')
const captions = config.captions ?? {}
const defaultCaption = String(config.defaultCaption ?? '')

const dialogueItems = Object.entries(config.lines ?? {}).map(([displayText, rawLine], index) => {
  const line = typeof rawLine === 'string' ? { text: rawLine } : rawLine
  const emotion = String(line.emotion ?? 'neutral')
  const caption = String(line.caption ?? captions[emotion] ?? defaultCaption)
  return {
    sample_id: `app-dialogue:${String(index + 1).padStart(2, '0')}`,
    display_text: displayText,
    emotion,
    text: String(line.text),
    caption,
    duration_scale: Number(line.durationScale ?? 1),
    seed: deriveEmotionSeed(revision, String(line.text), caption, 0),
  }
})

const controlText = '先生、少しだけこちらを見て。'
const emotionItems = Object.entries(captions).map(([emotion, rawCaption]) => {
  const caption = String(rawCaption)
  return {
    sample_id: `app-style:${emotion}`,
    emotion,
    text: controlText,
    caption,
    duration_scale: 1,
    seed: deriveEmotionSeed(revision, controlText, caption, 0),
  }
})

await writeJson('hina-app-dialogue-eval.json', {
  schemaVersion: 1,
  purpose: 'All Chinese dialogue entries that currently use local Irodori TTS.',
  modelRevision: revision,
  items: dialogueItems,
})
await writeJson('hina-app-emotion-eval.json', {
  schemaVersion: 1,
  purpose: 'The 11 emotion styles used by the desktop pet on one fixed line.',
  modelRevision: revision,
  items: emotionItems,
})

console.log(
  JSON.stringify(
    {
      modelRevision: revision,
      dialogueItems: dialogueItems.length,
      dialogueEmotions: countBy(dialogueItems, 'emotion'),
      emotionStyles: emotionItems.map((item) => item.emotion),
    },
    null,
    2,
  ),
)

async function writeJson(filename, value) {
  await writeFile(join(contentRoot, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function deriveEmotionSeed(revisionValue, text, caption, variantIndex = 0) {
  const base = `${revisionValue}\0${text}\0${caption}`
  const payload = variantIndex === 0 ? base : `${base}\0${variantIndex}`
  return createHash('sha256').update(payload).digest().readUInt32BE(0) & 0x7fffffff
}

function countBy(rows, key) {
  const counts = {}
  for (const row of rows) {
    counts[row[key]] = (counts[row[key]] ?? 0) + 1
  }
  return counts
}

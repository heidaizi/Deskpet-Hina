import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const spec = JSON.parse(await readFile(join(root, 'content/hina-app-dialogue-eval.json'), 'utf8'))
const evaluationRoot = join(
  root,
  'assets/characters/hina-swimsuit/private/audio/app-tts-eval/dialogues',
)
const summary = JSON.parse(await readFile(join(evaluationRoot, 'summary.json'), 'utf8'))
const outputRoot = join(root, 'assets/characters/hina-swimsuit/private/audio/generated-dialogue')
await mkdir(outputRoot, { recursive: true })

const rowsBySample = new Map(summary.items.map((row) => [row.sample_id, row]))
const entries = []
for (const item of spec.items) {
  const row = rowsBySample.get(item.sample_id)
  if (!row) {
    throw new Error(`Missing generated audio for ${item.sample_id}`)
  }
  const source = join(evaluationRoot, row.file)
  const bytes = await readFile(source)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const filename = `dialogue-${item.sample_id.split(':').at(-1)}.wav`
  await copyFile(source, join(outputRoot, filename))
  entries.push({
    text: item.display_text,
    japanese: item.text,
    emotion: item.emotion,
    path: `assets/characters/hina-swimsuit/private/audio/generated-dialogue/${filename}`,
    durationSeconds: row.duration_seconds,
    sha256,
  })
}

const supplementalPath = join(root, 'content/prebuilt-tts-supplemental.json')
if (existsSync(supplementalPath)) {
  const supplemental = JSON.parse(await readFile(supplementalPath, 'utf8'))
  const knownTexts = new Set(entries.map((entry) => entry.text))
  for (const entry of supplemental.entries ?? []) {
    if (
      typeof entry.text === 'string' &&
      typeof entry.path === 'string' &&
      !knownTexts.has(entry.text) &&
      existsSync(join(root, entry.path))
    ) {
      entries.push(entry)
      knownTexts.add(entry.text)
    }
  }
}

await writeFile(
  join(root, 'content/prebuilt-tts-ja.json'),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      modelRevision: spec.modelRevision,
      entries,
    },
    null,
    2,
  )}\n`,
  'utf8',
)
console.log(
  JSON.stringify(
    {
      modelRevision: spec.modelRevision,
      entries: entries.length,
      outputRoot,
    },
    null,
    2,
  ),
)

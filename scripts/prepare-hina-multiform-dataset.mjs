import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const projectRoot = process.cwd()
const trainingRoot = join(
  projectRoot,
  'assets/characters/hina-swimsuit/private/audio/training/multiform',
)
const catalog = JSON.parse(
  await readFile(join(trainingRoot, 'hina-multiform-training.json'), 'utf8'),
)
const datasetRoot = join(process.env.HOME, '.local/share/deskpet-tts/data/hina-multiform/dataset')
const audioDirectory = join(datasetRoot, 'audio')
const minimumDurationSeconds = 0.8
const maximumDurationSeconds = 30

await rm(datasetRoot, { recursive: true, force: true })
await mkdir(audioDirectory, { recursive: true })

const rows = []
for (const entry of catalog.entries) {
  const filename = `${entry.variant}__${entry.clip}.wav`
  const outputPath = join(audioDirectory, filename)
  execFileSync('/usr/bin/afconvert', [
    join(trainingRoot, 'source', entry.relativePath),
    outputPath,
    '-f',
    'WAVE',
    '-d',
    'LEI16@48000',
  ])
  const info = execFileSync('/usr/bin/afinfo', [outputPath], { encoding: 'utf8' })
  const duration = Number(/estimated duration:\s*([\d.]+)/.exec(info)?.[1] ?? 0)
  if (duration < minimumDurationSeconds || duration > maximumDurationSeconds) {
    await rm(outputPath, { force: true })
    console.log(`Skipping ${entry.id}: duration ${duration.toFixed(3)}s outside range`)
    continue
  }
  rows.push({
    sample_id: entry.id,
    variant: entry.variant,
    source_clip: entry.clip,
    file_name: `audio/${filename}`,
    text: entry.text,
    caption: entry.caption,
    emotion: entry.emotion,
    intensity: entry.intensity,
    classification_source: entry.classificationSource,
    duration_seconds: duration,
    source_url: entry.sourceUrl,
    source_sha256: entry.sha256,
  })
}

const groups = new Map()
for (const row of rows) {
  const group = groups.get(row.emotion) ?? []
  group.push(row)
  groups.set(row.emotion, group)
}

for (const [emotion, group] of groups) {
  group.sort((left, right) => hashUnit(left.sample_id) - hashUnit(right.sample_id))
  const validationCount =
    group.length >= 4 ? Math.max(1, Math.round(group.length * 0.2)) : group.length >= 2 ? 1 : 0
  for (const [index, row] of group.entries()) {
    row.split = index < validationCount ? 'validation' : 'train'
  }
  console.log(`${emotion}: ${group.length} total, ${validationCount} validation`)
}

const trainRows = rows.filter((row) => row.split === 'train')
const validationRows = rows.filter((row) => row.split === 'validation')
await writeFile(
  join(datasetRoot, 'metadata.jsonl'),
  `${trainRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
  'utf8',
)
await writeFile(
  join(datasetRoot, 'metadata-validation.jsonl'),
  `${validationRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
  'utf8',
)

const summary = {
  schemaVersion: 1,
  totalDurationSeconds: rows.reduce((sum, row) => sum + row.duration_seconds, 0),
  counts: {
    total: rows.length,
    train: trainRows.length,
    validation: validationRows.length,
  },
  byVariant: countBy(rows, 'variant'),
  byEmotion: countBy(rows, 'emotion'),
  byEmotionTrain: countBy(trainRows, 'emotion'),
  byEmotionValidation: countBy(validationRows, 'emotion'),
}
await writeFile(
  join(datasetRoot, 'emotion-summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
  'utf8',
)

console.log(`Prepared ${rows.length} multi-form clips in ${datasetRoot}`)
console.log(`Train: ${trainRows.length}; validation: ${validationRows.length}`)

function countBy(items, key) {
  const result = {}
  for (const item of items) {
    result[item[key]] = (result[item[key]] ?? 0) + 1
  }
  return result
}

function hashUnit(value) {
  return createHash('sha256').update(value).digest().readUInt32BE(0) / 0xffffffff
}

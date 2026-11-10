import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { HINA_EMOTIONS, captionVariantsForEmotion } from './lib/hina-emotion-taxonomy.mjs'

const projectRoot = process.cwd()
const dataRoot = join(homedir(), '.local/share/deskpet-tts/data/hina-multiform')
const privateRoot = join(
  projectRoot,
  'assets/characters/hina-swimsuit/private/audio/training/multiform',
)
const sourceManifestPath = join(dataRoot, 'hina-multiform-manifest.jsonl')
const metadataPath = join(dataRoot, 'dataset/metadata.jsonl')
const catalogPath = join(privateRoot, 'hina-multiform-training-v2.json')
const outputManifestPath = join(dataRoot, 'hina-emotion-lora-manifest.jsonl')
const reportPath = join(privateRoot, 'emotion-lora-manifest-report.json')
const targetPerEmotion = Number(process.argv[2] ?? 24)
const speakerId = 'sorasaki-hina-multiform'

const sourceRows = readJsonl(await readFile(sourceManifestPath, 'utf8'))
const trainingIds = new Set(
  readJsonl(await readFile(metadataPath, 'utf8')).map((row) => row.sample_id),
)
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
const labels = new Map(catalog.entries.map((entry) => [entry.id, entry]))

const groups = new Map(HINA_EMOTIONS.map((emotion) => [emotion, []]))
for (const row of sourceRows) {
  if (!trainingIds.has(row.sample_id)) {
    continue
  }
  const reviewed = labels.get(row.sample_id)
  if (!reviewed) {
    throw new Error(`Missing reviewed emotion label for ${row.sample_id}`)
  }
  const group = groups.get(reviewed.emotion)
  if (!group) {
    throw new Error(`Unknown emotion ${reviewed.emotion} for ${row.sample_id}`)
  }
  group.push({
    ...row,
    emotion: reviewed.emotion,
    reviewedIntensity: reviewed.intensity,
    reviewedClassificationSource: reviewed.classificationSource,
    speaker_id: speakerId,
  })
}

const manifest = []
const report = {}
for (const emotion of HINA_EMOTIONS) {
  const uniquePool = rotateVariants(
    groups
      .get(emotion)
      .slice()
      .sort((left, right) => hashUnit(left.sample_id) - hashUnit(right.sample_id)),
  )
  const selected = uniquePool.slice(0, targetPerEmotion)
  if (selected.length === 0) {
    throw new Error(`No training rows for ${emotion}`)
  }
  const captions = captionVariantsForEmotion(emotion)
  for (let index = 0; index < targetPerEmotion; index += 1) {
    const source = selected[index % selected.length]
    manifest.push({
      ...source,
      caption: captions[index % captions.length],
      emotion_copy_index: index,
      oversampled: index >= selected.length,
    })
  }
  report[emotion] = {
    availableUnique: uniquePool.length,
    selectedUnique: selected.length,
    effectiveRows: targetPerEmotion,
    duplicateRows: Math.max(0, targetPerEmotion - selected.length),
    variants: countBy(selected, 'variant'),
  }
}

manifest.sort(
  (left, right) =>
    hashUnit(`${left.emotion}\0${left.sample_id}\0${left.emotion_copy_index}`) -
    hashUnit(`${right.emotion}\0${right.sample_id}\0${right.emotion_copy_index}`),
)
await writeFile(
  outputManifestPath,
  `${manifest.map((row) => JSON.stringify(row)).join('\n')}\n`,
  'utf8',
)
const outputReport = {
  schemaVersion: 1,
  purpose: 'Balanced single-speaker LoRA manifest for emotion conditioning',
  targetPerEmotion,
  rows: manifest.length,
  speakerId,
  byEmotion: report,
  caveat:
    'Minority emotions are repeated. Validation uses separate held-out audio and checkpoint comparisons; duplicate counts are not independent evidence.',
}
await writeFile(reportPath, `${JSON.stringify(outputReport, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ ...outputReport, outputManifestPath }, null, 2))

function readJsonl(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function hashUnit(value) {
  return createHash('sha256').update(value).digest().readUInt32BE(0) / 0xffffffff
}

function rotateVariants(rows) {
  const groupsByVariant = new Map()
  for (const row of rows) {
    const group = groupsByVariant.get(row.variant) ?? []
    group.push(row)
    groupsByVariant.set(row.variant, group)
  }
  const variantGroups = [...groupsByVariant.values()]
  const result = []
  let index = 0
  while (result.length < rows.length) {
    for (const group of variantGroups) {
      if (group[index]) {
        result.push(group[index])
      }
    }
    index += 1
  }
  return result
}

function countBy(rows, key) {
  const result = {}
  for (const row of rows) {
    result[row[key]] = (result[row[key]] ?? 0) + 1
  }
  return result
}

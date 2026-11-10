import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { captionForEmotion, classifyHinaEmotion } from './lib/hina-emotion-taxonomy.mjs'

const trainingRoot = join(
  process.cwd(),
  'assets/characters/hina-swimsuit/private/audio/training/multiform',
)
const inputPath = new URL(`file://${join(trainingRoot, 'hina-multiform-training.json')}`)
const outputPath = new URL(`file://${join(trainingRoot, 'hina-multiform-training-v2.json')}`)
const csvPath = new URL(`file://${join(trainingRoot, 'hina-multiform-emotion-labels-v2.csv')}`)
const catalog = JSON.parse(await readFile(inputPath, 'utf8'))
const datasetRoot = join(homedir(), '.local/share/deskpet-tts/data/hina-multiform/dataset')
const validSampleIds = new Set(
  await Promise.all(
    ['metadata.jsonl', 'metadata-validation.jsonl'].map(async (filename) =>
      (await readFile(join(datasetRoot, filename), 'utf8'))
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line).sample_id),
    ),
  ).then((groups) => groups.flat()),
)

const changes = []
const entries = catalog.entries.map((entry) => {
  const classification = classifyHinaEmotion(entry.id, entry.clip, entry.text)
  if (classification.primary !== entry.emotion) {
    changes.push({
      id: entry.id,
      previousEmotion: entry.emotion,
      emotion: classification.primary,
      text: entry.text,
    })
  }
  return {
    ...entry,
    previousEmotion: entry.emotion,
    emotion: classification.primary,
    intensity: classification.intensity,
    classificationSource: classification.source,
    classificationConfidence:
      {
        manual: 0.95,
        text: 0.8,
        clip: 0.65,
        default: 0.5,
      }[classification.source] ?? 0.5,
    caption: captionForEmotion(classification.primary),
    taxonomyVersion: 2,
  }
})

const byEmotion = Object.fromEntries(
  [...new Set(entries.map((entry) => entry.emotion))]
    .sort()
    .map((emotion) => [emotion, entries.filter((entry) => entry.emotion === emotion).length]),
)
const validEntries = entries.filter((entry) => validSampleIds.has(entry.id))
const byEmotionValid = Object.fromEntries(
  [...new Set(validEntries.map((entry) => entry.emotion))]
    .sort()
    .map((emotion) => [emotion, validEntries.filter((entry) => entry.emotion === emotion).length]),
)
const output = {
  ...catalog,
  schemaVersion: 3,
  taxonomyVersion: 2,
  entries,
  review: {
    changes,
    catalogEntries: entries.length,
    validAudioEntries: validEntries.length,
    byEmotionCatalog: byEmotion,
    byEmotionValid,
  },
}
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
const csvColumns = [
  'id',
  'variant',
  'clip',
  'previousEmotion',
  'emotion',
  'intensity',
  'classificationSource',
  'classificationConfidence',
  'text',
  'caption',
]
const csv = [
  csvColumns.join(','),
  ...entries.map((entry) => csvColumns.map((column) => csvCell(entry[column] ?? '')).join(',')),
].join('\n')
await writeFile(csvPath, `${csv}\n`, 'utf8')

console.log(
  JSON.stringify(
    {
      entries: entries.length,
      validAudioEntries: validEntries.length,
      changed: changes.length,
      byEmotionCatalog: byEmotion,
      byEmotionValid,
      output: decodeURIComponent(outputPath.pathname),
      csv: decodeURIComponent(csvPath.pathname),
    },
    null,
    2,
  ),
)

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

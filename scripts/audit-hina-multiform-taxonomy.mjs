import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { HINA_EMOTIONS } from './lib/hina-emotion-taxonomy.mjs'

const projectRoot = process.cwd()
const trainingRoot = join(
  projectRoot,
  'assets/characters/hina-swimsuit/private/audio/training/multiform',
)
const catalogPath = join(trainingRoot, 'hina-multiform-training.json')
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
const datasetRoot = join(process.env.HOME, '.local/share/deskpet-tts/data/hina-multiform/dataset')
const summary = JSON.parse(await readFile(join(datasetRoot, 'emotion-summary.json'), 'utf8'))

const allowed = new Set(HINA_EMOTIONS)
const errors = []
for (const entry of catalog.entries) {
  if (!allowed.has(entry.emotion)) {
    errors.push(`${entry.id}: unknown emotion ${entry.emotion}`)
  }
  if (!entry.caption?.trim()) {
    errors.push(`${entry.id}: missing caption`)
  }
  if (!entry.text?.trim()) {
    errors.push(`${entry.id}: missing transcript`)
  }
  if (!entry.sha256 || entry.sha256.length !== 64) {
    errors.push(`${entry.id}: invalid SHA-256`)
  }
}

for (const emotion of HINA_EMOTIONS) {
  if (!summary.byEmotionTrain[emotion]) {
    errors.push(`${emotion}: no training samples`)
  }
}
if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  const report = {
    schemaVersion: 1,
    catalogEntries: catalog.entries.length,
    validAudioEntries: summary.counts.total,
    totalDurationSeconds: summary.totalDurationSeconds,
    counts: summary.counts,
    byVariant: summary.byVariant,
    byEmotion: summary.byEmotion,
    byEmotionTrain: summary.byEmotionTrain,
    byEmotionValidation: summary.byEmotionValidation,
    manualOverrides: catalog.entries.filter((entry) => entry.classificationSource === 'manual')
      .length,
    errors,
  }
  const outputPath = join(trainingRoot, 'taxonomy-audit.json')
  const csvPath = join(trainingRoot, 'hina-multiform-taxonomy.csv')
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  const columns = [
    'id',
    'variant',
    'clip',
    'emotion',
    'intensity',
    'classificationSource',
    'text',
    'caption',
    'sourceUrl',
  ]
  const csv = [
    columns.join(','),
    ...catalog.entries.map((entry) =>
      columns.map((column) => csvCell(entry[column] ?? '')).join(','),
    ),
  ].join('\n')
  await writeFile(csvPath, `${csv}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
  console.log(`Audit: ${outputPath}`)
  console.log(`CSV: ${csvPath}`)
}

function csvCell(value) {
  const text = String(value)
  return `"${text.replaceAll('"', '""')}"`
}

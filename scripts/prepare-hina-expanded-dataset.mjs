import { execFileSync } from 'node:child_process'
import { readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const projectRoot = process.cwd()
const trainingRoot = join(projectRoot, 'assets/characters/hina-swimsuit/private/audio/training')
const catalog = JSON.parse(
  await readFile(join(trainingRoot, 'hina-training-expanded.json'), 'utf8'),
)
const datasetRoot = join(process.env.HOME, '.local/share/deskpet-tts/data/hina-expanded/dataset')
const audioDirectory = join(datasetRoot, 'audio')
const minimumDurationSeconds = 0.8

await rm(audioDirectory, { recursive: true, force: true })
await mkdir(audioDirectory, { recursive: true })

const rows = []
for (const entry of catalog.entries) {
  const filename = `${entry.clip}.wav`
  execFileSync('/usr/bin/afconvert', [
    join(trainingRoot, 'source-expanded', entry.filename),
    join(audioDirectory, filename),
    '-f',
    'WAVE',
    '-d',
    'LEI16@48000',
  ])
  const info = execFileSync('/usr/bin/afinfo', [join(audioDirectory, filename)], {
    encoding: 'utf8',
  })
  const duration = Number(/estimated duration:\s*([\d.]+)/.exec(info)?.[1] ?? 0)
  if (duration < minimumDurationSeconds) {
    await rm(join(audioDirectory, filename), { force: true })
    console.log(`Skipping short clip: ${filename} (${duration.toFixed(3)}s)`)
    continue
  }
  rows.push({
    file_name: `audio/${filename}`,
    text: entry.text,
    caption: entry.caption,
    duration_seconds: duration,
    source_clip: entry.clip,
    source_url: entry.sourceUrl,
    source_sha256: entry.sha256,
  })
}

await writeFile(
  join(datasetRoot, 'metadata.jsonl'),
  `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
  'utf8',
)
console.log(`Prepared ${rows.length} expanded Hina WAV clips in ${datasetRoot}`)

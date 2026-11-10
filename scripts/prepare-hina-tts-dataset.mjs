import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const projectRoot = process.cwd()
const catalogPath = join(
  projectRoot,
  'assets/characters/hina-swimsuit/private/audio/training/hina-training.json',
)
const sourceDirectory = join(projectRoot, 'assets/characters/hina-swimsuit/private/audio/official')
const datasetRoot = join(process.env.HOME, '.local/share/deskpet-tts/data/hina/dataset')
const audioDirectory = join(datasetRoot, 'audio')

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
await mkdir(audioDirectory, { recursive: true })

const rows = []
for (const entry of catalog.entries) {
  const filename = `${entry.clip}.wav`
  execFileSync('/usr/bin/afconvert', [
    join(sourceDirectory, `${entry.clip}.ogg`),
    join(audioDirectory, filename),
    '-f',
    'WAVE',
    '-d',
    'LEI16@48000',
  ])
  rows.push(
    JSON.stringify({
      file_name: `audio/${filename}`,
      text: entry.text,
      caption: entry.caption,
    }),
  )
}

await writeFile(join(datasetRoot, 'metadata.jsonl'), `${rows.join('\n')}\n`, 'utf8')
console.log(`Prepared ${rows.length} Hina training clips in ${datasetRoot}`)

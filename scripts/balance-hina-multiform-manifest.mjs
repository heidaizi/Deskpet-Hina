import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const dataRoot = join(process.env.HOME, '.local/share/deskpet-tts/data/hina-multiform')
const manifestPath = join(dataRoot, 'hina-multiform-manifest.jsonl')
const balancedPath = join(dataRoot, 'hina-multiform-balanced-manifest.jsonl')
const targetMinimum = Number(process.argv[2] ?? 12)

const rows = (await readFile(manifestPath, 'utf8'))
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line))

const groups = new Map()
for (const row of rows) {
  const emotion = row.emotion ?? 'neutral'
  const group = groups.get(emotion) ?? []
  group.push(row)
  groups.set(emotion, group)
}

const balanced = []
const report = {}
for (const [emotion, group] of groups) {
  balanced.push(...group)
  const copies = Math.max(0, targetMinimum - group.length)
  for (let index = 0; index < copies; index += 1) {
    balanced.push(group[index % group.length])
  }
  report[emotion] = {
    unique: group.length,
    oversampledCopies: copies,
    effective: group.length + copies,
  }
}

const order = (row) => `${row.emotion}\0${row.sample_id}\0${row.latent_path}`
balanced.sort((left, right) => order(left).localeCompare(order(right)))
await writeFile(balancedPath, `${balanced.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')
console.log(JSON.stringify({ rows: balanced.length, report }, null, 2))
console.log(`Balanced manifest: ${balancedPath}`)

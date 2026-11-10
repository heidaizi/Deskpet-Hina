import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const modelsRoot = join(process.env.HOME, '.local/share/deskpet-tts/models')
const chunkSize = 32 * 1024 * 1024
const concurrency = 6

const downloads = [
  {
    name: 'Irodori-TTS-v4.1-Small',
    url: 'https://hf-mirror.com/Aratako/Irodori-TTS-v4.1-Small/resolve/main/model.safetensors?download=true',
    output: join(modelsRoot, 'Irodori-TTS-v4.1-Small/model.safetensors'),
    size: 3_064_295_596,
  },
  {
    name: 'Semantic-DACVAE-Japanese-32dim',
    url: 'https://hf-mirror.com/Aratako/Semantic-DACVAE-Japanese-32dim/resolve/main/weights.pth?download=true',
    output: join(modelsRoot, 'Semantic-DACVAE-Japanese-32dim/weights.pth'),
    size: 429_620_065,
  },
]

async function fileSize(path) {
  try {
    return (await stat(path)).size
  } catch {
    return -1
  }
}

function downloadChunk(url, path, start, end) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/curl', [
      '--location',
      '--fail',
      '--silent',
      '--show-error',
      '--retry',
      '5',
      '--retry-delay',
      '2',
      '--range',
      `${start}-${end}`,
      '--output',
      path,
      url,
    ])
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`curl exited with code ${code}`))
      }
    })
  })
}

async function downloadFile(item) {
  if ((await fileSize(item.output)) === item.size) {
    console.log(`${item.name}: already complete`)
    return
  }

  await mkdir(dirname(item.output), { recursive: true })
  const partsDirectory = `${item.output}.parts`
  await mkdir(partsDirectory, { recursive: true })

  const chunks = []
  for (let start = 0; start < item.size; start += chunkSize) {
    const end = Math.min(item.size - 1, start + chunkSize - 1)
    chunks.push({
      index: chunks.length,
      start,
      end,
      size: end - start + 1,
      path: join(partsDirectory, `${String(chunks.length).padStart(4, '0')}.part`),
    })
  }

  let cursor = 0
  let completed = 0
  async function worker() {
    while (cursor < chunks.length) {
      const chunk = chunks[cursor++]
      if ((await fileSize(chunk.path)) !== chunk.size) {
        await downloadChunk(item.url, chunk.path, chunk.start, chunk.end)
      }
      completed += 1
      if (completed % 10 === 0 || completed === chunks.length) {
        console.log(`${item.name}: ${completed}/${chunks.length} chunks`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  for (const chunk of chunks) {
    if ((await fileSize(chunk.path)) !== chunk.size) {
      throw new Error(`${item.name}: invalid chunk ${chunk.index}`)
    }
  }

  const temporaryOutput = `${item.output}.assembling`
  await rm(temporaryOutput, { force: true })
  const output = await open(temporaryOutput, 'w')
  try {
    for (const chunk of chunks) {
      for await (const data of createReadStream(chunk.path)) {
        await output.write(data)
      }
    }
  } finally {
    await output.close()
  }

  if ((await fileSize(temporaryOutput)) !== item.size) {
    throw new Error(`${item.name}: assembled size mismatch`)
  }
  await rm(item.output, { force: true })
  await rename(temporaryOutput, item.output)
  await rm(partsDirectory, { recursive: true, force: true })
  console.log(`${item.name}: complete (${item.size} bytes)`)
}

const selectedDownloads =
  process.argv[2] === 'model'
    ? downloads.filter((item) => item.name.startsWith('Irodori'))
    : process.argv[2] === 'codec'
      ? downloads.filter((item) => item.name.startsWith('Semantic'))
      : downloads

for (const item of selectedDownloads) {
  await downloadFile(item)
}

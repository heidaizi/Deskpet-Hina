import { spawn } from 'node:child_process'

/**
 * 用系统 curl 发 JSON POST。
 *
 * Electron 主进程里的 fetch 不遵循 NODE_USE_ENV_PROXY，容易在代理环境卡死；
 * curl 会读取 HTTPS_PROXY，行为稳定。
 */
export function curlPostJson(
  url: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs = 20_000,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const args = [
      '-sS',
      '-m',
      String(Math.max(1, Math.round(timeoutMs / 1000))),
      '-X',
      'POST',
      '-H',
      'content-type: application/json',
      '--data-binary',
      '@-',
      '-w',
      '\n%{http_code}',
      url,
    ]
    for (const [key, value] of Object.entries(headers)) {
      args.push('-H', `${key}: ${value}`)
    }
    const child = spawn('curl', args, { env: process.env })
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      const text = Buffer.concat(out).toString('utf8')
      const match = /\n(\d{3})$/.exec(text)
      if (code !== 0 || !match) {
        reject(
          new Error(`curl failed (${code}): ${Buffer.concat(err).toString('utf8').slice(0, 160)}`),
        )
        return
      }
      resolve({ status: Number(match[1]), text: text.slice(0, match.index) })
    })
    child.stdin.write(body)
    child.stdin.end()
  })
}

/** 用 curl 抓取网页文本；比主进程 fetch 更适应代理环境。 */
export function curlGet(url: string, timeoutMs = 10_000): Promise<string | null> {
  return new Promise((resolve) => {
    const args = [
      '-sS',
      '-L',
      '--compressed',
      '-m',
      String(Math.max(1, Math.round(timeoutMs / 1000))),
      '-A',
      'Deskpet local companion/1.0',
      '-w',
      '\n%{http_code}',
      url,
    ]
    const child = spawn('curl', args, { env: process.env })
    const out: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.on('error', () => resolve(null))
    child.on('close', (code) => {
      const text = Buffer.concat(out).toString('utf8')
      const match = /\n(\d{3})$/.exec(text)
      if (code !== 0 || !match || match[1] !== '200') {
        resolve(null)
        return
      }
      resolve(text.slice(0, match.index))
    })
  })
}

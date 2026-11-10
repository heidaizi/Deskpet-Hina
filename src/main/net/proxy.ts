import { execFileSync } from 'node:child_process'

/**
 * 让 Node 的 fetch 走系统代理。
 *
 * macOS 的代理设置不会自动传给 Node；这里读取 scutil 的结果，
 * 写入 HTTPS_PROXY 并开启 NODE_USE_ENV_PROXY，运行时设置即可生效。
 */
export function configureProxyFromSystem(): void {
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    process.env.NODE_USE_ENV_PROXY ??= '1'
    return
  }
  if (process.platform !== 'darwin') {
    return
  }
  try {
    const output = execFileSync('scutil', ['--proxy'], { encoding: 'utf8', timeout: 1500 })
    if (!/HTTPEnable\s*:\s*1/.test(output)) {
      return
    }
    const host = /HTTPProxy\s*:\s*(\S+)/.exec(output)?.[1]
    const port = /HTTPPort\s*:\s*(\d+)/.exec(output)?.[1]
    if (!host || !port) {
      return
    }
    const proxy = `http://${host}:${port}`
    process.env.HTTPS_PROXY = proxy
    process.env.HTTP_PROXY = proxy
    process.env.NODE_USE_ENV_PROXY = '1'
  } catch {
    // 读不到代理就直连，交给请求超时兜底。
  }
}

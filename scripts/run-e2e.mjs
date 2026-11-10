#!/usr/bin/env node

// Playwright 通过 Electron 二进制启动被测应用。
// 如果宿主进程带有 ELECTRON_RUN_AS_NODE=1（Electron 系 IDE、部分终端集成会注入），
// Electron 会退化成纯 Node 运行时并拒绝 --remote-debugging-port，E2E 直接无法启动。
// 这个包装器在构建与测试子进程里剔除该变量，保证 `npm run test:e2e` 在任何宿主下行为一致。

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const steps = [
  ['npm', ['run', 'build']],
  [join(root, 'node_modules', '.bin', 'playwright'), ['test']],
]

for (const [command, args] of steps) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' })
  if (result.error) {
    console.error(`[test:e2e] 无法执行 ${command}:`, result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

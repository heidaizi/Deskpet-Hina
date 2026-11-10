import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  // 本机同时跑着桌面应用与语音引擎，偶发超时；失败重试一次不影响判定。
  retries: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
})

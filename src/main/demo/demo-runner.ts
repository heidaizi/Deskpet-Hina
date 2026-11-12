import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { state } from '../app-state'
import { showChatWindow } from '../chat/bridge'
import { ensureAivisEngine } from '../domain/aivis-engine'
import { showSettingsWindow } from '../settings/bridge'

export interface DemoStep {
  type: 'chat' | 'wait' | 'settings' | 'note'
  text?: string
  ms?: number
  tab?: string
  waitForReply?: boolean
}

interface DemoScript {
  steps: DemoStep[]
}

const DEFAULT_STEPS: DemoStep[] = [
  { type: 'note', text: '演示开始' },
  { type: 'chat', text: '在吗？今天有点累。', waitForReply: true, ms: 3000 },
  { type: 'chat', text: '你还记得我昨天说过什么吗？', waitForReply: true, ms: 3500 },
  { type: 'settings', tab: 'relationship', ms: 4500 },
  { type: 'chat', text: '你能知道我现在在做什么吗？', waitForReply: true, ms: 4000 },
  { type: 'chat', text: '用一句话说说你现在的心情。', waitForReply: true, ms: 4000 },
  { type: 'note', text: '演示结束' },
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntil(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 60_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) {
      return true
    }
    await sleep(250)
  }
  return false
}

function loadScript(): DemoStep[] {
  const path = join(app.getAppPath(), 'demo', 'demo-script.json')
  if (!existsSync(path)) {
    return DEFAULT_STEPS
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as DemoScript
    return Array.isArray(parsed.steps) && parsed.steps.length > 0 ? parsed.steps : DEFAULT_STEPS
  } catch (error) {
    console.warn('[demo] 脚本读取失败，使用内置流程:', String(error))
    return DEFAULT_STEPS
  }
}

async function waitForChatReady(): Promise<boolean> {
  await showChatWindow()
  const window = state.chatWindow
  if (!window) {
    return false
  }
  if (!window.webContents.isLoading()) {
    return true
  }
  return new Promise((resolve) => {
    window.webContents.once('did-finish-load', () => resolve(true))
    setTimeout(() => resolve(true), 10_000)
  })
}

async function chatState(): Promise<{ petCount: number; busy: boolean; status: string }> {
  const window = state.chatWindow
  if (!window || window.isDestroyed()) {
    return { petCount: 0, busy: true, status: '窗口已关闭' }
  }
  try {
    return (await window.webContents.executeJavaScript(
      `(() => ({
        petCount: document.querySelectorAll('.chat-row.is-pet').length,
        busy: document.querySelector('#chat-send')?.disabled ?? true,
        status: document.querySelector('#chat-status')?.textContent ?? ''
      }))()`,
      true,
    )) as { petCount: number; busy: boolean; status: string }
  } catch {
    return { petCount: 0, busy: true, status: '读取失败' }
  }
}

async function sendChat(text: string): Promise<void> {
  const window = state.chatWindow
  if (!window || window.isDestroyed()) {
    console.warn('[demo] 聊天窗不可用，跳过:', text)
    return
  }
  const before = await chatState()
  await window.webContents.executeJavaScript(
    `(() => {
      const input = document.querySelector('#chat-input');
      const form = document.querySelector('#chat-form');
      if (!input || !form) return false;
      input.value = ${JSON.stringify(text)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
      return true;
    })()`,
    true,
  )
  // 等待回复：宠物消息数量增加，且输入框恢复可用。
  const ok = await waitUntil(async () => {
    const now = await chatState()
    return now.petCount > before.petCount && !now.busy
  })
  if (!ok) {
    const now = await chatState()
    console.warn('[demo] 等待回复超时:', text, JSON.stringify(now))
  }
}

async function openSettingsTab(tab: string): Promise<void> {
  await showSettingsWindow()
  const window = state.settingsWindow
  if (!window) {
    return
  }
  await waitUntil(() => !window.webContents.isLoading(), 10_000)
  await sleep(600)
  try {
    await window.webContents.executeJavaScript(
      `(() => {
        const button = document.querySelector('#tab-button-${tab}');
        if (button) button.click();
        return Boolean(button);
      })()`,
      true,
    )
  } catch (error) {
    console.warn('[demo] 切换设置标签失败:', String(error))
  }
}

async function runStep(step: DemoStep, index: number): Promise<void> {
  console.log(`[demo] step ${index + 1}: ${step.type} ${step.text ?? step.tab ?? ''}`)
  switch (step.type) {
    case 'chat':
      if (step.text) {
        await sendChat(step.text)
      }
      break
    case 'wait':
      await sleep(step.ms ?? 2000)
      break
    case 'settings':
      await openSettingsTab(step.tab ?? 'relationship')
      break
    case 'note':
      console.log(`[demo] ${step.text ?? ''}`)
      break
  }
  if ((step.ms ?? 0) > 0 && step.type !== 'wait') {
    await sleep(step.ms ?? 0)
  }
}

/** 演示模式：自动打开聊天并依次发送脚本内容。需要 DESKPET_DEMO=1。 */
export async function startDemoRunner(): Promise<void> {
  if (process.env.DESKPET_DEMO !== '1') {
    return
  }
  console.warn('[demo] 演示模式启动；窗口内容保护已关闭，可用于录屏')
  await sleep(2500)
  // 预热引擎，避免第一句等 10 秒。
  void ensureAivisEngine(app.getPath('home'), (message) => console.warn(message))
  if (!(await waitForChatReady())) {
    console.warn('[demo] 聊天窗打开失败，演示终止')
    return
  }
  const steps = loadScript()
  for (let index = 0; index < steps.length; index += 1) {
    if (!app.isReady()) {
      return
    }
    try {
      await runStep(steps[index], index)
    } catch (error) {
      console.warn('[demo] 步骤失败:', String(error))
    }
  }
  console.warn('[demo] 演示流程结束')
}

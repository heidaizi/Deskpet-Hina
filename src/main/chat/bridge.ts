import { app, BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { aiEmotionToExpression } from '../ai/bridge'
import { state } from '../app-state'
import { buildRelationshipPrompt } from '../domain/relationship-context'
import { buildPerceptionPrompt, collectScreenContextFast } from '../perception/screen-context'
import { getLatestScreenVision, requestVisionRefresh } from '../perception/screen-vision'
import { buildVisionPrompt } from '../perception/screen-vision-core'
import {
  buildMediaPrompt,
  buildSchedulePrompt,
  getNowPlaying,
  getSchedule,
} from '../perception/life-context'
import { resolveChatTtsEmotion } from '../../shared/chat-voice'
import { chatSentiment } from '../../shared/chat-sentiment'
import { detectChatIntent } from '../../shared/chat-intent'
import { buildCapabilityPrompt } from './capability-prompt'
import {
  buildMemoryPrompt,
  findExact,
  findSimilar,
  loadTranslationMemory,
  type MemoryEntry,
} from '../domain/translation-memory'
import { DeepSeekClient } from '../domain/deepseek-client'
import { buildGlossaryPrompt, findGlossaryViolations, matchGlossary } from '../domain/glossary'
import { deriveEmotionSeed } from '../domain/local-tts-service'
import { sendRendererCommand } from '../renderer/commands'
import { excludeFromScreenCapture } from '../window/capture'
import type { AiContextInput } from '../../shared/ai-context'
import type { ChatMessageView, ChatSendResult } from '../../shared/types'

const MAX_CHAT_CHARS = 500

function currentContext(): AiContextInput {
  const scene = state.timeSceneContext
  return {
    scene: scene.scene,
    timePeriod: scene.timePeriod,
    // 用本地时间；toISOString() 是 UTC，会让模型报错 8 小时。
    localTime: `${scene.localDate} ${scene.localTime}`,
    isWeekend: scene.isWeekend,
  }
}

export function listChatHistory(limit = 100): ChatMessageView[] {
  return (
    state.conversationBuffer
      ?.recent(limit)
      .filter((turn) => turn.channel === 'chat')
      .map((turn) => ({
        id: turn.id,
        role: turn.role,
        text: turn.text,
        at: turn.at,
        ...(turn.emotion ? { emotion: turn.emotion } : {}),
      })) ?? []
  )
}

let translationMemory: MemoryEntry[] | null = null

function getTranslationMemory(): MemoryEntry[] {
  if (!translationMemory) {
    translationMemory = loadTranslationMemory(
      join(app.getAppPath(), 'content', 'translation-memory.json'),
    )
  }
  return translationMemory
}

export async function sendChatMessage(rawText: string): Promise<ChatSendResult> {
  const text = Array.from(rawText.trim()).slice(0, MAX_CHAT_CHARS).join('')
  if (!text) {
    return { ok: false, error: '说点什么吧。' }
  }
  if (!state.petController?.getSettings().aiEnabled) {
    return { ok: false, error: '对话需要先在设置里启用 DeepSeek。' }
  }
  const key = await state.deepSeekKeyStore?.loadKey()
  if (!key) {
    return { ok: false, error: '请先在设置里保存 DeepSeek API Key。' }
  }

  if (
    state.petController.getSettings().localTtsEnabled &&
    !state.systemPowerState.suspended &&
    !state.systemPowerState.screenLocked
  ) {
    // 与云端请求并行预热，掩盖模型冷启动。
    state.localTtsService?.prewarm()
  }
  const memoryEnabled = state.petController.getSettings().conversationMemoryEnabled
  const history = memoryEnabled ? (state.conversationBuffer?.buildHistory(6, 'chat') ?? []) : []
  state.conversationBuffer?.append('user', text, { channel: 'chat' })

  try {
    const glossaryEntries = matchGlossary(state.glossary, [
      text,
      ...history.map((turn) => turn.content),
    ])
    const glossaryPrompt = [buildGlossaryPrompt(glossaryEntries), buildRelationshipPrompt()]
      .filter(Boolean)
      .join('\n\n')
    const memory = getTranslationMemory()
    const memoryPrompt = buildMemoryPrompt(findSimilar(memory, text, 3))
    const remembered = (await state.longTermMemory?.searchSemantic(text, 3)) ?? []
    const longTermPrompt = state.longTermMemory?.buildPrompt(remembered) ?? ''
    const profilePrompt = state.userProfile?.buildPrompt() ?? ''
    const [media, schedule] = await Promise.all([getNowPlaying(), getSchedule()])
    const capabilities = detectChatIntent(text)
    const wantsPage = capabilities.includes('page') || capabilities.includes('screen')
    const screenContext = await collectScreenContextFast(wantsPage)
    let vision = getLatestScreenVision()
    if (capabilities.includes('screen') && (!vision || Date.now() - vision.at > 10 * 60_000)) {
      // 明确问到屏幕时立即截一张，而不是等 8 分钟的定时任务。
      vision = (await requestVisionRefresh()) ?? vision
    }
    const capabilityPrompt = buildCapabilityPrompt({
      capabilities,
      now: new Date(),
      screen: screenContext,
      vision,
      media,
      schedule,
    })
    const perceptionPrompt = [
      buildPerceptionPrompt(screenContext),
      buildVisionPrompt(vision),
      buildMediaPrompt(media),
      buildSchedulePrompt(schedule),
      capabilityPrompt,
    ]
      .filter(Boolean)
      .join('\n\n')
    const prompt = [glossaryPrompt, profilePrompt, memoryPrompt, longTermPrompt, perceptionPrompt]
      .filter(Boolean)
      .join('\n\n')
    const reply = await new DeepSeekClient({ apiKey: key }).chatReply(
      text,
      history,
      currentContext(),
      prompt,
      glossaryEntries,
    )
    // 已有确认译文的句子直接复用，避免同一句话每次翻得不一样。
    const approved = findExact(memory, reply.reply_zh)
    if (approved) {
      reply.reply_ja = approved.ja
    }
    // 沉淀长期记忆：记录用户话题与回答要点。
    state.longTermMemory?.remember(
      `老师：${text.slice(0, 60)}；日奈：${reply.reply_zh.slice(0, 60)}`,
    )

    state.userProfile?.observe(text)
    // 对话也算一次真实互动：影响好感、心情与主动行为时机。
    const sentiment = chatSentiment(reply.emotion)
    state.lastInteractionAt = Date.now()
    state.autonomousScheduler?.notifyInteraction(state.lastInteractionAt)
    state.petController?.noteChat(sentiment)
    state.presenceController?.notifyChat(sentiment)
    const violations = findGlossaryViolations(glossaryEntries, reply.reply_zh, reply.reply_ja)
    if (violations.length > 0) {
      console.warn(
        '[glossary] 对话翻译未按术语表：',
        violations.map((entry) => entry.zh).join('、'),
      )
    }
    const at = Date.now()
    const id = randomUUID()
    state.conversationBuffer?.append('pet', reply.reply_zh, {
      channel: 'chat',
      emotion: reply.emotion,
    })
    sendRendererCommand({
      action: reply.action,
      expression: aiEmotionToExpression(reply.emotion),
      dialogue: reply.reply_zh,
      spokenText: reply.reply_ja,
      // 对话里固定两档语气，避免每条回复都换一次嗓音。
      ttsEmotion: resolveChatTtsEmotion(reply.emotion, state.relationshipState?.current().id ?? 1),
      ttsSeed: deriveEmotionSeed('deepseek-chat-v1', reply.reply_ja, reply.emotion),
      speakDialogue: true,
    })
    return {
      ok: true,
      message: { id, role: 'pet', text: reply.reply_zh, at, emotion: reply.emotion },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    state.aiLastError = message
    return { ok: false, error: message }
  }
}

export function clearChatHistory(): void {
  // 只清空对话通道，保留“解释选中文字”产生的上下文轮次。
  state.conversationBuffer?.clearChannel('chat')
}

export async function showChatWindow(): Promise<void> {
  if (state.chatWindow && !state.chatWindow.isDestroyed()) {
    state.chatWindow.show()
    state.chatWindow.focus()
    return
  }

  const window = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 360,
    minHeight: 420,
    title: '和日奈说话',
    backgroundColor: '#f7f4ff',
    show: false,
    resizable: true,
    minimizable: true,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  })
  state.chatWindow = window

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })
  excludeFromScreenCapture(window)
  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) {
      window.show()
      window.focus()
    }
  })
  window.on('closed', () => {
    state.chatWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL('chat.html', process.env.ELECTRON_RENDERER_URL).toString()
    await window.loadURL(url)
  } else {
    await window.loadFile(join(__dirname, '../renderer/chat.html'))
  }
}

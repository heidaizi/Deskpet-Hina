import { app, BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { aiEmotionToExpression } from '../ai/bridge'
import { state } from '../app-state'
import { buildRelationshipPrompt } from '../domain/relationship-context'
import { buildWorldStatePrompt, type WorldState } from '../domain/world-state'
import { refreshWorldState } from '../domain/world-state-service'
import { buildPerceptionPrompt, collectScreenContextFast } from '../perception/screen-context'
import { getLatestScreenVision, requestVisionRefresh } from '../perception/screen-vision'
import { buildVisionPrompt } from '../perception/screen-vision-core'
import {
  buildMediaPrompt,
  buildSchedulePrompt,
  getNowPlaying,
  getSchedule,
} from '../perception/life-context'
import { resolveChatTtsDurationScale, resolveChatTtsEmotion } from '../../shared/chat-voice'
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
import {
  cancelExpressions,
  enqueueExpression,
  EXPRESSION_PRIORITY,
} from '../expression/expression-queue'
import { excludeFromScreenCapture } from '../window/capture'
import type { AiContextInput } from '../../shared/ai-context'
import type { ChatMessageView, ChatSendResult } from '../../shared/types'

const MAX_CHAT_CHARS = 500

function currentContext(world?: WorldState): AiContextInput {
  const scene = state.timeSceneContext
  return {
    scene: scene.scene,
    timePeriod: scene.timePeriod,
    // 用本地时间；toISOString() 是 UTC，会让模型报错 8 小时。
    localTime: `${scene.localDate} ${scene.localTime}`,
    isWeekend: scene.isWeekend,
    ...(world
      ? {
          world: {
            outfit: world.outfit.label,
            emotion: world.emotion?.label,
            relationship: world.relationship.title,
            pomodoroMinutesLeft: world.routine.pomodoroMinutesLeft,
          },
        }
      : {}),
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
        ...(turn.stickerId ? { stickerId: turn.stickerId } : {}),
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

export function sendSticker(id: string): ChatSendResult {
  const sticker = state.stickerService?.get(id)
  if (!sticker) {
    return { ok: false, error: '没有找到这张贴纸。' }
  }
  const outfitId = state.petController?.getSettings().rendererId || 'hina-swimsuit'
  if (sticker.outfit && sticker.outfit !== outfitId) {
    return { ok: false, error: '这张贴纸属于另一套服装。' }
  }
  const message: ChatMessageView = {
    id: randomUUID(),
    role: 'pet',
    text: `[贴纸] ${sticker.label}`,
    at: Date.now(),
    stickerId: sticker.id,
  }
  state.conversationBuffer?.append('pet', message.text, {
    channel: 'chat',
    stickerId: sticker.id,
  })
  state.memoryEvents?.record({
    kind: 'sticker',
    summary: `送出「${sticker.label}」贴纸`,
    importance: 1,
  })
  state.petWindow?.webContents.send('pet:sticker', sticker)
  return { ok: true, message }
}

export async function sendChatMessage(rawText: string): Promise<ChatSendResult> {
  const text = Array.from(rawText.trim()).slice(0, MAX_CHAT_CHARS).join('')
  if (!text) {
    return { ok: false, error: '说点什么吧。' }
  }
  cancelExpressions('chat')
  // 作息指令优先处理，即使没有配置 AI 也能用。
  const routine = state.routineService?.handleChatCommand(text)
  if (routine) {
    const message: ChatMessageView = {
      id: randomUUID(),
      role: 'pet',
      text: routine.line.zh,
      at: Date.now(),
      emotion: routine.line.emotion,
    }
    state.conversationBuffer?.append('user', text, { channel: 'chat' })
    state.conversationBuffer?.append('pet', message.text, { channel: 'chat' })
    return { ok: true, message }
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
    const world = await refreshWorldState()
    const media = world.media
    const schedule = world.schedule
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
      buildWorldStatePrompt(world),
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
      currentContext(world),
      prompt,
      glossaryEntries,
    )
    // 已有确认译文的句子直接复用，避免同一句话每次翻得不一样。
    const approved = findExact(memory, reply.reply_zh)
    if (approved) {
      reply.reply_ja = approved.ja
    }
    const parts = [
      { reply_zh: reply.reply_zh, reply_ja: reply.reply_ja },
      ...(reply.followups ?? []),
    ]
    const fullZh = parts.map((part) => part.reply_zh).join('')
    state.memoryEvents?.record({
      kind: 'chat',
      summary: `老师：${text.slice(0, 50)}；日奈：${fullZh.slice(0, 60)}`,
      importance: parts.length > 1 ? 2 : 1,
    })
    // 沉淀长期记忆：记录用户话题与回答要点。
    state.longTermMemory?.remember(`老师：${text.slice(0, 60)}；日奈：${fullZh.slice(0, 120)}`)

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
    const expression = aiEmotionToExpression(reply.emotion)
    const voiceWorld = {
      pomodoroActive: world.routine.pomodoroPhase === 'work',
      fatigue: world.emotion?.fatigue ?? 0,
    }
    const ttsEmotion = resolveChatTtsEmotion(
      reply.emotion,
      state.relationshipState?.current().id ?? 1,
      voiceWorld,
    )
    const ttsDurationScale = resolveChatTtsDurationScale(reply.emotion, voiceWorld)
    // 整条回复共用一个 seed，避免每段像不同 take。
    const replySeed = deriveEmotionSeed(
      'deepseek-chat-v1',
      parts.map((part) => part.reply_ja).join('\n'),
      reply.emotion,
    )
    const messages: ChatMessageView[] = parts.map((part, index) => ({
      id: index === 0 ? randomUUID() : randomUUID(),
      role: 'pet' as const,
      text: part.reply_zh,
      at: at + index,
      emotion: reply.emotion,
    }))
    for (const message of messages) {
      state.conversationBuffer?.append('pet', message.text, {
        channel: 'chat',
        emotion: reply.emotion,
      })
    }
    enqueueExpression({
      source: 'chat',
      priority: EXPRESSION_PRIORITY.chat,
      ttlMs: 120_000,
      segments: parts.map((part) => ({
        command: {
          action: reply.action,
          expression,
          dialogue: part.reply_zh,
          spokenText: part.reply_ja,
          ttsEmotion,
          ttsDurationScale,
          ttsSeed: replySeed,
          speakDialogue: true,
        },
      })),
      onSegmentStart: (index) => {
        if (index > 0 && state.chatWindow && !state.chatWindow.isDestroyed()) {
          state.chatWindow.webContents.send('chat:message', messages[index])
        }
        // 当前段开始播放时，顺手预合成下一段。
        const upcoming = parts[index + 1]
        if (upcoming && state.petController?.getSettings().localTtsEnabled) {
          void state.localTtsService?.synthesize(upcoming.reply_ja, {
            emotion: ttsEmotion,
            durationScale: ttsDurationScale,
            seed: replySeed,
          })
        }
      },
    })
    maybeSendAutoSticker(reply.reply_zh, reply.emotion, world)
    return {
      ok: true,
      message: messages[0],
      followupCount: Math.max(0, messages.length - 1),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    state.aiLastError = message
    return { ok: false, error: message }
  }
}

/** AI 情绪到贴纸情绪的映射；中性情绪不贴。 */
export function stickerMoodForEmotion(emotion: string | undefined): string | null {
  return emotion ? (AUTO_STICKER_MOODS[emotion] ?? null) : null
}

const AUTO_STICKER_MOODS: Record<string, string> = {
  happy: 'happy',
  embarrassed: 'embarrassed',
  reluctant: 'embarrassed',
  annoyed: 'annoyed',
  stern: 'annoyed',
  suspicious: 'annoyed',
  warning: 'annoyed',
  tired: 'calm',
  surprised: 'surprised',
  worried: 'worried',
}

function maybeSendAutoSticker(text: string, emotion: string | undefined, world?: WorldState): void {
  if (!emotion || !state.petController?.getSettings().autoStickerEnabled) {
    return
  }
  const mood = stickerMoodForEmotion(emotion)
  if (!mood) {
    return
  }
  // 专注期间不弹自动贴纸，避免分散注意力。
  if (world?.routine.pomodoroPhase === 'work') {
    return
  }
  const outfitId =
    world?.outfit.id || state.petController.getSettings().rendererId || 'hina-swimsuit'
  const candidates =
    state.stickerService
      ?.listFor(outfitId)
      .stickers.filter((sticker) => sticker.emotion === mood) ?? []
  if (candidates.length === 0) {
    return
  }
  const hash = Array.from(text).reduce((sum, char) => sum + char.codePointAt(0)!, 0)
  const sticker = candidates[hash % candidates.length]
  const message: ChatMessageView = {
    id: randomUUID(),
    role: 'pet',
    text: `[贴纸] ${sticker.label}`,
    at: Date.now(),
    stickerId: sticker.id,
  }
  state.conversationBuffer?.append('pet', message.text, {
    channel: 'chat',
    stickerId: sticker.id,
  })
  state.memoryEvents?.record({
    kind: 'sticker',
    summary: `送出「${sticker.label}」情绪贴纸`,
    importance: 1,
  })
  state.petWindow?.webContents.send('pet:sticker', sticker)
  state.chatWindow?.webContents.send('chat:sticker', message)
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

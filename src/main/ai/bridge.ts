import { globalShortcut } from 'electron'
import { randomUUID } from 'node:crypto'
import {
  AiContextMode,
  AiContextPreview,
  AiPetReply,
  AiSendResult,
  AiServiceStatus,
  MAX_AI_SELECTED_TEXT_CHARACTERS,
} from '../../shared/ai-context'
import { state } from '../app-state'
import { buildRelationshipPrompt } from '../domain/relationship-context'
import { buildPerceptionPrompt, collectScreenContextFast } from '../perception/screen-context'
import { getLatestScreenVision } from '../perception/screen-vision'
import { buildVisionPrompt } from '../perception/screen-vision-core'
import {
  buildMediaPrompt,
  buildSchedulePrompt,
  getNowPlaying,
  getSchedule,
} from '../perception/life-context'
import { PresenceTelemetrySnapshot } from '../../shared/types'
import { buildGlossaryPrompt, findGlossaryViolations, matchGlossary } from '../domain/glossary'
import { showSettingsWindow } from '../settings/bridge'
import { notifyUserInteraction } from '../behavior/autonomous'
import { sendRendererCommand } from '../renderer/commands'
import { DeepSeekClient } from '../domain/deepseek-client'
import { deriveEmotionSeed } from '../domain/local-tts-service'
import { AI_CONTEXT_SHORTCUTS, IS_E2E } from '../config'
export async function getAiServiceStatus(): Promise<AiServiceStatus> {
  const keyStore = state.deepSeekKeyStore
  const settings = state.petController?.getSettings()
  const diagnostics = state.presenceController?.getDiagnostics()
  return {
    enabled: settings?.aiEnabled ?? false,
    proactiveEnabled: Boolean(settings?.aiEnabled && settings.aiProactiveEnabled),
    proactiveRequestsLastHour: diagnostics?.proactiveAiRequestsLastHour ?? 0,
    proactiveRequestLimit: diagnostics?.proactiveAiRequestLimit ?? 4,
    proactiveLastOutcome: diagnostics?.lastProactiveAiOutcome ?? null,
    proactiveLastIntent: diagnostics?.lastProactiveAiIntent ?? null,
    keyConfigured: keyStore ? await keyStore.hasKey() : false,
    encryptionAvailable: keyStore ? await keyStore.isEncryptionAvailable() : false,
    accessibilityTrusted: state.aiContextService?.isAccessibilityTrusted(false) ?? false,
    model: 'deepseek-chat',
    ...(state.aiLastError ? { lastError: state.aiLastError } : {}),
  }
}

export function emptyPresenceTelemetry(): PresenceTelemetrySnapshot {
  return {
    sampledAt: Date.now(),
    uptimeMs: 0,
    sceneSamples: 0,
    decisions: 0,
    silentDecisions: 0,
    performed: 0,
    speeches: 0,
    proactiveRequests: 0,
    proactiveFallbacks: 0,
    proactiveCancellations: 0,
    repeatedDialoguesSuppressed: 0,
    repeatedIdleClipsSuppressed: 0,
    actionInterruptions: 0,
    recoveryCompletions: 0,
    voiceInterruptions: 0,
    rules: {},
  }
}

export function clearPendingAiContext(): void {
  if (!state.pendingAiContext) {
    return
  }
  clearTimeout(state.pendingAiContext.timer)
  state.pendingAiContext = null
}

export async function createAiContextPreview(mode: AiContextMode): Promise<AiContextPreview> {
  if (!state.petController?.getSettings().aiEnabled) {
    throw new Error('请先在设置中启用 DeepSeek AI。')
  }
  const settings = state.petController.getSettings()
  if (mode === 'selection' && !settings.aiSelectedTextEnabled) {
    throw new Error('请先在 AI 设置中允许读取选中文字。')
  }
  if (!state.aiContextService) {
    throw new Error('AI 上下文服务尚未就绪。')
  }
  const captured = await state.aiContextService.createContext(mode, {
    includeWindowTitle: settings.aiWindowTitleEnabled,
    includeSelectedText: settings.aiSelectedTextEnabled,
  })
  clearPendingAiContext()
  const now = Date.now()
  const preview: AiContextPreview = {
    id: randomUUID(),
    mode,
    createdAt: now,
    expiresAt: now + 120_000,
    context: captured.context,
    manualSelectionRequired: captured.manualSelectionRequired,
    selectedTextTruncated: captured.selectedTextTruncated,
    selectedTextCharacters: Array.from(captured.context.selectedText ?? '').length,
    windowTitleCharacters: Array.from(captured.context.windowTitle ?? '').length,
  }
  const timer = setTimeout(() => {
    if (state.pendingAiContext?.preview.id === preview.id) {
      state.pendingAiContext = null
    }
  }, 120_000)
  state.pendingAiContext = {
    preview,
    context: captured.context,
    timer,
  }
  return preview
}

export async function openAiContext(mode: AiContextMode): Promise<void> {
  state.aiLastError = undefined
  try {
    const preview = await createAiContextPreview(mode)
    await showSettingsWindow()
    state.settingsWindow?.webContents.send('ai:context-prepared', preview)
  } catch (error) {
    state.aiLastError = error instanceof Error ? error.message : String(error)
    await showSettingsWindow()
    state.settingsWindow?.webContents.send('ai:context-error', state.aiLastError)
  }
}

export async function sendPendingAiContext(
  id: string,
  manualSelectedText?: string,
): Promise<AiSendResult> {
  if (!state.pendingAiContext || state.pendingAiContext.preview.id !== id) {
    throw new Error('AI 上下文已失效，请重新读取。')
  }
  if (state.pendingAiContext.preview.expiresAt < Date.now()) {
    clearPendingAiContext()
    throw new Error('AI 上下文已过期，请重新读取。')
  }
  if (!state.petController?.getSettings().aiEnabled) {
    throw new Error('DeepSeek AI 未启用。')
  }
  const context = { ...state.pendingAiContext.context }
  if (state.pendingAiContext.preview.manualSelectionRequired) {
    const manualText = manualSelectedText?.trim() ?? ''
    if (!manualText) {
      throw new Error('请先从目标应用复制文字，再粘贴到预览框。')
    }
    context.selectedText = Array.from(manualText).slice(0, MAX_AI_SELECTED_TEXT_CHARACTERS).join('')
  }
  const key = await state.deepSeekKeyStore?.loadKey()
  if (!key) {
    throw new Error('请先保存 DeepSeek API Key。')
  }
  clearPendingAiContext()
  state.aiLastError = undefined
  notifyUserInteraction()
  if (
    state.petController?.getSettings().localTtsEnabled &&
    !state.systemPowerState.suspended &&
    !state.systemPowerState.screenLocked
  ) {
    state.localTtsService?.prewarm()
  }
  sendRendererCommand({
    action: 'look_at_cursor',
    expression: 'neutral',
    dialogue: '……让我看一下。',
    speakDialogue: true,
  })
  const memoryEnabled = state.petController?.getSettings().conversationMemoryEnabled ?? true
  const history = memoryEnabled ? (state.conversationBuffer?.buildHistory(4) ?? []) : []
  const startedAt = Date.now()
  try {
    const glossaryEntries = matchGlossary(state.glossary, [
      context.selectedText,
      context.windowTitle,
    ])
    const [media, schedule] = await Promise.all([getNowPlaying(), getSchedule()])
    const perceptionPrompt = [
      buildPerceptionPrompt(await collectScreenContextFast()),
      buildVisionPrompt(getLatestScreenVision()),
      buildMediaPrompt(media),
      buildSchedulePrompt(schedule),
    ]
      .filter(Boolean)
      .join('\n\n')
    const glossaryPrompt = [
      buildGlossaryPrompt(glossaryEntries),
      buildRelationshipPrompt(),
      perceptionPrompt,
    ]
      .filter(Boolean)
      .join('\n\n')
    const reply = await new DeepSeekClient({ apiKey: key }).reply(
      context,
      history,
      glossaryPrompt,
      glossaryEntries,
    )
    const violations = findGlossaryViolations(glossaryEntries, reply.reply_zh, reply.reply_ja)
    if (violations.length > 0) {
      console.warn('[glossary] 翻译未按术语表：', violations.map((entry) => entry.zh).join('、'))
    }
    if (memoryEnabled) {
      // 记录本轮问答：主动开口只带摘要，这里保留完整语境供后续追问。
      const promptText = context.selectedText
        ? `帮我看看这段：${context.selectedText}`
        : `（${context.scene}·${context.timePeriod}）你现在在做什么？`
      state.conversationBuffer?.append('user', promptText)
      state.conversationBuffer?.append('pet', reply.reply_zh, { emotion: reply.emotion })
    }
    sendRendererCommand({
      action: reply.action,
      expression: aiEmotionToExpression(reply.emotion),
      dialogue: reply.reply_zh,
      spokenText: reply.reply_ja,
      ttsEmotion: reply.emotion,
      ttsSeed: deriveEmotionSeed('deepseek-reply-v1', reply.reply_ja, reply.emotion),
      speakDialogue: true,
    })
    return {
      reply,
      elapsedMs: Date.now() - startedAt,
    }
  } catch (error) {
    state.aiLastError = error instanceof Error ? error.message : String(error)
    sendRendererCommand({
      action: 'annoyed',
      expression: 'annoyed',
      dialogue: '……云端暂时没有回应。稍后再试。',
      speakDialogue: false,
    })
    throw error
  }
}

export function aiEmotionToExpression(emotion: AiPetReply['emotion']) {
  if (emotion === 'tired') {
    return 'sleepy' as const
  }
  if (
    emotion === 'annoyed' ||
    emotion === 'stern' ||
    emotion === 'suspicious' ||
    emotion === 'warning'
  ) {
    return 'annoyed' as const
  }
  if (emotion === 'embarrassed' || emotion === 'reluctant') {
    return 'embarrassed' as const
  }
  return 'neutral' as const
}

export function registerAiContextShortcuts(): void {
  globalShortcut.register(AI_CONTEXT_SHORTCUTS.task.accelerator, () => {
    void openAiContext('task')
  })
  globalShortcut.register(AI_CONTEXT_SHORTCUTS.selection.accelerator, () => {
    void openAiContext('selection')
  })
}

export function scheduleAiTtsWarmup(): void {
  // 默认不预热：Irodori 模型约 11 GB，启动即加载会让冷启动成本不可预期。
  // 需要预热时显式设置 DESKPET_IRODORI_PREWARM=1，或在设置页点击“预加载声线”。
  if (IS_E2E || process.env.DESKPET_IRODORI_PREWARM !== '1') {
    return
  }
  setTimeout(() => {
    if (
      state.petController?.getSettings().aiEnabled &&
      state.petController.getSettings().localTtsEnabled &&
      !state.systemPowerState.suspended &&
      !state.systemPowerState.screenLocked
    ) {
      state.localTtsService?.prewarm()
    }
  }, 3_000)
}

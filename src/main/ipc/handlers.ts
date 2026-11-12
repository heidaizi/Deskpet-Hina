import { clearChatHistory, listChatHistory, sendChatMessage, showChatWindow } from '../chat/bridge'
import { isChatSender } from './validators'
import {
  getActiveLease,
  getDecisionObservationCount,
  releaseDecision,
} from '../behavior/decision-bus'
import { getLastError } from '../system/error-log'
import { app, ipcMain, shell } from 'electron'
import { getOutfitGreeting } from '../domain/outfit-voice'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { beginWindowDrag, endWindowDrag, moveWindowDrag } from '../window/drag'
import {
  isDeliveryLifecycleEvent,
  isDeskpetSender,
  isHitArea,
  isLocalSpeechOptions,
  isPerformanceLifecycleEvent,
  isPetInteraction,
  isPetSender,
  isPoint,
  isSettingsPatch,
} from './validators'
import { state } from '../app-state'

const speechStreams = new Map<string, AbortController>()
import { showContextMenu } from '../window/pet-window'
import {
  InteractionResult,
  LocalSpeechOptions,
  LocalSpeechResult,
  ResourceSnapshot,
  RuntimeInfo,
  SettingsSnapshot,
  SystemPowerState,
  TtsResourceStatus,
} from '../../shared/types'
import { notifyUserInteraction } from '../behavior/autonomous'
import { getVoicePerformanceStyle } from '../presence/emotion-engine'
import { deriveEmotionSeed } from '../domain/local-tts-service'
import { showSettingsWindow, updateAppSettings } from '../settings/bridge'
import { isHinaSwimsuitAnimation } from '../../shared/model-animations'
import { getResourceSnapshot } from '../system/resources'
import { TimeSceneContext } from '../../shared/time-scene'
import {
  AiContextPreview,
  AiSendResult,
  AiServiceStatus,
  isAiContextMode,
} from '../../shared/ai-context'
import {
  clearPendingAiContext,
  createAiContextPreview,
  emptyPresenceTelemetry,
  getAiServiceStatus,
  sendPendingAiContext,
} from '../ai/bridge'
import { IS_E2E, presenceMode } from '../config'
import { buildMenuTemplate } from '../tray/tray'
import { getScreenVisionStatus } from '../perception/screen-vision'
import { getPermissionSnapshot, openPermissionSettings } from '../system/permissions'
import { isPermissionService, type PermissionSnapshot } from '../../shared/permissions'
import { isProfileCategory } from '../../shared/memory'
export function registerIpcHandlers(): void {
  ipcMain.on('pet:hit-areas', (event, areas: unknown) => {
    if (!isPetSender(event.sender) || !Array.isArray(areas)) {
      return
    }
    state.hitAreas = areas.filter(isHitArea)
  })

  ipcMain.on('presence:delivery-event', (event, value: unknown) => {
    if (isPetSender(event.sender) && isDeliveryLifecycleEvent(value)) {
      state.presenceController?.handleDeliveryEvent(value)
      if (value.type === 'speech_interrupted') {
        releaseDecision('presence')
      }
    }
  })

  ipcMain.on('presence:performance-event', (event, value: unknown) => {
    if (isPetSender(event.sender) && isPerformanceLifecycleEvent(value)) {
      state.presenceController?.handlePerformanceEvent(value)
      // 演出结束或被用户打断后立即释放占用，避免把环境行为锁到租约过期。
      if (
        value.type === 'action_completed' ||
        value.type === 'action_interrupted' ||
        value.type === 'recovery_completed'
      ) {
        releaseDecision('presence')
      }
    }
  })

  ipcMain.handle('outfit:greeting', (_event, scene) => {
    const outfitId =
      state.petController?.getSettings().rendererId ||
      state.petController
        ?.getSettingsSnapshot()
        .character.renderers.find(
          (renderer) => renderer.mode === '3d' && renderer.status === 'available',
        )?.id ||
      ''
    const safeScene = scene === 'return' ? 'return' : 'login'
    return getOutfitGreeting(join(app.getAppPath(), 'content'), outfitId, safeScene)
  })

  ipcMain.on('chat:open', () => {
    void showChatWindow()
  })

  ipcMain.handle('chat:history', (event) => {
    if (!isChatSender(event.sender)) {
      throw new Error('Invalid chat request.')
    }
    return listChatHistory()
  })

  ipcMain.handle('chat:send', async (event, value: unknown) => {
    if (!isChatSender(event.sender) || typeof value !== 'string') {
      throw new Error('Invalid chat request.')
    }
    return sendChatMessage(value)
  })

  ipcMain.handle('chat:clear', (event) => {
    if (!isChatSender(event.sender)) {
      throw new Error('Invalid chat request.')
    }
    clearChatHistory()
  })

  ipcMain.handle('memory:semantic-list', (event) => {
    if (!isDeskpetSender(event.sender)) {
      throw new Error('Invalid semantic memory request.')
    }
    return state.semanticMemory?.list() ?? []
  })

  ipcMain.handle('memory:semantic-add', (event, text: unknown) => {
    if (!isDeskpetSender(event.sender) || typeof text !== 'string') {
      throw new Error('Invalid semantic memory request.')
    }
    state.semanticMemory?.remember(text)
    return state.semanticMemory?.list() ?? []
  })

  ipcMain.handle('memory:semantic-update', (event, value: unknown) => {
    if (!isDeskpetSender(event.sender) || !state.semanticMemory) {
      throw new Error('Invalid semantic memory request.')
    }
    const payload = value as { id?: unknown; text?: unknown }
    if (typeof payload?.id !== 'string' || typeof payload.text !== 'string') {
      throw new Error('Invalid semantic memory request.')
    }
    return state.semanticMemory.update(payload.id.slice(0, 100), payload.text.slice(0, 400))
  })

  ipcMain.handle('memory:semantic-delete', (event, id: unknown) => {
    if (!isDeskpetSender(event.sender) || typeof id !== 'string') {
      throw new Error('Invalid semantic memory request.')
    }
    return state.semanticMemory?.delete(id) ?? []
  })

  ipcMain.handle('memory:semantic-clear', (event) => {
    if (!isDeskpetSender(event.sender)) {
      throw new Error('Invalid semantic memory request.')
    }
    state.semanticMemory?.clear()
    return state.semanticMemory?.list() ?? []
  })

  ipcMain.handle('memory:profile-list', (event) => {
    if (!isDeskpetSender(event.sender)) {
      throw new Error('Invalid profile memory request.')
    }
    return state.userProfile?.list() ?? []
  })

  ipcMain.handle('memory:profile-add', (event, value: unknown) => {
    if (!isDeskpetSender(event.sender) || !state.userProfile) {
      throw new Error('Invalid profile memory request.')
    }
    const payload = value as { category?: unknown; text?: unknown }
    if (!isProfileCategory(payload?.category) || typeof payload.text !== 'string') {
      throw new Error('Invalid profile memory request.')
    }
    state.userProfile.addManual(payload.category, payload.text.slice(0, 200))
    return state.userProfile.list()
  })

  ipcMain.handle('memory:profile-update', (event, value: unknown) => {
    if (!isDeskpetSender(event.sender) || !state.userProfile) {
      throw new Error('Invalid profile memory request.')
    }
    const payload = value as { id?: unknown; text?: unknown }
    if (typeof payload?.id !== 'string' || typeof payload.text !== 'string') {
      throw new Error('Invalid profile memory request.')
    }
    return state.userProfile.update(payload.id, payload.text.slice(0, 200))
  })

  ipcMain.handle('memory:profile-delete', (event, id: unknown) => {
    if (!isDeskpetSender(event.sender) || !state.userProfile || typeof id !== 'string') {
      throw new Error('Invalid profile memory request.')
    }
    return state.userProfile.delete(id)
  })

  ipcMain.handle('memory:profile-pin', (event, value: unknown) => {
    if (!isDeskpetSender(event.sender) || !state.userProfile) {
      throw new Error('Invalid profile memory request.')
    }
    const payload = value as { id?: unknown; pinned?: unknown }
    if (typeof payload?.id !== 'string' || typeof payload.pinned !== 'boolean') {
      throw new Error('Invalid profile memory request.')
    }
    return state.userProfile.setPinned(payload.id, payload.pinned)
  })

  ipcMain.handle('memory:profile-clear', (event) => {
    if (!isDeskpetSender(event.sender) || !state.userProfile) {
      throw new Error('Invalid profile memory request.')
    }
    state.userProfile.clear()
    return state.userProfile.list()
  })

  ipcMain.handle('memory:longterm-list', (event) => {
    if (!isDeskpetSender(event.sender)) {
      throw new Error('Invalid long-term memory request.')
    }
    return state.longTermMemory?.list() ?? []
  })

  ipcMain.handle('memory:longterm-update', (event, value: unknown) => {
    if (!isDeskpetSender(event.sender) || !state.longTermMemory) {
      throw new Error('Invalid long-term memory request.')
    }
    const payload = value as { id?: unknown; text?: unknown }
    if (typeof payload?.id !== 'string' || typeof payload.text !== 'string') {
      throw new Error('Invalid long-term memory request.')
    }
    return state.longTermMemory.update(payload.id, payload.text.slice(0, 500))
  })

  ipcMain.handle('memory:longterm-delete', (event, id: unknown) => {
    if (!isDeskpetSender(event.sender) || !state.longTermMemory || typeof id !== 'string') {
      throw new Error('Invalid long-term memory request.')
    }
    return state.longTermMemory.delete(id)
  })

  ipcMain.handle('memory:longterm-clear', (event) => {
    if (!isDeskpetSender(event.sender) || !state.longTermMemory) {
      throw new Error('Invalid long-term memory request.')
    }
    state.longTermMemory.clear()
    return state.longTermMemory.list()
  })

  ipcMain.handle('memory:conversation-stats', (event) => {
    if (!isDeskpetSender(event.sender)) {
      throw new Error('Invalid conversation memory request.')
    }
    return { turns: state.conversationBuffer?.size() ?? 0 }
  })

  ipcMain.handle('memory:conversation-clear', (event) => {
    if (!isDeskpetSender(event.sender)) {
      throw new Error('Invalid conversation memory request.')
    }
    state.conversationBuffer?.clear()
    return { turns: state.conversationBuffer?.size() ?? 0 }
  })

  ipcMain.handle('presence:memory-list', (event) => {
    if (!isDeskpetSender(event.sender) || !state.presenceController) {
      throw new Error('Presence memory is not available.')
    }
    return state.presenceController.getEpisodicMemories()
  })

  ipcMain.handle('presence:memory-delete', (event, id: unknown) => {
    if (!isDeskpetSender(event.sender) || !state.presenceController || typeof id !== 'string') {
      throw new Error('Invalid presence memory request.')
    }
    return state.presenceController.deleteEpisodicMemory(id.slice(0, 160))
  })

  ipcMain.handle('presence:memory-clear', (event): void => {
    if (!isDeskpetSender(event.sender) || !state.presenceController) {
      throw new Error('Presence memory is not available.')
    }
    state.presenceController.clearEpisodicMemories()
  })

  ipcMain.on('window:drag-begin', (event, point: unknown) => {
    if (isPetSender(event.sender) && isPoint(point)) {
      beginWindowDrag(point)
    }
  })

  ipcMain.on('window:drag-move', (event, point: unknown) => {
    if (isPetSender(event.sender) && isPoint(point)) {
      moveWindowDrag(point)
    }
  })

  ipcMain.on('window:drag-end', (event) => {
    if (isPetSender(event.sender)) {
      endWindowDrag()
    }
  })

  ipcMain.on('pet:show-context-menu', (event) => {
    if (isPetSender(event.sender)) {
      showContextMenu()
    }
  })

  ipcMain.handle('pet:interact', (event, interaction: unknown): InteractionResult => {
    if (!isPetSender(event.sender) || !isPetInteraction(interaction)) {
      throw new Error('Invalid pet interaction request.')
    }
    if (!state.petController) {
      throw new Error('Pet controller is not ready.')
    }
    notifyUserInteraction(interaction.kind !== 'drag', interaction)
    const deliveryId = randomUUID()
    const performanceToken = randomUUID()
    state.presenceController?.handlePerformanceScheduled(performanceToken)
    state.presenceController?.handleDeliveryScheduled(deliveryId)
    const result = state.petController.interact(interaction)
    const voiceEmotion = state.presenceController?.getEmotionVoice()
    const emotionState = state.presenceController?.getEmotionState()
    const affectionLevel = state.petController.getSettingsSnapshot().state.affectionLevel
    const voiceStyle = emotionState
      ? getVoicePerformanceStyle(emotionState, affectionLevel, voiceEmotion)
      : null
    return {
      ...result,
      deliveryId,
      performanceToken,
      ...(voiceStyle ? { ttsEmotion: voiceStyle.emotion } : {}),
      ...(voiceStyle
        ? {
            ttsSeed: deriveEmotionSeed(
              'presence-interaction-v1',
              result.dialogue,
              voiceStyle.emotion,
              voiceStyle.activationBucket,
            ),
            ttsDurationScale: voiceStyle.durationScale,
          }
        : {}),
    }
  })

  ipcMain.handle('settings:get', (event): SettingsSnapshot => {
    if (!isDeskpetSender(event.sender) || !state.petController) {
      throw new Error('Settings are not available.')
    }
    return state.petController.getSettingsSnapshot()
  })

  ipcMain.handle('settings:update', (event, patch: unknown): SettingsSnapshot => {
    if (!isDeskpetSender(event.sender) || !isSettingsPatch(patch) || !state.petController) {
      throw new Error('Invalid settings update.')
    }
    const snapshot = updateAppSettings(patch)
    if (!snapshot) {
      throw new Error('Settings are not available.')
    }
    return snapshot
  })

  ipcMain.handle('pet:preview-model-clip', (event, clip: unknown): boolean => {
    if (
      !isDeskpetSender(event.sender) ||
      !isHinaSwimsuitAnimation(clip) ||
      !state.petWindow ||
      state.petWindow.isDestroyed() ||
      state.petController?.getSettings().rendererMode !== '3d'
    ) {
      return false
    }
    state.petWindow.webContents.send('pet:preview-model-clip', clip)
    return true
  })

  ipcMain.on('speech:stream-start', (event, value: unknown) => {
    if (!isPetSender(event.sender) || !state.localTtsService) {
      return
    }
    const payload = value as { streamId?: unknown; text?: unknown; options?: LocalSpeechOptions }
    if (typeof payload?.streamId !== 'string' || typeof payload?.text !== 'string') {
      return
    }
    const streamId = payload.streamId
    const sender = event.sender
    const controller = new AbortController()
    speechStreams.set(streamId, controller)
    void state.localTtsService
      .streamSynthesize(
        payload.text,
        payload.options,
        (audio, index) => {
          if (!sender.isDestroyed()) {
            sender.send('speech:chunk', { streamId, index, audio })
          }
        },
        controller.signal,
      )
      .then((ok) => {
        speechStreams.delete(streamId)
        if (!sender.isDestroyed()) {
          sender.send('speech:stream-end', { streamId, ok })
        }
      })
  })

  ipcMain.on('speech:stream-cancel', (event, streamId: unknown) => {
    if (!isPetSender(event.sender) || typeof streamId !== 'string') {
      return
    }
    speechStreams.get(streamId)?.abort()
    speechStreams.delete(streamId)
  })

  ipcMain.handle(
    'speech:local-tts',
    async (event, payload: unknown): Promise<LocalSpeechResult | null> => {
      const text =
        typeof payload === 'string'
          ? payload
          : payload && typeof payload === 'object'
            ? (payload as { text?: unknown }).text
            : undefined
      const options =
        payload && typeof payload === 'object'
          ? (payload as { options?: unknown }).options
          : undefined
      if (
        !isDeskpetSender(event.sender) ||
        typeof text !== 'string' ||
        (options !== undefined && !isLocalSpeechOptions(options)) ||
        !state.localTtsService ||
        !state.petController?.getSettings().localTtsEnabled
      ) {
        return null
      }
      return state.localTtsService.synthesize(text, options as LocalSpeechOptions | undefined)
    },
  )

  ipcMain.handle('resources:get', async (event): Promise<ResourceSnapshot> => {
    if (!isDeskpetSender(event.sender)) {
      throw new Error('Resource information is not available to this window.')
    }
    return getResourceSnapshot()
  })

  ipcMain.handle('speech:unload', (event): TtsResourceStatus => {
    if (!isDeskpetSender(event.sender) || !state.localTtsService) {
      throw new Error('Local TTS is not available.')
    }
    state.localTtsService.stop()
    return state.localTtsService.getStatus()
  })

  ipcMain.handle('speech:preload', (event): TtsResourceStatus => {
    if (!isDeskpetSender(event.sender) || !state.localTtsService || !state.petController) {
      throw new Error('Local TTS is not available.')
    }
    state.localTtsService.setEnabled(state.petController.getSettings().localTtsEnabled)
    if (!state.systemPowerState.suspended && !state.systemPowerState.screenLocked) {
      state.localTtsService.prewarm()
    }
    return state.localTtsService.getStatus()
  })

  ipcMain.handle('app:system-power-state', (event): SystemPowerState => {
    if (!isDeskpetSender(event.sender)) {
      throw new Error('System power state is not available to this window.')
    }
    return state.systemPowerState
  })

  ipcMain.handle('app:time-scene', (event): TimeSceneContext => {
    if (!isDeskpetSender(event.sender)) {
      throw new Error('Time and scene context is not available to this window.')
    }
    return structuredClone(state.timeSceneContext)
  })

  ipcMain.handle(
    'permissions:get',
    async (event, probeAutomation: unknown): Promise<PermissionSnapshot> => {
      if (!isDeskpetSender(event.sender)) {
        throw new Error('Permission status is not available to this window.')
      }
      return getPermissionSnapshot(probeAutomation === true)
    },
  )

  ipcMain.handle('permissions:open', async (event, service: unknown): Promise<void> => {
    if (!isDeskpetSender(event.sender) || !isPermissionService(service)) {
      throw new Error('Permission settings request is invalid.')
    }
    await openPermissionSettings(service)
  })

  ipcMain.handle('ai:status', async (event): Promise<AiServiceStatus> => {
    if (!isDeskpetSender(event.sender)) {
      throw new Error('AI status is not available to this window.')
    }
    return getAiServiceStatus()
  })

  ipcMain.handle('ai:save-key', async (event, key: unknown): Promise<AiServiceStatus> => {
    if (!isDeskpetSender(event.sender) || typeof key !== 'string' || key.length > 500) {
      throw new Error('DeepSeek API Key 无效。')
    }
    if (!state.deepSeekKeyStore) {
      throw new Error('DeepSeek Key 存储尚未就绪。')
    }
    await state.deepSeekKeyStore.saveKey(key)
    state.aiLastError = undefined
    return getAiServiceStatus()
  })

  ipcMain.handle('ai:delete-key', async (event): Promise<AiServiceStatus> => {
    if (!isDeskpetSender(event.sender) || !state.deepSeekKeyStore) {
      throw new Error('DeepSeek Key 存储不可用。')
    }
    state.deepSeekKeyStore.deleteKey()
    state.aiLastError = undefined
    return getAiServiceStatus()
  })

  ipcMain.handle('ai:request-accessibility', async (event): Promise<AiServiceStatus> => {
    if (!isDeskpetSender(event.sender) || !state.aiContextService) {
      throw new Error('辅助功能状态不可用。')
    }
    const trusted = state.aiContextService.isAccessibilityTrusted(true)
    state.aiLastError = trusted
      ? undefined
      : '请在系统设置 → 隐私与安全性 → 辅助功能中允许空崎日奈。'
    return getAiServiceStatus()
  })

  ipcMain.handle('ai:prepare-context', async (event, mode: unknown) => {
    if (!isDeskpetSender(event.sender) || !isAiContextMode(mode)) {
      throw new Error('AI 上下文类型无效。')
    }
    return createAiContextPreview(mode)
  })

  ipcMain.handle('ai:pending-context', (event): AiContextPreview | null => {
    if (!isDeskpetSender(event.sender)) {
      throw new Error('AI 上下文不可用。')
    }
    return state.pendingAiContext ? structuredClone(state.pendingAiContext.preview) : null
  })

  ipcMain.handle(
    'ai:send-context',
    async (event, id: unknown, manualSelectedText: unknown): Promise<AiSendResult> => {
      if (
        !isDeskpetSender(event.sender) ||
        typeof id !== 'string' ||
        (manualSelectedText !== undefined &&
          (typeof manualSelectedText !== 'string' || manualSelectedText.length > 20_000))
      ) {
        throw new Error('AI 请求无效。')
      }
      return sendPendingAiContext(id, manualSelectedText as string | undefined)
    },
  )

  ipcMain.handle('ai:cancel-context', (event, id: unknown): void => {
    if (!isDeskpetSender(event.sender) || typeof id !== 'string') {
      throw new Error('AI 取消失败。')
    }
    if (state.pendingAiContext?.preview.id === id) {
      clearPendingAiContext()
    }
  })

  ipcMain.handle('settings:reset-state', (event): SettingsSnapshot => {
    if (!isDeskpetSender(event.sender) || !state.petController) {
      throw new Error('Pet state is not available.')
    }
    return state.petController.resetState()
  })

  ipcMain.on('settings:open', (event) => {
    if (isPetSender(event.sender)) {
      void showSettingsWindow()
    }
  })

  ipcMain.handle('settings:open-data-directory', async (event): Promise<void> => {
    if (!isDeskpetSender(event.sender)) {
      throw new Error('Data directory is not available to this window.')
    }
    const error = await shell.openPath(app.getPath('userData'))
    if (error) {
      throw new Error(error)
    }
  })

  ipcMain.handle('character:load-asset', (event, assetPath: unknown): Uint8Array => {
    if (!isDeskpetSender(event.sender) || typeof assetPath !== 'string') {
      throw new Error('Character asset request is invalid.')
    }

    const assetsRoot = resolve(app.getAppPath(), 'assets')
    const resolvedPath = resolve(app.getAppPath(), assetPath)
    const relativePath = relative(assetsRoot, resolvedPath)
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error('Character asset path is outside the public asset root.')
    }
    return readFileSync(resolvedPath)
  })

  ipcMain.on('settings:renderer-failure', (event, message: unknown) => {
    if (!isPetSender(event.sender)) {
      return
    }
    console.error('Renderer failed and will fall back to 2D:', message)
    updateAppSettings({ rendererMode: '2d' })
  })

  ipcMain.handle('app:runtime-info', (event): RuntimeInfo => {
    if (!isDeskpetSender(event.sender)) {
      throw new Error('Runtime information is not available to this window.')
    }
    const presenceDiagnostics = state.presenceController?.getDiagnostics()
    return {
      milestone: 'M5',
      renderer: 'multi-renderer',
      e2e: IS_E2E,
      presenceMode,
      presenceAutonomyEnabled: state.petController?.getSettings().presenceAutonomyEnabled ?? true,
      presenceIntensity: state.petController?.getSettings().presenceIntensity ?? 'balanced',
      presenceSpeechState: presenceDiagnostics?.speechState ?? 'idle',
      presencePerformanceState: presenceDiagnostics?.performanceState ?? 'idle',
      presenceActivePerformanceToken: presenceDiagnostics?.activePerformanceToken ?? null,
      presenceLastPerformanceEvent: presenceDiagnostics?.lastPerformanceEvent ?? null,
      presenceLastRuleId: presenceDiagnostics?.lastRuleId ?? null,
      presenceLastDecision: presenceDiagnostics?.lastDecision ?? null,
      decisionObservations: getDecisionObservationCount(),
      decisionSource: getActiveLease()?.source ?? null,
      decisionUntil: getActiveLease()?.expiresAt ?? null,
      lastErrorAt: getLastError()?.at ?? null,
      lastErrorMessage: getLastError()?.message ?? null,
      presenceEmotionEnabled: presenceDiagnostics?.emotionEnabled ?? false,
      presenceEmotionDominant: presenceDiagnostics?.emotionDominant ?? null,
      presenceValence: presenceDiagnostics?.emotionValence ?? null,
      presenceActivation: presenceDiagnostics?.emotionActivation ?? null,
      presenceFatigue: presenceDiagnostics?.emotionFatigue ?? null,
      presencePatience: presenceDiagnostics?.emotionPatience ?? null,
      presenceSocialBattery: presenceDiagnostics?.emotionSocialBattery ?? null,
      presenceMemoryCount: presenceDiagnostics?.memoryCount ?? 0,
      presenceProactiveAiEnabled: Boolean(
        state.petController?.getSettings().aiEnabled &&
        state.petController.getSettings().aiProactiveEnabled,
      ),
      presenceProactiveAiRequestsLastHour: presenceDiagnostics?.proactiveAiRequestsLastHour ?? 0,
      presenceProactiveAiRequestLimit: presenceDiagnostics?.proactiveAiRequestLimit ?? 4,
      presenceLastProactiveAiOutcome: presenceDiagnostics?.lastProactiveAiOutcome ?? null,
      presenceLastProactiveAiIntent: presenceDiagnostics?.lastProactiveAiIntent ?? null,
      presenceTelemetry: state.presenceController?.getTelemetry() ?? emptyPresenceTelemetry(),
      screenPerception: getScreenVisionStatus(),
      trayReady: Boolean(state.tray && !state.tray.isDestroyed()),
      trayTitle: state.tray?.getTitle() ?? '',
      trayMenuLabels: buildMenuTemplate()
        .map((item) => (typeof item.label === 'string' ? item.label : null))
        .filter((label): label is string => Boolean(label)),
      clickThroughShortcutLabel: state.activeClickThroughShortcut?.label ?? null,
    }
  })
}

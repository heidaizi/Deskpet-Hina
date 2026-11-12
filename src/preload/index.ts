import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  ChatMessageView,
  ChatSendResult,
  DeskpetApi,
  DeliveryLifecycleEvent,
  HitArea,
  InteractionResult,
  LocalSpeechOptions,
  LocalSpeechResult,
  PerformanceLifecycleEvent,
  PetInteraction,
  Point2D,
  ResourceSnapshot,
  RendererCommand,
  SemanticMemoryView,
  RendererModeCommand,
  RuntimeInfo,
  SettingsSnapshot,
  SystemPowerState,
  TtsResourceStatus,
} from '../shared/types'
import type { TimeSceneContext } from '../shared/time-scene'
import type { EpisodicMemory } from '../shared/presence'
import type { PermissionSnapshot } from '../shared/permissions'
import type { LongTermMemoryView, ProfileCategory, ProfileFactView } from '../shared/memory'
import type {
  AiContextMode,
  AiContextPreview,
  AiSendResult,
  AiServiceStatus,
} from '../shared/ai-context'

const api: DeskpetApi = {
  updateHitAreas(areas: HitArea[]) {
    ipcRenderer.send('pet:hit-areas', areas)
  },
  beginWindowDrag(point: Point2D) {
    ipcRenderer.send('window:drag-begin', point)
  },
  moveWindowDrag(point: Point2D) {
    ipcRenderer.send('window:drag-move', point)
  },
  endWindowDrag() {
    ipcRenderer.send('window:drag-end')
  },
  showContextMenu() {
    ipcRenderer.send('pet:show-context-menu')
  },
  getRuntimeInfo() {
    return ipcRenderer.invoke('app:runtime-info') as Promise<RuntimeInfo>
  },
  interact(interaction: PetInteraction) {
    return ipcRenderer.invoke('pet:interact', interaction) as Promise<InteractionResult>
  },
  getSettingsSnapshot() {
    return ipcRenderer.invoke('settings:get') as Promise<SettingsSnapshot>
  },
  updateSettings(
    patch: Partial<
      Pick<
        AppSettings,
        | 'alwaysOnTop'
        | 'interactionsPaused'
        | 'rendererMode'
        | 'modelScale'
        | 'randomVoiceEnabled'
        | 'localTtsEnabled'
        | 'presenceMemoryEnabled'
        | 'presenceEmotionEnabled'
        | 'presenceAutonomyEnabled'
        | 'presenceIntensity'
        | 'aiEnabled'
        | 'aiProactiveEnabled'
        | 'aiWindowTitleEnabled'
        | 'aiSelectedTextEnabled'
        | 'screenPerceptionEnabled'
        | 'screenPerceptionPaused'
        | 'conversationMemoryEnabled'
        | 'intelligenceLevel'
        | 'ttsQuality'
        | 'ttsEngine'
      >
    >,
  ) {
    return ipcRenderer.invoke('settings:update', patch) as Promise<SettingsSnapshot>
  },
  previewModelClip(clip: string) {
    return ipcRenderer.invoke('pet:preview-model-clip', clip) as Promise<boolean>
  },
  resetPetState() {
    return ipcRenderer.invoke('settings:reset-state') as Promise<SettingsSnapshot>
  },
  openChat() {
    ipcRenderer.send('chat:open')
  },
  getOutfitGreeting(scene = 'login') {
    return ipcRenderer.invoke('outfit:greeting', scene) as Promise<
      import('@shared/types').OutfitGreeting | null
    >
  },
  getChatHistory() {
    return ipcRenderer.invoke('chat:history') as Promise<ChatMessageView[]>
  },
  sendChatMessage(text: string) {
    return ipcRenderer.invoke('chat:send', text) as Promise<ChatSendResult>
  },
  clearChatHistory() {
    return ipcRenderer.invoke('chat:clear') as Promise<void>
  },
  openSettings() {
    ipcRenderer.send('settings:open')
  },
  openDataDirectory() {
    return ipcRenderer.invoke('settings:open-data-directory') as Promise<void>
  },
  onStateChanged(callback: (snapshot: SettingsSnapshot) => void) {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: SettingsSnapshot): void => {
      callback(snapshot)
    }
    ipcRenderer.on('pet:state-changed', listener)
    return () => {
      ipcRenderer.removeListener('pet:state-changed', listener)
    }
  },
  onRendererCommand(callback: (command: RendererCommand) => void) {
    const listener = (_event: Electron.IpcRendererEvent, command: RendererCommand): void => {
      callback(command)
    }
    ipcRenderer.on('pet:renderer-command', listener)
    return () => {
      ipcRenderer.removeListener('pet:renderer-command', listener)
    }
  },
  onRendererModeChanged(callback: (command: RendererModeCommand) => void) {
    const listener = (_event: Electron.IpcRendererEvent, command: RendererModeCommand): void => {
      callback(command)
    }
    ipcRenderer.on('pet:renderer-mode-changed', listener)
    return () => {
      ipcRenderer.removeListener('pet:renderer-mode-changed', listener)
    }
  },
  onPreviewModelClip(callback: (clip: string) => void) {
    const listener = (_event: Electron.IpcRendererEvent, clip: string): void => {
      callback(clip)
    }
    ipcRenderer.on('pet:preview-model-clip', listener)
    return () => {
      ipcRenderer.removeListener('pet:preview-model-clip', listener)
    }
  },
  onGazePoint(callback: (point: Point2D | null) => void) {
    const listener = (_event: Electron.IpcRendererEvent, point: Point2D | null): void => {
      callback(point)
    }
    ipcRenderer.on('pet:gaze-point', listener)
    return () => {
      ipcRenderer.removeListener('pet:gaze-point', listener)
    }
  },
  reportDeliveryEvent(event: DeliveryLifecycleEvent) {
    ipcRenderer.send('presence:delivery-event', event)
  },
  reportPerformanceEvent(event: PerformanceLifecycleEvent) {
    ipcRenderer.send('presence:performance-event', event)
  },
  listEpisodicMemories() {
    return ipcRenderer.invoke('presence:memory-list') as Promise<EpisodicMemory[]>
  },
  deleteEpisodicMemory(id: string) {
    return ipcRenderer.invoke('presence:memory-delete', id) as Promise<EpisodicMemory[]>
  },
  clearEpisodicMemories() {
    return ipcRenderer.invoke('presence:memory-clear') as Promise<void>
  },
  getConversationStats() {
    return ipcRenderer.invoke('memory:conversation-stats') as Promise<{ turns: number }>
  },
  listSemanticMemories() {
    return ipcRenderer.invoke('memory:semantic-list') as Promise<SemanticMemoryView[]>
  },
  rememberSemanticMemory(text: string) {
    return ipcRenderer.invoke('memory:semantic-add', text) as Promise<SemanticMemoryView[]>
  },
  updateSemanticMemory(id: string, text: string) {
    return ipcRenderer.invoke('memory:semantic-update', { id, text }) as Promise<
      SemanticMemoryView[]
    >
  },
  deleteSemanticMemory(id: string) {
    return ipcRenderer.invoke('memory:semantic-delete', id) as Promise<SemanticMemoryView[]>
  },
  clearSemanticMemories() {
    return ipcRenderer.invoke('memory:semantic-clear') as Promise<SemanticMemoryView[]>
  },
  listProfileFacts() {
    return ipcRenderer.invoke('memory:profile-list') as Promise<ProfileFactView[]>
  },
  addProfileFact(category: ProfileCategory, text: string) {
    return ipcRenderer.invoke('memory:profile-add', { category, text }) as Promise<
      ProfileFactView[]
    >
  },
  updateProfileFact(id: string, text: string) {
    return ipcRenderer.invoke('memory:profile-update', { id, text }) as Promise<ProfileFactView[]>
  },
  deleteProfileFact(id: string) {
    return ipcRenderer.invoke('memory:profile-delete', id) as Promise<ProfileFactView[]>
  },
  setProfileFactPinned(id: string, pinned: boolean) {
    return ipcRenderer.invoke('memory:profile-pin', { id, pinned }) as Promise<ProfileFactView[]>
  },
  clearProfileFacts() {
    return ipcRenderer.invoke('memory:profile-clear') as Promise<ProfileFactView[]>
  },
  listLongTermMemories() {
    return ipcRenderer.invoke('memory:longterm-list') as Promise<LongTermMemoryView[]>
  },
  updateLongTermMemory(id: string, text: string) {
    return ipcRenderer.invoke('memory:longterm-update', { id, text }) as Promise<
      LongTermMemoryView[]
    >
  },
  deleteLongTermMemory(id: string) {
    return ipcRenderer.invoke('memory:longterm-delete', id) as Promise<LongTermMemoryView[]>
  },
  clearLongTermMemories() {
    return ipcRenderer.invoke('memory:longterm-clear') as Promise<LongTermMemoryView[]>
  },
  clearConversationMemory() {
    return ipcRenderer.invoke('memory:conversation-clear') as Promise<{ turns: number }>
  },
  loadCharacterAsset(assetPath: string) {
    return ipcRenderer.invoke('character:load-asset', assetPath) as Promise<Uint8Array>
  },
  startSpeechStream(streamId: string, text: string, options?: LocalSpeechOptions) {
    ipcRenderer.send('speech:stream-start', { streamId, text, options })
  },
  cancelSpeechStream(streamId: string) {
    ipcRenderer.send('speech:stream-cancel', streamId)
  },
  onSpeechChunk(
    callback: (payload: { streamId: string; index: number; audio: Uint8Array }) => void,
  ) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { streamId: string; index: number; audio: Uint8Array },
    ): void => {
      callback(payload)
    }
    ipcRenderer.on('speech:chunk', listener)
    return () => {
      ipcRenderer.removeListener('speech:chunk', listener)
    }
  },
  onSpeechStreamEnd(callback: (payload: { streamId: string; ok: boolean }) => void) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { streamId: string; ok: boolean },
    ): void => {
      callback(payload)
    }
    ipcRenderer.on('speech:stream-end', listener)
    return () => {
      ipcRenderer.removeListener('speech:stream-end', listener)
    }
  },
  synthesizeLocalSpeech(text: string, options?: LocalSpeechOptions) {
    return ipcRenderer.invoke('speech:local-tts', {
      text,
      options,
    }) as Promise<LocalSpeechResult | null>
  },
  getResourceSnapshot() {
    return ipcRenderer.invoke('resources:get') as Promise<ResourceSnapshot>
  },
  getTimeSceneContext() {
    return ipcRenderer.invoke('app:time-scene') as Promise<TimeSceneContext>
  },
  getSystemPowerState() {
    return ipcRenderer.invoke('app:system-power-state') as Promise<SystemPowerState>
  },
  unloadLocalTts() {
    return ipcRenderer.invoke('speech:unload') as Promise<TtsResourceStatus>
  },
  preloadLocalTts() {
    return ipcRenderer.invoke('speech:preload') as Promise<TtsResourceStatus>
  },
  onTimeSceneChanged(callback: (context: TimeSceneContext) => void) {
    const listener = (_event: Electron.IpcRendererEvent, context: TimeSceneContext): void => {
      callback(context)
    }
    ipcRenderer.on('app:time-scene-changed', listener)
    return () => {
      ipcRenderer.removeListener('app:time-scene-changed', listener)
    }
  },
  onSystemPowerState(callback: (state: SystemPowerState) => void) {
    const listener = (_event: Electron.IpcRendererEvent, state: SystemPowerState): void => {
      callback(state)
    }
    ipcRenderer.on('app:system-power-state', listener)
    return () => {
      ipcRenderer.removeListener('app:system-power-state', listener)
    }
  },
  getPermissionStatus(probeAutomation = false) {
    return ipcRenderer.invoke('permissions:get', probeAutomation) as Promise<PermissionSnapshot>
  },
  openPermissionSettings(service) {
    return ipcRenderer.invoke('permissions:open', service) as Promise<void>
  },
  getAiStatus() {
    return ipcRenderer.invoke('ai:status') as Promise<AiServiceStatus>
  },
  saveDeepSeekKey(key: string) {
    return ipcRenderer.invoke('ai:save-key', key) as Promise<AiServiceStatus>
  },
  deleteDeepSeekKey() {
    return ipcRenderer.invoke('ai:delete-key') as Promise<AiServiceStatus>
  },
  requestAccessibilityPermission() {
    return ipcRenderer.invoke('ai:request-accessibility') as Promise<AiServiceStatus>
  },
  prepareAiContext(mode: AiContextMode) {
    return ipcRenderer.invoke('ai:prepare-context', mode) as Promise<AiContextPreview>
  },
  getPendingAiContext() {
    return ipcRenderer.invoke('ai:pending-context') as Promise<AiContextPreview | null>
  },
  sendPendingAiContext(id: string, manualSelectedText?: string) {
    return ipcRenderer.invoke('ai:send-context', id, manualSelectedText) as Promise<AiSendResult>
  },
  cancelPendingAiContext(id: string) {
    return ipcRenderer.invoke('ai:cancel-context', id) as Promise<void>
  },
  onAiContextPrepared(callback: (preview: AiContextPreview) => void) {
    const listener = (_event: Electron.IpcRendererEvent, preview: AiContextPreview): void => {
      callback(preview)
    }
    ipcRenderer.on('ai:context-prepared', listener)
    return () => {
      ipcRenderer.removeListener('ai:context-prepared', listener)
    }
  },
  onAiContextError(callback: (message: string) => void) {
    const listener = (_event: Electron.IpcRendererEvent, message: string): void => {
      callback(message)
    }
    ipcRenderer.on('ai:context-error', listener)
    return () => {
      ipcRenderer.removeListener('ai:context-error', listener)
    }
  },
  reportRendererFailure(message: string) {
    ipcRenderer.send('settings:renderer-failure', message)
  },
}

contextBridge.exposeInMainWorld('deskpet', api)

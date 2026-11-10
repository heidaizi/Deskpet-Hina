import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { loadContent } from '../domain/content-loader'
import { state } from '../app-state'
import { DeepSeekKeyStore } from '../domain/deepseek-key-store'
import { LocalTtsService } from '../domain/local-tts-service'
import { SceneCompanion } from '../../shared/scene-companion'
import { readPositiveNumberEnv } from '../behavior/autonomous'
import { excludeFromScreenCapture } from '../window/capture'
import { AiContextService } from '../domain/ai-context-service'
import { ensureAivisEngine } from '../domain/aivis-engine'
import { loadGlossary } from '../domain/glossary'
import { ConversationBuffer } from '../domain/memory/conversation-buffer'
import { LongTermMemory } from '../domain/memory/long-term-memory'
import { createEmbeddingService } from '../domain/memory/embedding-service'
import { UserProfile } from '../domain/memory/user-profile'
import { RelationshipState } from '../domain/relationship-state'
import { FeedbackStore } from '../domain/memory/feedback-store'
import { SemanticMemoryStore } from '../domain/memory/semantic-memory'
import { PetStateStore, SettingsStore } from '../domain/persistent-stores'
import { BehaviorEngine } from '../domain/behavior-engine'
import { DialogueService } from '../domain/dialogue-service'
import { PetController } from '../domain/pet-controller'
import { IS_E2E } from '../config'
import { AppSettings, SettingsSnapshot } from '../../shared/types'
import { syncPresenceEmotionSetting, syncPresenceMemorySetting } from '../presence/bridge'
import { clearPendingAiContext } from '../ai/bridge'
import { applyPetWindowEnvelope, getCurrentPetWindowEnvelope } from '../window/pet-window'
import { refreshTrayMenu, setClickThroughMode } from '../tray/tray'

let aivisEngineStarting = false
export function initializePetController(): void {
  const bundle = loadContent(join(app.getAppPath(), 'content'))
  const userDataPath = app.getPath('userData')
  state.deepSeekKeyStore = new DeepSeekKeyStore(join(userDataPath, 'deepseek-key.enc'))
  state.localTtsService = new LocalTtsService(
    userDataPath,
    join(app.getAppPath(), 'content/tts-ja.json'),
    join(app.getAppPath(), 'scripts/start-hina-irodori-server.zsh'),
    join(app.getAppPath(), 'content/prebuilt-tts-ja.json'),
    app.getAppPath(),
  )
  state.sceneCompanion = new SceneCompanion(undefined, {
    stableMs: readPositiveNumberEnv('DESKPET_SCENE_STABLE_MS'),
    cooldownMs: readPositiveNumberEnv('DESKPET_SCENE_COOLDOWN_MS'),
  })
  state.glossary = loadGlossary(join(app.getAppPath(), 'content', 'glossary.json'))
  state.longTermMemory = new LongTermMemory(app.getPath('userData'))
  state.userProfile = new UserProfile(app.getPath('userData'))
  state.relationshipState = new RelationshipState(app.getPath('userData'))
  const embeddings = createEmbeddingService(app.getPath('userData'))
  state.longTermMemory.setEmbedder(embeddings.embed)
  void embeddings.warmup().then(async (ready) => {
    if (ready) {
      const filled = await state.longTermMemory?.backfill()
      console.warn(`[embeddings] 已就绪，补齐 ${filled ?? 0} 条历史向量`)
    }
  })
  state.conversationBuffer = new ConversationBuffer(
    join(userDataPath, 'memory', 'conversation.json'),
  )
  state.semanticMemory = new SemanticMemoryStore(join(userDataPath, 'memory', 'semantic.json'))
  state.feedbackStore = new FeedbackStore(join(userDataPath, 'memory', 'feedback.json'))
  state.aiContextService = new AiContextService({
    getTimeSceneContext: () => state.timeSceneContext,
    getFallbackScene: () => state.lastExternalScene,
  })
  const stateStore = new PetStateStore(join(userDataPath, 'pet-state.json'), bundle)
  const settingsStore = new SettingsStore(join(userDataPath, 'settings.json'))
  const engine = new BehaviorEngine(bundle)
  const dialogueService = new DialogueService(bundle)

  state.petController = new PetController(
    bundle,
    stateStore,
    settingsStore,
    engine,
    dialogueService,
    {
      version: app.getVersion(),
      onStateChanged: broadcastState,
      getTimeSceneContext: () => state.timeSceneContext,
    },
  )
  state.localTtsService.setQuality(state.petController.getSettings().ttsQuality)
  state.localTtsService.setEngine(state.petController.getSettings().ttsEngine)
  state.localTtsService.setAivisReviver(() =>
    ensureAivisEngine(app.getPath('home'), (message) => console.warn(message)),
  )
  const localTtsEnabled = state.petController.getSettings().localTtsEnabled
  state.localTtsService.setEnabled(localTtsEnabled)
  if (localTtsEnabled && !IS_E2E && process.env.DESKPET_IRODORI_PREWARM === '1') {
    state.localTtsService.prewarm()
  }
}

export function updateAppSettings(
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
    >
  >,
): SettingsSnapshot | null {
  if (!state.petController) {
    return null
  }

  const previousRendererMode = state.petController.getSettings().rendererMode
  const previousLocalTtsEnabled = state.petController.getSettings().localTtsEnabled
  const previousTtsQuality = state.petController.getSettings().ttsQuality
  const previousPresenceMemoryEnabled = state.petController.getSettings().presenceMemoryEnabled
  const previousPresenceEmotionEnabled = state.petController.getSettings().presenceEmotionEnabled
  const previousPresenceAutonomyEnabled = state.petController.getSettings().presenceAutonomyEnabled
  const previousAiEnabled = state.petController.getSettings().aiEnabled
  const previousProactiveAiEnabled = state.petController.getSettings().aiProactiveEnabled
  const snapshot = state.petController.updateSettings(patch)
  if (state.petWindow && !state.petWindow.isDestroyed()) {
    state.petWindow.setAlwaysOnTop(snapshot.settings.alwaysOnTop, 'floating')
  }
  if (snapshot.settings.rendererMode !== previousRendererMode) {
    sendRendererModeChange(snapshot)
  }
  if (snapshot.settings.ttsQuality !== previousTtsQuality) {
    state.localTtsService?.setQuality(snapshot.settings.ttsQuality)
  }
  state.localTtsService?.setEngine(snapshot.settings.ttsEngine)
  if (snapshot.settings.ttsEngine === 'aivis' && !aivisEngineStarting) {
    aivisEngineStarting = true
    void ensureAivisEngine(app.getPath('home'), (message) => console.warn(message)).finally(() => {
      aivisEngineStarting = false
    })
  }
  if (snapshot.settings.localTtsEnabled !== previousLocalTtsEnabled) {
    // 只切换开关，不自动预热：模型体积大，应由首次合成或显式“预加载”按钮触发。
    state.localTtsService?.setEnabled(snapshot.settings.localTtsEnabled)
  }
  if (snapshot.settings.presenceMemoryEnabled !== previousPresenceMemoryEnabled) {
    syncPresenceMemorySetting(snapshot.settings.presenceMemoryEnabled)
  }
  if (snapshot.settings.presenceEmotionEnabled !== previousPresenceEmotionEnabled) {
    syncPresenceEmotionSetting(snapshot.settings.presenceEmotionEnabled)
  }
  if (previousPresenceAutonomyEnabled && !snapshot.settings.presenceAutonomyEnabled) {
    state.presenceController?.cancelProactiveAi('autonomy')
  }
  if (
    (previousProactiveAiEnabled && !snapshot.settings.aiProactiveEnabled) ||
    (previousAiEnabled && !snapshot.settings.aiEnabled)
  ) {
    state.presenceController?.cancelProactiveAi('settings')
  }
  if (
    !snapshot.settings.aiEnabled ||
    (state.pendingAiContext?.preview.mode === 'selection' &&
      !snapshot.settings.aiSelectedTextEnabled)
  ) {
    clearPendingAiContext()
  }
  applyPetWindowEnvelope(getCurrentPetWindowEnvelope())
  refreshTrayMenu()
  return snapshot
}

export function sendRendererModeChange(snapshot: SettingsSnapshot): void {
  if (
    !state.petWindow ||
    state.petWindow.isDestroyed() ||
    state.petWindow.webContents.isLoading()
  ) {
    return
  }
  const renderer = snapshot.character.renderers.find(
    (option) => option.mode === snapshot.settings.rendererMode,
  )
  state.petWindow.webContents.send('pet:renderer-mode-changed', {
    mode: snapshot.settings.rendererMode,
    assetPath: renderer?.assetPath,
  })
}

export function broadcastState(snapshot: SettingsSnapshot): void {
  if (state.petWindow && !state.petWindow.isDestroyed()) {
    state.petWindow.webContents.send('pet:state-changed', snapshot)
  }
  if (state.settingsWindow && !state.settingsWindow.isDestroyed()) {
    state.settingsWindow.webContents.send('pet:state-changed', snapshot)
  }
}

export async function showSettingsWindow(): Promise<void> {
  if (state.settingsWindow && !state.settingsWindow.isDestroyed()) {
    state.settingsWindow.show()
    state.settingsWindow.focus()
    return
  }

  if (state.clickThroughMode) {
    setClickThroughMode(false)
  }

  const dock = app.dock
  if (dock) {
    void dock.show().then(() => {
      dock.bounce('informational')
    })
  }

  state.settingsWindow = new BrowserWindow({
    width: 500,
    height: 680,
    minWidth: 430,
    minHeight: 600,
    title: '空崎日奈设置',
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

  const window = state.settingsWindow
  excludeFromScreenCapture(window)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })
  window.webContents.on('did-fail-load', (_event, code, description, validatedUrl) => {
    console.error('Settings window failed to load:', code, description, validatedUrl)
  })
  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) {
      window.show()
      window.focus()
    }
  })
  window.on('closed', () => {
    state.settingsWindow = null
    if (!state.clickThroughMode) {
      app.dock?.hide()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    const settingsUrl = new URL('settings.html', process.env.ELECTRON_RENDERER_URL).toString()
    await window.loadURL(settingsUrl)
  } else {
    await window.loadFile(join(__dirname, '../renderer/settings.html'))
  }
}

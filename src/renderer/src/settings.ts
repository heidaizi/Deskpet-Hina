import type {
  ResourceSnapshot,
  RuntimeInfo,
  SemanticMemoryView,
  SettingsSnapshot,
  TtsResourceStatus,
} from '@shared/types'
import type { SceneKind, TimePeriod, TimeSceneContext } from '@shared/time-scene'
import type { AiContextPreview, AiServiceStatus } from '@shared/ai-context'
import type { EpisodicMemory } from '@shared/presence'
import { MAX_AI_SELECTED_TEXT_CHARACTERS } from '@shared/ai-context'
import {
  HINA_SWIMSUIT_ANIMATIONS,
  MODEL_SCALE_MAX,
  MODEL_SCALE_MIN,
} from '@shared/model-animations'
import { resolveRelationshipStage } from '@shared/relationship'
import { describeScreenPerception } from '@shared/screen-perception'
import { PERMISSION_STATE_LABELS, type PermissionSnapshot } from '@shared/permissions'
import {
  PROFILE_CATEGORY_LABELS,
  type LongTermMemoryView,
  type ProfileCategory,
  type ProfileFactView,
} from '@shared/memory'
import { activateSettingsTab, setupSettingsTabs } from './settings-tabs'
import './settings.css'

const level = requireElement<HTMLDivElement>('#affection-level')
const characterSummary = requireElement<HTMLElement>('#character-summary')
const rendererOptions = requireElement<HTMLDivElement>('#renderer-options')
const title = requireElement<HTMLDivElement>('#affection-title')
const relationshipStage = requireElement<HTMLElement>('#relationship-stage')
const xp = requireElement<HTMLSpanElement>('#affection-xp')
const affectionProgress = requireElement<HTMLDivElement>('#affection-progress')
const affectionUnlock = requireElement<HTMLElement>('#affection-unlock')
const moodValue = requireElement<HTMLElement>('#mood-value')
const moodProgress = requireElement<HTMLElement>('#mood-progress')
const energyValue = requireElement<HTMLElement>('#energy-value')
const energyProgress = requireElement<HTMLElement>('#energy-progress')
const interactionValue = requireElement<HTMLElement>('#interaction-value')
const dailyGainNote = requireElement<HTMLElement>('#daily-gain-note')
const emotionDominant = requireElement<HTMLElement>('#emotion-dominant')
const emotionFatigue = requireElement<HTMLElement>('#emotion-fatigue')
const emotionPatience = requireElement<HTMLElement>('#emotion-patience')
const emotionPatienceProgress = requireElement<HTMLElement>('#emotion-patience-progress')
const emotionSocialBattery = requireElement<HTMLElement>('#emotion-social-battery')
const emotionSocialProgress = requireElement<HTMLElement>('#emotion-social-progress')
const memoryCount = requireElement<HTMLElement>('#memory-count')
const memoryList = requireElement<HTMLElement>('#memory-list')
const memoryStatus = requireElement<HTMLElement>('#memory-status')
const clearMemory = requireElement<HTMLButtonElement>('#clear-memory')
const profileCount = requireElement<HTMLElement>('#profile-count')
const profileList = requireElement<HTMLElement>('#profile-list')
const profileStatus = requireElement<HTMLElement>('#profile-status')
const profileForm = requireElement<HTMLFormElement>('#profile-form')
const profileCategory = requireElement<HTMLSelectElement>('#profile-category')
const profileText = requireElement<HTMLInputElement>('#profile-text')
const profileAdd = requireElement<HTMLButtonElement>('#profile-add')
const profileClear = requireElement<HTMLButtonElement>('#profile-clear')
const semanticCount = requireElement<HTMLElement>('#semantic-count')
const semanticList = requireElement<HTMLElement>('#semantic-list')
const semanticStatus = requireElement<HTMLElement>('#semantic-status')
const semanticForm = requireElement<HTMLFormElement>('#semantic-form')
const semanticText = requireElement<HTMLInputElement>('#semantic-text')
const semanticAdd = requireElement<HTMLButtonElement>('#semantic-add')
const clearSemanticMemoriesButton = requireElement<HTMLButtonElement>('#semantic-clear')
const longtermCount = requireElement<HTMLElement>('#longterm-count')
const longtermList = requireElement<HTMLElement>('#longterm-list')
const longtermStatus = requireElement<HTMLElement>('#longterm-status')
const clearLongtermMemories = requireElement<HTMLButtonElement>('#longterm-clear')
const memoryEditor = requireElement<HTMLDivElement>('#memory-editor')
const memoryEditorTitle = requireElement<HTMLElement>('#memory-editor-title')
const memoryEditorText = requireElement<HTMLTextAreaElement>('#memory-editor-text')
const memoryEditorStatus = requireElement<HTMLElement>('#memory-editor-status')
const memoryEditorSave = requireElement<HTMLButtonElement>('#memory-editor-save')
const memoryEditorCancel = requireElement<HTMLButtonElement>('#memory-editor-cancel')
const pauseInteractions = requireElement<HTMLInputElement>('#pause-interactions')
const randomVoiceEnabled = requireElement<HTMLInputElement>('#random-voice-enabled')
const localTtsEnabled = requireElement<HTMLInputElement>('#local-tts-enabled')
const presenceEmotionEnabled = requireElement<HTMLInputElement>('#presence-emotion-enabled')
const presenceMemoryEnabled = requireElement<HTMLInputElement>('#presence-memory-enabled')
const presenceAutonomyEnabled = requireElement<HTMLInputElement>('#presence-autonomy-enabled')
const presenceIntensity = requireElement<HTMLSelectElement>('#presence-intensity')
const alwaysOnTop = requireElement<HTMLInputElement>('#always-on-top')
const aiEnabled = requireElement<HTMLInputElement>('#ai-enabled')
const aiProactiveEnabled = requireElement<HTMLInputElement>('#ai-proactive-enabled')
const aiWindowTitleEnabled = requireElement<HTMLInputElement>('#ai-window-title-enabled')
const aiSelectedTextEnabled = requireElement<HTMLInputElement>('#ai-selected-text-enabled')
const conversationMemoryEnabled = requireElement<HTMLInputElement>('#conversation-memory-enabled')
const screenPerceptionEnabled = requireElement<HTMLInputElement>('#screen-perception-enabled')
const screenPerceptionPause = requireElement<HTMLButtonElement>('#screen-perception-pause')
const screenPerceptionStatus = requireElement<HTMLElement>('#screen-perception-status')
const permissionScreenState = requireElement<HTMLElement>('#permission-screen-state')
const permissionAccessibilityState = requireElement<HTMLElement>('#permission-accessibility-state')
const permissionAutomationState = requireElement<HTMLElement>('#permission-automation-state')
const permissionAutomationDetail = requireElement<HTMLElement>('#permission-automation-detail')
const permissionNote = requireElement<HTMLElement>('#permission-note')
const permissionRecheck = requireElement<HTMLButtonElement>('#permission-recheck')
const permissionScreenOpen = requireElement<HTMLButtonElement>('#permission-screen-open')
const permissionAccessibilityOpen = requireElement<HTMLButtonElement>(
  '#permission-accessibility-open',
)
const permissionAutomationOpen = requireElement<HTMLButtonElement>('#permission-automation-open')
const clearConversationMemoryButton = requireElement<HTMLButtonElement>(
  '#clear-conversation-memory',
)
const rememberAiContext = requireElement<HTMLButtonElement>('#remember-ai-context')
const openChatWindow = requireElement<HTMLButtonElement>('#open-chat-window')
const intelligenceLevel = requireElement<HTMLSelectElement>('#intelligence-level')
const ttsQuality = requireElement<HTMLSelectElement>('#tts-quality')
const ttsEngine = requireElement<HTMLSelectElement>('#tts-engine')
const semanticSummary = requireElement<HTMLElement>('#semantic-summary')
const deepSeekKey = requireElement<HTMLInputElement>('#deepseek-key')
const saveDeepSeekKey = requireElement<HTMLButtonElement>('#save-deepseek-key')
const deleteDeepSeekKey = requireElement<HTMLButtonElement>('#delete-deepseek-key')
const requestAccessibility = requireElement<HTMLButtonElement>('#request-accessibility')
const aiAnalyzeTask = requireElement<HTMLButtonElement>('#ai-analyze-task')
const aiAnalyzeSelection = requireElement<HTMLButtonElement>('#ai-analyze-selection')
const aiStatus = requireElement<HTMLElement>('#ai-status')
const aiPreview = requireElement<HTMLElement>('#ai-preview')
const aiPreviewMode = requireElement<HTMLElement>('#ai-preview-mode')
const aiContextScene = requireElement<HTMLElement>('#ai-context-scene')
const aiContextTime = requireElement<HTMLElement>('#ai-context-time')
const aiContextTitle = requireElement<HTMLElement>('#ai-context-title')
const aiSelectedPreview = requireElement<HTMLTextAreaElement>('#ai-selected-preview')
const aiPreviewNote = requireElement<HTMLElement>('#ai-preview-note')
const sendAiContext = requireElement<HTMLButtonElement>('#send-ai-context')
const cancelAiContext = requireElement<HTMLButtonElement>('#cancel-ai-context')
const modelScale = requireElement<HTMLInputElement>('#model-scale')
const outfitRotationEnabled = requireElement<HTMLInputElement>('#outfit-rotation-enabled')
const outfitRotationDays = requireElement<HTMLSelectElement>('#outfit-rotation-days')
const modelScaleValue = requireElement<HTMLOutputElement>('#model-scale-value')
const modelAction = requireElement<HTMLSelectElement>('#model-action')
const previewModelAction = requireElement<HTMLButtonElement>('#preview-model-action')
const modelActionStatus = requireElement<HTMLParagraphElement>('#model-action-status')
const openDataDirectory = requireElement<HTMLButtonElement>('#open-data-directory')
const resetState = requireElement<HTMLButtonElement>('#reset-state')
const preloadTts = requireElement<HTMLButtonElement>('#preload-tts')
const unloadTts = requireElement<HTMLButtonElement>('#unload-tts')
const resourceTtsState = requireElement<HTMLElement>('#resource-tts-state')
const resourceTtsMemory = requireElement<HTMLElement>('#resource-tts-memory')
const resourceAppUsage = requireElement<HTMLElement>('#resource-app-usage')
const resourceCache = requireElement<HTMLElement>('#resource-cache')
const resourceLog = requireElement<HTMLElement>('#resource-log')
const resourceNote = requireElement<HTMLElement>('#resource-note')
const telemetryDecisions = requireElement<HTMLElement>('#telemetry-decisions')
const telemetrySilentRatio = requireElement<HTMLElement>('#telemetry-silent-ratio')
const telemetryPerformed = requireElement<HTMLElement>('#telemetry-performed')
const telemetryRepeats = requireElement<HTMLElement>('#telemetry-repeats')
const telemetryInterruptions = requireElement<HTMLElement>('#telemetry-interruptions')
const telemetryUptime = requireElement<HTMLElement>('#telemetry-uptime')
const contextClock = requireElement<HTMLElement>('#context-clock')
const contextPeriod = requireElement<HTMLElement>('#context-period')
const contextScene = requireElement<HTMLElement>('#context-scene')
const contextApp = requireElement<HTMLElement>('#context-app')
const contextSystem = requireElement<HTMLElement>('#context-system')
const statusMessage = requireElement<HTMLDivElement>('#status-message')
const appVersion = requireElement<HTMLElement>('#app-version')
const ruleCount = requireElement<HTMLElement>('#rule-count')
const lastErrorLine = requireElement<HTMLElement>('#last-error')

let latestSnapshot: SettingsSnapshot | null = null
let latestRevision = -1
let saving = false
let resourceRefreshTimer = 0
let resourceRefreshInFlight = false
let latestAiStatus: AiServiceStatus | null = null
let latestRuntime: RuntimeInfo | null = null
let latestPermissionStatus: PermissionSnapshot | null = null
let pendingAiPreview: AiContextPreview | null = null
let memoryRefreshInFlight = false
let memoryDataRefreshInFlight = false
let memoryEditorSaveHandler: ((text: string) => Promise<void>) | null = null
const RESOURCE_REFRESH_MS = 2_500

setupSettingsTabs()

const initialSnapshot = await window.deskpet.getSettingsSnapshot()
modelScale.min = String(MODEL_SCALE_MIN)
modelScale.max = String(MODEL_SCALE_MAX)
populateModelActions()
render(initialSnapshot)
window.deskpet.onStateChanged(render)
window.deskpet.onTimeSceneChanged(renderTimeSceneContext)
renderTimeSceneContext(await window.deskpet.getTimeSceneContext())
await refreshAiState()
void refreshPermissionStatus(false)
void refreshSemanticSummary()
await refreshMemoryPanel()
void refreshMemoryTab()
const pendingPreview = await window.deskpet.getPendingAiContext()
if (pendingPreview) {
  showAiPreview(pendingPreview)
}
window.deskpet.onAiContextPrepared((preview) => {
  showAiPreview(preview)
  activateSettingsTab('ai')
})
window.deskpet.onAiContextError((message) => {
  aiStatus.textContent = message
  aiStatus.dataset.kind = 'error'
  activateSettingsTab('ai')
})
startResourceRefresh()
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopResourceRefresh()
  } else {
    startResourceRefresh()
  }
})
window.addEventListener('beforeunload', () => {
  stopResourceRefresh()
})
window.addEventListener('focus', () => {
  // 从系统设置授权回来时，自动更新屏幕录制/辅助功能；自动化探针只在显式检测时运行。
  void refreshPermissionStatus(false)
})

document.body.dataset.ready = 'true'

pauseInteractions.addEventListener('change', () => {
  void updateSettings({ interactionsPaused: pauseInteractions.checked })
})

randomVoiceEnabled.addEventListener('change', () => {
  void updateSettings({ randomVoiceEnabled: randomVoiceEnabled.checked })
})

presenceAutonomyEnabled.addEventListener('change', () => {
  void updateSettings({ presenceAutonomyEnabled: presenceAutonomyEnabled.checked })
})

presenceIntensity.addEventListener('change', () => {
  void updateSettings({
    presenceIntensity: presenceIntensity.value as 'quiet' | 'balanced' | 'lively',
  })
})

presenceEmotionEnabled.addEventListener('change', () => {
  void updateSettings({ presenceEmotionEnabled: presenceEmotionEnabled.checked })
})

localTtsEnabled.addEventListener('change', () => {
  void updateSettings({ localTtsEnabled: localTtsEnabled.checked })
})

presenceMemoryEnabled.addEventListener('change', () => {
  void updateSettings({ presenceMemoryEnabled: presenceMemoryEnabled.checked }).then(() =>
    refreshMemoryPanel(),
  )
})

clearMemory.addEventListener('click', () => {
  if (!window.confirm('确定清空全部情节记忆吗？此操作无法撤销。')) {
    return
  }
  clearMemory.disabled = true
  void window.deskpet
    .clearEpisodicMemories()
    .then(() => refreshMemoryPanel())
    .catch((error: unknown) => {
      memoryStatus.textContent = `清空失败：${String(error)}`
    })
    .finally(() => {
      clearMemory.disabled = false
    })
})

profileForm.addEventListener('submit', (event) => {
  event.preventDefault()
  void addProfileFactFromForm()
})

semanticForm.addEventListener('submit', (event) => {
  event.preventDefault()
  void addSemanticMemoryFromForm()
})

profileClear.addEventListener('click', () => {
  if (!window.confirm('确定清空全部画像事实吗？此操作无法撤销。')) {
    return
  }
  profileClear.disabled = true
  void window.deskpet
    .clearProfileFacts()
    .then((facts) => renderProfileFacts(facts))
    .catch((error: unknown) => {
      profileStatus.textContent = `清空画像失败：${String(error)}`
    })
    .finally(() => {
      profileClear.disabled = false
    })
})

clearSemanticMemoriesButton.addEventListener('click', () => {
  if (!window.confirm('确定清空全部明确记忆吗？此操作无法撤销。')) {
    return
  }
  clearSemanticMemoriesButton.disabled = true
  void window.deskpet
    .clearSemanticMemories()
    .then((memories) => renderSemanticMemories(memories))
    .catch((error: unknown) => {
      semanticStatus.textContent = `清空明确记忆失败：${String(error)}`
    })
    .finally(() => {
      clearSemanticMemoriesButton.disabled = false
    })
})

clearLongtermMemories.addEventListener('click', () => {
  if (!window.confirm('确定清空全部对话沉淀吗？此操作无法撤销。')) {
    return
  }
  clearLongtermMemories.disabled = true
  void window.deskpet
    .clearLongTermMemories()
    .then((memories) => renderLongTermMemories(memories))
    .catch((error: unknown) => {
      longtermStatus.textContent = `清空对话沉淀失败：${String(error)}`
    })
    .finally(() => {
      clearLongtermMemories.disabled = false
    })
})

memoryEditorCancel.addEventListener('click', closeMemoryEditor)
memoryEditor.addEventListener('click', (event) => {
  if (event.target === memoryEditor) {
    closeMemoryEditor()
  }
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !memoryEditor.hidden) {
    closeMemoryEditor()
  }
})
memoryEditorSave.addEventListener('click', async () => {
  const handler = memoryEditorSaveHandler
  if (!handler) {
    return
  }
  const text = memoryEditorText.value.trim()
  if (!text) {
    memoryEditorStatus.textContent = '内容不能为空。'
    return
  }
  memoryEditorSave.disabled = true
  try {
    await handler(text)
    closeMemoryEditor()
  } catch (error) {
    memoryEditorStatus.textContent = '保存失败：' + String(error)
  } finally {
    memoryEditorSave.disabled = false
  }
})

alwaysOnTop.addEventListener('change', () => {
  void updateSettings({ alwaysOnTop: alwaysOnTop.checked })
})

aiEnabled.addEventListener('change', () => {
  void updateSettings({ aiEnabled: aiEnabled.checked }).then(refreshAiState)
})

aiProactiveEnabled.addEventListener('change', () => {
  void updateSettings({ aiProactiveEnabled: aiProactiveEnabled.checked }).then(refreshAiState)
})

aiWindowTitleEnabled.addEventListener('change', () => {
  if (aiWindowTitleEnabled.checked && !confirmSensitiveRead('window-title')) {
    aiWindowTitleEnabled.checked = false
    return
  }
  void updateSettings({ aiWindowTitleEnabled: aiWindowTitleEnabled.checked })
})

conversationMemoryEnabled.addEventListener('change', () => {
  void updateSettings({ conversationMemoryEnabled: conversationMemoryEnabled.checked })
})

ttsEngine.addEventListener('change', () => {
  void updateSettings({ ttsEngine: ttsEngine.value as 'irodori' | 'aivis' })
})

ttsQuality.addEventListener('change', () => {
  void updateSettings({ ttsQuality: ttsQuality.value as 'quality' | 'balanced' | 'speed' })
})

intelligenceLevel.addEventListener('change', () => {
  void updateSettings({
    intelligenceLevel: intelligenceLevel.value as 'off' | 'basic' | 'adaptive',
  })
})

openChatWindow.addEventListener('click', () => {
  window.deskpet.openChat()
})

rememberAiContext.addEventListener('click', async () => {
  const text = aiSelectedPreview.value.trim()
  if (!text) {
    showMessage('请先把要记住的内容粘贴到预览框。', 'error')
    return
  }
  try {
    const memories = await window.deskpet.rememberSemanticMemory(text)
    renderSemanticMemories(memories)
    showMessage('已记住这段内容。')
  } catch (error) {
    showMessage(`记忆失败：${String(error)}`, 'error')
  }
})

clearConversationMemoryButton.addEventListener('click', async () => {
  try {
    const result = await window.deskpet.clearConversationMemory()
    showMessage(`已清除对话记忆（${result.turns} 轮）。`)
  } catch (error) {
    showMessage(`清除对话记忆失败：${String(error)}`, 'error')
  }
})

aiSelectedTextEnabled.addEventListener('change', () => {
  if (aiSelectedTextEnabled.checked && !confirmSensitiveRead('selection')) {
    aiSelectedTextEnabled.checked = false
    return
  }
  void updateSettings({ aiSelectedTextEnabled: aiSelectedTextEnabled.checked })
})

screenPerceptionEnabled.addEventListener('change', () => {
  if (screenPerceptionEnabled.checked && !confirmSensitiveRead('screen-perception')) {
    screenPerceptionEnabled.checked = false
    return
  }
  void updateSettings({
    screenPerceptionEnabled: screenPerceptionEnabled.checked,
    screenPerceptionPaused: false,
  }).then(refreshAiState)
})

screenPerceptionPause.addEventListener('click', () => {
  const paused = latestSnapshot?.settings.screenPerceptionPaused ?? false
  void updateSettings({ screenPerceptionPaused: !paused })
})

permissionScreenOpen.addEventListener('click', () => {
  void window.deskpet.openPermissionSettings('screen')
})

permissionAutomationOpen.addEventListener('click', () => {
  void window.deskpet.openPermissionSettings('automation')
})

permissionAccessibilityOpen.addEventListener('click', async () => {
  permissionAccessibilityOpen.disabled = true
  try {
    latestAiStatus = await window.deskpet.requestAccessibilityPermission()
    renderAiStatus()
    if (!latestAiStatus.accessibilityTrusted) {
      await window.deskpet.openPermissionSettings('accessibility')
    }
    await refreshPermissionStatus(false)
  } catch (error) {
    permissionNote.textContent = `辅助功能请求失败：${String(error)}`
  } finally {
    permissionAccessibilityOpen.disabled = false
  }
})

permissionRecheck.addEventListener('click', () => {
  void refreshPermissionStatus(true)
})

saveDeepSeekKey.addEventListener('click', async () => {
  const key = deepSeekKey.value.trim()
  if (!key) {
    showMessage('请输入 DeepSeek API Key。', 'error')
    return
  }
  setAiBusy(true)
  try {
    latestAiStatus = await window.deskpet.saveDeepSeekKey(key)
    deepSeekKey.value = ''
    renderAiStatus()
    showMessage('DeepSeek API Key 已保存到 macOS 安全存储。')
  } catch (error) {
    showMessage(`保存失败：${String(error)}`, 'error')
  } finally {
    setAiBusy(false)
  }
})

deleteDeepSeekKey.addEventListener('click', async () => {
  setAiBusy(true)
  try {
    latestAiStatus = await window.deskpet.deleteDeepSeekKey()
    renderAiStatus()
    showMessage('DeepSeek API Key 已删除。')
  } catch (error) {
    showMessage(`删除失败：${String(error)}`, 'error')
  } finally {
    setAiBusy(false)
  }
})

requestAccessibility.addEventListener('click', async () => {
  setAiBusy(true)
  try {
    latestAiStatus = await window.deskpet.requestAccessibilityPermission()
    renderAiStatus()
    showMessage(
      latestAiStatus.accessibilityTrusted
        ? '辅助功能权限已就绪。'
        : '请在系统设置中授权后返回此页。',
      latestAiStatus.accessibilityTrusted ? 'info' : 'error',
    )
  } catch (error) {
    showMessage(`授权失败：${String(error)}`, 'error')
  } finally {
    setAiBusy(false)
  }
})

aiAnalyzeTask.addEventListener('click', () => {
  void prepareAiPreview('task')
})

aiAnalyzeSelection.addEventListener('click', () => {
  void prepareAiPreview('selection')
})

sendAiContext.addEventListener('click', async () => {
  if (!pendingAiPreview) {
    return
  }
  const manualSelectedText = pendingAiPreview.manualSelectionRequired
    ? aiSelectedPreview.value.trim()
    : undefined
  if (pendingAiPreview.manualSelectionRequired && !manualSelectedText) {
    aiPreviewNote.textContent = '请先从目标应用复制文字，再粘贴到这里。'
    sendAiContext.disabled = true
    return
  }
  setAiBusy(true)
  aiPreviewNote.textContent = '日奈正在整理回应……'
  try {
    const result = await window.deskpet.sendPendingAiContext(
      pendingAiPreview.id,
      manualSelectedText,
    )
    pendingAiPreview = null
    aiPreview.hidden = true
    sendAiContext.disabled = true
    cancelAiContext.disabled = true
    aiStatus.textContent = `${result.reply.reply_zh} · ${(result.elapsedMs / 1_000).toFixed(1)} 秒`
    aiStatus.dataset.kind = 'ready'
  } catch (error) {
    pendingAiPreview = null
    aiPreview.hidden = true
    sendAiContext.disabled = true
    cancelAiContext.disabled = true
    aiStatus.textContent = `AI 请求失败：${String(error)}`
    aiStatus.dataset.kind = 'error'
  } finally {
    setAiBusy(false)
  }
})

aiSelectedPreview.addEventListener('input', () => {
  if (!pendingAiPreview?.manualSelectionRequired) {
    return
  }
  updateManualSelectionPreview()
})

cancelAiContext.addEventListener('click', async () => {
  if (!pendingAiPreview) {
    return
  }
  await window.deskpet.cancelPendingAiContext(pendingAiPreview.id)
  pendingAiPreview = null
  aiPreview.hidden = true
  aiPreviewNote.textContent = ''
  sendAiContext.disabled = true
  cancelAiContext.disabled = true
})

modelScale.addEventListener('input', () => {
  updateModelScaleLabel(Number(modelScale.value))
})

outfitRotationEnabled.addEventListener('change', () => {
  void updateSettings({ outfitRotationEnabled: outfitRotationEnabled.checked })
})

outfitRotationDays.addEventListener('change', () => {
  void updateSettings({ outfitRotationDays: Number(outfitRotationDays.value) })
})

modelScale.addEventListener('change', () => {
  void updateSettings({ modelScale: Number(modelScale.value) })
})

previewModelAction.addEventListener('click', async () => {
  previewModelAction.disabled = true
  try {
    const accepted = await window.deskpet.previewModelClip(modelAction.value)
    const definition = HINA_SWIMSUIT_ANIMATIONS.find(
      (animation) => animation.clip === modelAction.value,
    )
    modelActionStatus.textContent = accepted
      ? `正在播放：${definition?.label ?? modelAction.value}`
      : '请先切换到 3D 模式。'
  } catch (error) {
    modelActionStatus.textContent = `播放失败：${String(error)}`
  } finally {
    previewModelAction.disabled = latestSnapshot?.settings.rendererMode !== '3d'
  }
})

openDataDirectory.addEventListener('click', async () => {
  try {
    await window.deskpet.openDataDirectory()
    showMessage('已打开存档目录。')
  } catch (error) {
    showMessage(`无法打开存档目录：${String(error)}`, 'error')
  }
})

resetState.addEventListener('click', async () => {
  const confirmed = window.confirm('确定重置好感、心情、精力和冷却状态吗？此操作无法撤销。')
  if (!confirmed) {
    return
  }

  setBusy(true)
  try {
    const snapshot = await window.deskpet.resetPetState()
    render(snapshot)
    showMessage('角色状态已重置。')
  } catch (error) {
    showMessage(`重置失败：${String(error)}`, 'error')
  } finally {
    setBusy(false)
  }
})

preloadTts.addEventListener('click', async () => {
  preloadTts.disabled = true
  try {
    const status = await window.deskpet.preloadLocalTts()
    renderTtsStatus(status)
    await refreshResources()
  } catch (error) {
    resourceNote.textContent = `声线加载失败：${String(error)}`
    preloadTts.disabled = !latestSnapshot?.settings.localTtsEnabled
  }
})

unloadTts.addEventListener('click', async () => {
  unloadTts.disabled = true
  try {
    const status = await window.deskpet.unloadLocalTts()
    renderTtsStatus(status)
    await refreshResources()
  } catch (error) {
    resourceNote.textContent = `释放失败：${String(error)}`
    unloadTts.disabled = false
  }
})

function render(snapshot: SettingsSnapshot): void {
  if (snapshot.revision < latestRevision) {
    return
  }
  latestRevision = snapshot.revision
  latestSnapshot = snapshot
  const state = snapshot.state
  characterSummary.textContent = `${snapshot.character.displayName} · 好感增益每 ${Math.round(
    state.affectionGainCooldownMs / 1_000,
  )} 秒最多结算一次`
  renderRendererOptions(snapshot)
  level.textContent = `Lv.${state.affectionLevel}`
  relationshipStage.textContent = `关系阶段：${resolveRelationshipStage(state.affectionLevel).name}`
  title.textContent = state.affectionTitle

  const nextXp = state.nextLevelXp
  xp.textContent =
    nextXp === null ? `${state.affectionXp} · MAX` : `${state.affectionXp} / ${nextXp}`
  const levelRange = nextXp === null ? 1 : Math.max(1, nextXp - state.affectionLevelMinXp)
  const levelProgress =
    nextXp === null ? 100 : ((state.affectionXp - state.affectionLevelMinXp) / levelRange) * 100
  affectionProgress.style.width = `${clamp(levelProgress, 0, 100)}%`

  moodValue.textContent = `${Math.round(state.mood)}`
  moodProgress.style.width = `${clamp(state.mood, 0, 100)}%`
  energyValue.textContent = `${Math.round(state.energy)}`
  energyProgress.style.width = `${clamp(state.energy, 0, 100)}%`
  interactionValue.textContent = `${state.dailyInteractions}`
  dailyGainNote.textContent =
    state.dailyAffectionXp >= state.dailyAffectionCap
      ? `今日好感已满 ${state.dailyAffectionCap} / ${state.dailyAffectionCap}`
      : `今日好感 ${state.dailyAffectionXp} / ${state.dailyAffectionCap}`
  affectionUnlock.textContent =
    nextXp === null
      ? `已解锁：${state.unlockedContent.join('、')}`
      : `距离「${state.nextLevelTitle ?? '下一等级'}」还需 ${Math.max(
          0,
          nextXp - state.affectionXp,
        )} 点；将解锁：${state.nextLevelUnlocks.join('、') || '新的陪伴内容'}`

  pauseInteractions.checked = snapshot.settings.interactionsPaused
  randomVoiceEnabled.checked = snapshot.settings.randomVoiceEnabled
  localTtsEnabled.checked = snapshot.settings.localTtsEnabled
  presenceEmotionEnabled.checked = snapshot.settings.presenceEmotionEnabled
  presenceMemoryEnabled.checked = snapshot.settings.presenceMemoryEnabled
  presenceAutonomyEnabled.checked = snapshot.settings.presenceAutonomyEnabled
  presenceIntensity.value = snapshot.settings.presenceIntensity
  presenceAutonomyEnabled.disabled = saving
  presenceIntensity.disabled = saving || !snapshot.settings.presenceAutonomyEnabled
  alwaysOnTop.checked = snapshot.settings.alwaysOnTop
  aiEnabled.checked = snapshot.settings.aiEnabled
  aiProactiveEnabled.checked = snapshot.settings.aiProactiveEnabled
  aiEnabled.disabled = saving
  aiProactiveEnabled.disabled = saving || !snapshot.settings.aiEnabled
  aiWindowTitleEnabled.checked = snapshot.settings.aiWindowTitleEnabled
  aiSelectedTextEnabled.checked = snapshot.settings.aiSelectedTextEnabled
  screenPerceptionEnabled.checked = snapshot.settings.screenPerceptionEnabled
  screenPerceptionPause.disabled =
    saving || !snapshot.settings.screenPerceptionEnabled || !snapshot.settings.aiEnabled
  screenPerceptionPause.textContent = snapshot.settings.screenPerceptionPaused
    ? '继续感知'
    : '暂停感知'
  conversationMemoryEnabled.checked = snapshot.settings.conversationMemoryEnabled
  intelligenceLevel.value = snapshot.settings.intelligenceLevel
  ttsQuality.value = snapshot.settings.ttsQuality
  ttsEngine.value = snapshot.settings.ttsEngine
  outfitRotationEnabled.checked = snapshot.settings.outfitRotationEnabled
  outfitRotationDays.value = String(snapshot.settings.outfitRotationDays)
  outfitRotationDays.disabled = !snapshot.settings.outfitRotationEnabled
  modelScale.value = String(snapshot.settings.modelScale)
  updateModelScaleLabel(snapshot.settings.modelScale)
  const is3d = snapshot.settings.rendererMode === '3d'
  modelScale.disabled = saving || !is3d
  modelAction.disabled = saving || !is3d
  previewModelAction.disabled = saving || !is3d
  if (!is3d) {
    modelActionStatus.textContent = '切换到 3D 后即可试演全部 23 段官方动作。'
  } else if (!modelActionStatus.textContent?.startsWith('正在播放')) {
    modelActionStatus.textContent = '已连接官方 GLB，选择动作后点击播放。'
  }
  appVersion.textContent = `Deskpet v${snapshot.version}`
  ruleCount.textContent = `${snapshot.contentRuleCount} 条行为规则已加载`
  if (latestAiStatus) {
    renderAiStatus()
  }
  renderScreenPerceptionStatus()
}

function renderRendererOptions(snapshot: SettingsSnapshot): void {
  rendererOptions.replaceChildren(
    ...snapshot.character.renderers.map((renderer) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'renderer-option'
      button.disabled = renderer.status !== 'available'
      button.dataset.status = renderer.status
      button.dataset.mode = renderer.mode
      const default3dId = snapshot.character.renderers.find(
        (option) => option.mode === '3d' && option.status === 'available',
      )?.id
      const effective3dId = snapshot.settings.rendererId || default3dId
      const selected =
        snapshot.settings.rendererMode === renderer.mode &&
        (renderer.mode !== '3d' || effective3dId === renderer.id)
      button.classList.toggle('selected', selected)

      const name = document.createElement('strong')
      name.textContent = renderer.label
      const status = document.createElement('span')
      status.textContent = renderer.status === 'available' ? (selected ? '当前' : '切换') : '计划中'
      button.append(name, status)
      button.addEventListener('click', () => {
        if (selected) {
          return
        }
        void updateSettings({
          rendererMode: renderer.mode,
          rendererId: renderer.mode === '3d' ? renderer.id : '',
        })
      })
      return button
    }),
  )
}

async function updateSettings(
  patch: Partial<
    Pick<
      SettingsSnapshot['settings'],
      | 'alwaysOnTop'
      | 'interactionsPaused'
      | 'rendererMode'
      | 'rendererId'
      | 'outfitRotationEnabled'
      | 'outfitRotationDays'
      | 'modelScale'
      | 'randomVoiceEnabled'
      | 'localTtsEnabled'
      | 'presenceEmotionEnabled'
      | 'presenceMemoryEnabled'
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
): Promise<void> {
  if (saving) {
    return
  }

  setBusy(true)
  try {
    const snapshot = await window.deskpet.updateSettings(patch)
    render(snapshot)
    await refreshResources()
    showMessage('设置已保存。')
  } catch (error) {
    if (latestSnapshot) {
      render(latestSnapshot)
    }
    showMessage(`设置保存失败：${String(error)}`, 'error')
  } finally {
    setBusy(false)
  }
}

function setBusy(value: boolean): void {
  saving = value
  pauseInteractions.disabled = value
  randomVoiceEnabled.disabled = value
  localTtsEnabled.disabled = value
  presenceEmotionEnabled.disabled = value
  clearMemory.disabled = value
  presenceMemoryEnabled.disabled = value
  presenceAutonomyEnabled.disabled = value
  presenceIntensity.disabled = value || !presenceAutonomyEnabled.checked
  alwaysOnTop.disabled = value
  aiEnabled.disabled = value
  aiProactiveEnabled.disabled = value || !aiEnabled.checked
  aiWindowTitleEnabled.disabled = value
  aiSelectedTextEnabled.disabled = value
  screenPerceptionEnabled.disabled = value
  screenPerceptionPause.disabled = value || !screenPerceptionEnabled.checked || !aiEnabled.checked
  profileCategory.disabled = value
  profileText.disabled = value
  profileAdd.disabled = value
  semanticText.disabled = value
  semanticAdd.disabled = value
  deepSeekKey.disabled = value || latestAiStatus?.encryptionAvailable === false
  saveDeepSeekKey.disabled = value || latestAiStatus?.encryptionAvailable === false
  deleteDeepSeekKey.disabled = value || !latestAiStatus?.keyConfigured
  requestAccessibility.disabled = value || latestAiStatus?.accessibilityTrusted === true
  aiAnalyzeTask.disabled = value || !latestAiStatus?.enabled
  aiAnalyzeSelection.disabled = value || !latestAiStatus?.enabled || !aiSelectedTextEnabled.checked
  const is3d = latestSnapshot?.settings.rendererMode === '3d'
  modelScale.disabled = value || !is3d
  modelAction.disabled = value || !is3d
  previewModelAction.disabled = value || !is3d
  resetState.disabled = value
}

function populateModelActions(): void {
  const groups = new Map<string, HTMLOptGroupElement>()
  for (const animation of HINA_SWIMSUIT_ANIMATIONS) {
    let group = groups.get(animation.category)
    if (!group) {
      group = document.createElement('optgroup')
      group.label = animation.category
      groups.set(animation.category, group)
    }
    const option = document.createElement('option')
    option.value = animation.clip
    option.textContent = `${animation.label} · ${animation.clip}`
    group.append(option)
  }
  modelAction.replaceChildren(...groups.values())
  modelAction.value = 'Formation_Pickup'
}

function updateModelScaleLabel(value: number): void {
  modelScaleValue.textContent = `${Math.round(value * 100)}%`
}

async function refreshSemanticSummary(): Promise<void> {
  try {
    const memories = await window.deskpet.listSemanticMemories()
    semanticSummary.textContent = `语义记忆：${memories.length} 条（仅记录你明确要求记住的内容）。`
  } catch {
    // 读取失败时保留占位文案。
  }
}

async function refreshResources(): Promise<void> {
  if (resourceRefreshInFlight) {
    return
  }
  resourceRefreshInFlight = true
  try {
    const [snapshot, runtime] = await Promise.all([
      window.deskpet.getResourceSnapshot(),
      window.deskpet.getRuntimeInfo(),
    ])
    latestRuntime = runtime
    renderResourceSnapshot(snapshot)
    renderEmotionState(runtime)
    renderPresenceTelemetry(runtime)
    renderLastError(runtime)
    renderScreenPerceptionStatus()
  } catch (error) {
    resourceNote.textContent = `资源状态读取失败：${String(error)}`
  } finally {
    resourceRefreshInFlight = false
  }
}

function renderLastError(runtime: RuntimeInfo): void {
  if (!runtime.lastErrorAt || !runtime.lastErrorMessage) {
    lastErrorLine.textContent = '没有记录到主进程异常。'
    lastErrorLine.dataset.kind = ''
    return
  }
  const at = new Date(runtime.lastErrorAt).toLocaleString('zh-CN', { hour12: false })
  lastErrorLine.textContent = `最近一次异常：${at} · ${runtime.lastErrorMessage}`
  lastErrorLine.dataset.kind = 'error'
}

function renderEmotionState(runtime: RuntimeInfo): void {
  const labels: Record<NonNullable<RuntimeInfo['presenceEmotionDominant']>, string> = {
    calm: '平静',
    content: '安心',
    concerned: '担心',
    embarrassed: '害羞',
    annoyed: '不耐烦',
    tired: '疲惫',
  }
  if (!runtime.presenceEmotionEnabled || !runtime.presenceEmotionDominant) {
    emotionDominant.textContent = '已关闭'
    emotionFatigue.textContent = '情绪惯性未启用'
    emotionPatience.textContent = '—'
    emotionSocialBattery.textContent = '—'
    emotionPatienceProgress.style.width = '0%'
    emotionSocialProgress.style.width = '0%'
    return
  }
  emotionDominant.textContent = labels[runtime.presenceEmotionDominant] ?? '平静'
  emotionFatigue.textContent = `疲劳 ${Math.round(runtime.presenceFatigue ?? 0)}`
  const patience = Math.round(runtime.presencePatience ?? 0)
  const social = Math.round(runtime.presenceSocialBattery ?? 0)
  emotionPatience.textContent = String(patience)
  emotionSocialBattery.textContent = String(social)
  emotionPatienceProgress.style.width = `${clamp(patience, 0, 100)}%`
  emotionSocialProgress.style.width = `${clamp(social, 0, 100)}%`
}

async function refreshMemoryTab(): Promise<void> {
  if (memoryDataRefreshInFlight) {
    return
  }
  memoryDataRefreshInFlight = true
  try {
    const [profile, semantic, longterm] = await Promise.all([
      window.deskpet.listProfileFacts(),
      window.deskpet.listSemanticMemories(),
      window.deskpet.listLongTermMemories(),
    ])
    renderProfileFacts(profile)
    renderSemanticMemories(semantic)
    renderLongTermMemories(longterm)
  } catch (error) {
    profileStatus.textContent = '画像读取失败：' + String(error)
    semanticStatus.textContent = '明确记忆读取失败：' + String(error)
    longtermStatus.textContent = '对话沉淀读取失败：' + String(error)
  } finally {
    memoryDataRefreshInFlight = false
  }
}

function openMemoryEditor(
  title: string,
  value: string,
  maxLength: number,
  onSave: (text: string) => Promise<void>,
): void {
  memoryEditorTitle.textContent = title
  memoryEditorText.value = value
  memoryEditorText.maxLength = maxLength
  memoryEditorStatus.textContent = ''
  memoryEditorSave.disabled = false
  memoryEditorSaveHandler = onSave
  memoryEditor.hidden = false
  memoryEditorText.focus()
  memoryEditorText.setSelectionRange(memoryEditorText.value.length, memoryEditorText.value.length)
}

function closeMemoryEditor(): void {
  memoryEditor.hidden = true
  memoryEditorSaveHandler = null
  memoryEditorStatus.textContent = ''
}

function createMemoryAction(label: string, handler: () => void, active = false): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'memory-action'
  button.textContent = label
  if (active) {
    button.dataset.active = 'true'
  }
  button.addEventListener('click', handler)
  return button
}

function renderProfileFacts(facts: ProfileFactView[]): void {
  profileCount.textContent = String(facts.length)
  profileClear.disabled = facts.length === 0
  profileList.replaceChildren(
    ...facts.map((fact) => {
      const item = document.createElement('article')
      item.className = 'memory-item'
      if (fact.pinned) {
        item.classList.add('pinned')
      }
      const body = document.createElement('div')
      const summary = document.createElement('strong')
      const category = document.createElement('span')
      category.className = 'memory-category'
      category.textContent = PROFILE_CATEGORY_LABELS[fact.category]
      summary.append(category, document.createTextNode(fact.text))
      const detail = document.createElement('small')
      detail.textContent =
        (fact.source === 'manual' ? '手动添加' : '从对话提取') +
        ' · ' +
        formatMemoryTime(fact.updatedAt)
      body.append(summary, detail)
      const actions = document.createElement('div')
      actions.className = 'memory-actions'
      actions.append(
        createMemoryAction(
          fact.pinned ? '取消置顶' : '置顶',
          () => {
            void window.deskpet
              .setProfileFactPinned(fact.id, !fact.pinned)
              .then((next) => renderProfileFacts(next))
              .catch((error: unknown) => {
                profileStatus.textContent = '置顶失败：' + String(error)
              })
          },
          fact.pinned,
        ),
        createMemoryAction('编辑', () => {
          void editProfileFact(fact)
        }),
        createMemoryAction('删除', () => {
          void window.deskpet
            .deleteProfileFact(fact.id)
            .then((next) => renderProfileFacts(next))
            .catch((error: unknown) => {
              profileStatus.textContent = '删除失败：' + String(error)
            })
        }),
      )
      item.append(body, actions)
      return item
    }),
  )
  profileStatus.textContent =
    facts.length === 0
      ? '还没有画像事实。聊天里自然提到项目、偏好或作息，或直接在上方添加一条。'
      : '共 ' + facts.length + ' 条；置顶事实会优先进入对话提示词。'
}

function editProfileFact(fact: ProfileFactView): void {
  openMemoryEditor('修改这条画像记忆', fact.text, 60, async (text) => {
    try {
      renderProfileFacts(await window.deskpet.updateProfileFact(fact.id, text))
    } catch (error) {
      profileStatus.textContent = '修改失败：' + String(error)
      throw error
    }
  })
}

async function addProfileFactFromForm(): Promise<void> {
  const text = profileText.value.trim()
  if (!text) {
    profileStatus.textContent = '请先写一条内容。'
    return
  }
  profileAdd.disabled = true
  try {
    const facts = await window.deskpet.addProfileFact(
      profileCategory.value as ProfileCategory,
      text,
    )
    profileText.value = ''
    renderProfileFacts(facts)
    showMessage('已添加一条画像事实。')
  } catch (error) {
    profileStatus.textContent = '添加失败：' + String(error)
  } finally {
    profileAdd.disabled = false
  }
}

function renderSemanticMemories(memories: SemanticMemoryView[]): void {
  semanticCount.textContent = String(memories.length)
  semanticSummary.textContent =
    '语义记忆：' + memories.length + ' 条（仅记录你明确要求记住的内容）。'
  clearSemanticMemoriesButton.disabled = memories.length === 0
  semanticList.replaceChildren(
    ...memories.map((memory) => {
      const item = document.createElement('article')
      item.className = 'memory-item'
      const body = document.createElement('div')
      const summary = document.createElement('strong')
      summary.textContent = memory.statement
      const detail = document.createElement('small')
      detail.textContent = '明确记忆 · ' + formatMemoryTime(memory.at)
      body.append(summary, detail)
      const actions = document.createElement('div')
      actions.className = 'memory-actions'
      actions.append(
        createMemoryAction('编辑', () => {
          void editSemanticMemory(memory)
        }),
        createMemoryAction('删除', () => {
          void window.deskpet
            .deleteSemanticMemory(memory.id)
            .then((next) => renderSemanticMemories(next))
            .catch((error: unknown) => {
              semanticStatus.textContent = '删除失败：' + String(error)
            })
        }),
      )
      item.append(body, actions)
      return item
    }),
  )
  semanticStatus.textContent =
    memories.length === 0
      ? '还没有明确记忆。可以在 AI 预览里点“记住这段”，或在上方手动写一条。'
      : '共 ' + memories.length + ' 条；这些内容会直接进入长期提示词。'
}

function editSemanticMemory(memory: SemanticMemoryView): void {
  openMemoryEditor('修改这条明确记忆', memory.statement, 400, async (text) => {
    try {
      renderSemanticMemories(await window.deskpet.updateSemanticMemory(memory.id, text))
    } catch (error) {
      semanticStatus.textContent = '修改失败：' + String(error)
      throw error
    }
  })
}

async function addSemanticMemoryFromForm(): Promise<void> {
  const text = semanticText.value.trim()
  if (!text) {
    semanticStatus.textContent = '请先写一条内容。'
    return
  }
  semanticAdd.disabled = true
  try {
    const memories = await window.deskpet.rememberSemanticMemory(text)
    semanticText.value = ''
    renderSemanticMemories(memories)
    showMessage('已记住这段内容。')
  } catch (error) {
    semanticStatus.textContent = '添加失败：' + String(error)
  } finally {
    semanticAdd.disabled = false
  }
}

function renderLongTermMemories(memories: LongTermMemoryView[]): void {
  longtermCount.textContent = String(memories.length)
  clearLongtermMemories.disabled = memories.length === 0
  longtermList.replaceChildren(
    ...memories.map((memory) => {
      const item = document.createElement('article')
      item.className = 'memory-item'
      const body = document.createElement('div')
      const summary = document.createElement('strong')
      summary.textContent = memory.text
      const detail = document.createElement('small')
      detail.textContent =
        '对话沉淀 · ' + formatMemoryTime(memory.createdAt) + ' · 命中 ' + memory.hits + ' 次'
      body.append(summary, detail)
      const actions = document.createElement('div')
      actions.className = 'memory-actions'
      actions.append(
        createMemoryAction('编辑', () => {
          void editLongTermMemory(memory)
        }),
        createMemoryAction('删除', () => {
          void window.deskpet
            .deleteLongTermMemory(memory.id)
            .then((next) => renderLongTermMemories(next))
            .catch((error: unknown) => {
              longtermStatus.textContent = '删除失败：' + String(error)
            })
        }),
      )
      item.append(body, actions)
      return item
    }),
  )
  longtermStatus.textContent =
    memories.length === 0
      ? '还没有对话沉淀。完成几轮聊天后会在这里出现。'
      : '显示最近 ' + memories.length + ' 条；删除后不会再被语义召回。'
}

function editLongTermMemory(memory: LongTermMemoryView): void {
  openMemoryEditor('修改这条对话沉淀', memory.text, 160, async (text) => {
    try {
      renderLongTermMemories(await window.deskpet.updateLongTermMemory(memory.id, text))
    } catch (error) {
      longtermStatus.textContent = '修改失败：' + String(error)
      throw error
    }
  })
}

async function refreshMemoryPanel(): Promise<void> {
  if (memoryRefreshInFlight) {
    return
  }
  memoryRefreshInFlight = true
  try {
    const memories = await window.deskpet.listEpisodicMemories()
    renderEpisodicMemories(memories)
  } catch (error) {
    memoryStatus.textContent = `情节记忆读取失败：${String(error)}`
  } finally {
    memoryRefreshInFlight = false
  }
}

function renderEpisodicMemories(memories: EpisodicMemory[]): void {
  memoryCount.textContent = String(memories.length)
  clearMemory.disabled = memories.length === 0 || !presenceMemoryEnabled.checked
  if (!presenceMemoryEnabled.checked) {
    memoryList.replaceChildren()
    memoryStatus.textContent = '连续记忆已关闭；不会读取、写入或生成新的情节记忆。'
    return
  }
  if (memories.length === 0) {
    memoryList.replaceChildren()
    memoryStatus.textContent = '还没有形成情节记忆。完成较长专注或深夜提醒后会在这里出现。'
    return
  }

  memoryList.replaceChildren(
    ...memories.slice(0, 20).map((memory) => {
      const item = document.createElement('article')
      item.className = 'memory-item'
      const text = document.createElement('div')
      const summary = document.createElement('strong')
      summary.textContent = memory.summary
      const detail = document.createElement('small')
      detail.textContent = `${memoryKindLabel(memory.kind)} · ${formatMemoryTime(memory.updatedAt)} · 证据 ${memory.evidenceCount} 次`
      text.append(summary, detail)
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'memory-delete'
      remove.textContent = '删除'
      remove.addEventListener('click', () => {
        remove.disabled = true
        void window.deskpet
          .deleteEpisodicMemory(memory.id)
          .then((remaining) => renderEpisodicMemories(remaining))
          .catch((error: unknown) => {
            memoryStatus.textContent = `删除失败：${String(error)}`
            remove.disabled = false
          })
      })
      item.append(text, remove)
      return item
    }),
  )
  memoryStatus.textContent =
    memories.length > 20
      ? `显示最近 20 条，共 ${memories.length} 条情节记忆。`
      : `共 ${memories.length} 条情节记忆；最多保留 100 条，普通记忆 30 天后过期。`
}

function memoryKindLabel(kind: EpisodicMemory['kind']): string {
  const labels: Record<EpisodicMemory['kind'], string> = {
    late_night_work: '深夜工作',
    long_focus: '长时间专注',
    frequent_return: '返回习惯',
    relationship_milestone: '关系里程碑',
    explicit_preference: '明确偏好',
  }
  return labels[kind]
}

function formatMemoryTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function renderResourceSnapshot(snapshot: ResourceSnapshot): void {
  renderTtsStatus(snapshot.tts)
  resourceTtsMemory.textContent =
    snapshot.ttsMemoryMB === null ? '—' : `${Math.round(snapshot.ttsMemoryMB)} MB`
  resourceAppUsage.textContent = `${Math.round(snapshot.appMemoryMB)} MB · ${snapshot.appCpuPercent.toFixed(1)}%`
  resourceCache.textContent = formatBytes(snapshot.cacheBytes)
  resourceLog.textContent = formatBytes(snapshot.logBytes)
  resourceNote.textContent = getResourceNote(snapshot.tts)
  document.body.dataset.resourceReady = 'true'
}

function renderPresenceTelemetry(runtime: RuntimeInfo): void {
  const telemetry = runtime.presenceTelemetry
  const silentRatio =
    telemetry.decisions === 0
      ? 0
      : Math.round((telemetry.silentDecisions / telemetry.decisions) * 100)
  telemetryDecisions.textContent = `${telemetry.sceneSamples} / ${telemetry.decisions}`
  telemetrySilentRatio.textContent = `${silentRatio}%`
  telemetryPerformed.textContent = `${telemetry.performed} / ${telemetry.speeches}`
  telemetryRepeats.textContent = String(
    telemetry.repeatedDialoguesSuppressed + telemetry.repeatedIdleClipsSuppressed,
  )
  telemetryInterruptions.textContent = `${telemetry.actionInterruptions} / ${telemetry.voiceInterruptions}`
  telemetryUptime.textContent = formatRunDuration(telemetry.uptimeMs)
}

function formatRunDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

function renderTimeSceneContext(context: TimeSceneContext): void {
  const periodLabels: Record<TimePeriod, string> = {
    late_night: '深夜',
    early_morning: '清晨',
    morning: '上午',
    afternoon: '下午',
    evening: '晚间',
    night: '夜间',
  }
  const sceneLabels: Record<SceneKind, string> = {
    browser: '浏览网页',
    focus: '专注阅读/写作',
    development: '开发工作',
    communication: '通讯',
    media: '影音娱乐',
    desktop: '桌面',
    system: '系统/桌宠设置',
    other: '其他应用',
    unknown: '未知',
  }
  const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const dateParts = context.localDate.split('-')
  const shortDate =
    dateParts.length === 3
      ? `${Number(dateParts[1])}月${Number(dateParts[2])}日`
      : context.localDate
  contextClock.textContent = `${context.localTime} · ${shortDate} ${weekdayLabels[context.weekday] ?? ''}`
  contextPeriod.textContent = `${periodLabels[context.timePeriod]}${context.isWeekend ? ' · 周末' : ''}`
  contextScene.textContent = sceneLabels[context.scene]
  contextApp.textContent =
    context.foregroundApp ?? (context.screenLocked || context.suspended ? '系统不可见' : '未知')
  contextSystem.textContent = [
    context.screenLocked ? '锁屏' : context.suspended ? '睡眠' : '使用中',
    context.onBatteryPower ? '电池' : '电源',
    formatIdleTime(context.systemIdleSeconds),
  ].join(' · ')
  document.body.dataset.timeSceneReady = 'true'
}

async function refreshAiState(): Promise<void> {
  try {
    latestAiStatus = await window.deskpet.getAiStatus()
    renderAiStatus()
  } catch (error) {
    aiStatus.textContent = `AI 状态读取失败：${String(error)}`
    aiStatus.dataset.kind = 'error'
  }
}

function renderAiStatus(): void {
  if (!latestAiStatus) {
    aiStatus.textContent = 'AI 状态未知。'
    return
  }
  const parts = [
    latestAiStatus.enabled ? 'DeepSeek 已启用' : 'DeepSeek 未启用',
    latestAiStatus.keyConfigured ? 'API Key 已保存' : '尚未保存 API Key',
    latestAiStatus.proactiveEnabled ? '主动 AI 已启用' : '主动 AI 已关闭',
    `主动请求 ${latestAiStatus.proactiveRequestsLastHour}/${latestAiStatus.proactiveRequestLimit} 次每小时`,
    formatProactiveOutcome(latestAiStatus),
    latestAiStatus.encryptionAvailable ? '安全存储可用' : '安全存储不可用',
    latestAiStatus.accessibilityTrusted ? '辅助功能已授权' : '辅助功能未授权',
  ]
  aiStatus.textContent =
    latestAiStatus.lastError ?? `${parts.join(' · ')} · ${latestAiStatus.model}`
  aiStatus.dataset.kind = latestAiStatus.lastError ? 'error' : 'ready'
  deepSeekKey.disabled = saving || !latestAiStatus.encryptionAvailable
  saveDeepSeekKey.disabled = saving || !latestAiStatus.encryptionAvailable
  deleteDeepSeekKey.disabled = saving || !latestAiStatus.keyConfigured
  requestAccessibility.disabled = saving || latestAiStatus.accessibilityTrusted
  aiAnalyzeTask.disabled = saving || !latestAiStatus.enabled
  aiAnalyzeSelection.disabled = saving || !latestAiStatus.enabled || !aiSelectedTextEnabled.checked
  renderScreenPerceptionStatus()
  renderPermissionStatus()
}

function renderScreenPerceptionStatus(): void {
  const snapshot = latestSnapshot
  if (!snapshot) {
    return
  }
  const enabled = snapshot.settings.screenPerceptionEnabled
  const paused = snapshot.settings.screenPerceptionPaused
  const aiEnabled = latestAiStatus?.enabled ?? snapshot.settings.aiEnabled
  const status = latestRuntime?.screenPerception
  const parts: string[] = []

  if (!enabled) {
    parts.push('未开启')
  } else if (paused) {
    parts.push('已暂停')
  } else if (!aiEnabled) {
    parts.push('等待启用 DeepSeek')
  } else if (!status) {
    parts.push('正在读取状态')
  } else {
    // 运行时状态可能还没追上刚保存的开关，以设置快照为准展示。
    parts.push(describeScreenPerception({ ...status, configured: true, paused: false }))
    if (status.lastUploadAt) {
      parts.push(`上次分析 ${formatClock(status.lastUploadAt)}`)
    }
    if (status.lastSkipAt) {
      parts.push(`上次跳过 ${formatClock(status.lastSkipAt)}`)
    }
    if (status.lastError) {
      parts.push(status.lastError)
    }
  }

  screenPerceptionStatus.textContent = parts.join(' · ')
  screenPerceptionStatus.dataset.kind =
    status?.lastError || (enabled && status && status.permission !== 'granted') ? 'error' : 'ready'
  screenPerceptionPause.disabled = saving || !enabled || !aiEnabled
  screenPerceptionPause.textContent = paused ? '继续感知' : '暂停感知'
}

async function refreshPermissionStatus(probeAutomation = false): Promise<void> {
  permissionRecheck.disabled = true
  try {
    const previous = latestPermissionStatus
    const next = await window.deskpet.getPermissionStatus(probeAutomation)
    if (!probeAutomation && previous && previous.automation !== 'unknown') {
      next.automation = previous.automation
      next.automationDetail = previous.automationDetail
    }
    latestPermissionStatus = next
    renderPermissionStatus()
  } catch (error) {
    permissionNote.textContent = `权限检测失败：${String(error)}`
  } finally {
    permissionRecheck.disabled = saving
  }
}

function renderPermissionStatus(): void {
  const status = latestPermissionStatus
  if (!status) {
    return
  }
  setPermissionState(permissionScreenState, status.screen)
  setPermissionState(permissionAccessibilityState, status.accessibility)
  setPermissionState(permissionAutomationState, status.automation)
  permissionAutomationDetail.textContent =
    status.automationDetail ??
    (status.automation === 'unknown' ? '点击「重新检测」检查自动化授权' : '页面、媒体与日历读取')

  const allGranted =
    status.screen === 'granted' &&
    status.accessibility === 'granted' &&
    status.automation === 'granted'
  const needsAutomationCheck =
    status.screen === 'granted' &&
    status.accessibility === 'granted' &&
    status.automation === 'unknown'
  permissionNote.textContent = allGranted
    ? `三项权限已就绪 · 上次检测 ${formatClock(status.checkedAt)}`
    : needsAutomationCheck
      ? `屏幕与辅助功能已就绪 · 自动化未检测，点「重新检测」确认`
      : `上次检测 ${formatClock(status.checkedAt)} · 缺权限时点对应按钮，授权后回到这里重新检测`
}

function setPermissionState(element: HTMLElement, state: PermissionSnapshot['screen']): void {
  element.textContent = PERMISSION_STATE_LABELS[state]
  element.dataset.state = state
}

function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatProactiveOutcome(status: AiServiceStatus): string {
  if (!status.proactiveLastOutcome) {
    return '主动计划尚未触发'
  }
  const labels: Record<string, string> = {
    pending: '正在规划',
    speaking: '已采用 AI 台词',
    silent: 'AI 选择保持安静',
    fallback: '已回退本地台词',
    budget_exhausted: '已达每小时预算',
    'cancelled:user': '因互动取消',
    'cancelled:power': '因锁屏或睡眠取消',
    'cancelled:scene': '因场景切换取消',
    'cancelled:settings': '因设置关闭取消',
    'cancelled:hidden': '因隐藏桌宠取消',
    'cancelled:click-through': '因完全穿透取消',
    'cancelled:quit': '因退出取消',
  }
  const outcome = labels[status.proactiveLastOutcome] ?? status.proactiveLastOutcome
  return status.proactiveLastIntent ? `${outcome} · ${status.proactiveLastIntent}` : outcome
}

async function prepareAiPreview(mode: 'task' | 'selection'): Promise<void> {
  setAiBusy(true)
  aiStatus.textContent = mode === 'selection' ? '正在读取选中文字…' : '正在整理当前任务…'
  aiStatus.dataset.kind = 'ready'
  try {
    const preview = await window.deskpet.prepareAiContext(mode)
    showAiPreview(preview)
    await refreshAiState()
  } catch (error) {
    aiStatus.textContent = error instanceof Error ? error.message : String(error)
    aiStatus.dataset.kind = 'error'
  } finally {
    setAiBusy(false)
  }
}

function showAiPreview(preview: AiContextPreview): void {
  pendingAiPreview = preview
  const sceneLabels: Record<SceneKind, string> = {
    browser: '浏览网页',
    focus: '专注阅读/写作',
    development: '开发工作',
    communication: '通讯',
    media: '影音娱乐',
    desktop: '桌面',
    system: '系统/桌宠设置',
    other: '其他应用',
    unknown: '未知',
  }
  aiPreviewMode.textContent =
    preview.mode === 'selection'
      ? preview.manualSelectionRequired
        ? '选中文字 · 手动粘贴'
        : '选中文字'
      : '当前任务'
  aiContextScene.textContent = sceneLabels[preview.context.scene]
  aiContextTime.textContent = `${preview.context.localTime} · ${preview.context.timePeriod}${
    preview.context.isWeekend ? ' · 周末' : ''
  }`
  aiContextTitle.textContent = preview.context.windowTitle ?? '未包含'
  aiSelectedPreview.readOnly = !preview.manualSelectionRequired
  aiSelectedPreview.value = preview.manualSelectionRequired
    ? ''
    : (preview.context.selectedText ?? '（未包含）')
  if (preview.manualSelectionRequired) {
    updateManualSelectionPreview()
  } else {
    aiPreviewNote.textContent = [
      preview.selectedTextTruncated
        ? `选中文字已截断到 ${MAX_AI_SELECTED_TEXT_CHARACTERS} 字。`
        : '',
      `上下文将在 ${Math.max(0, Math.ceil((preview.expiresAt - Date.now()) / 1_000))} 秒后失效。`,
    ]
      .filter(Boolean)
      .join(' ')
  }
  aiPreview.hidden = false
  sendAiContext.disabled = preview.manualSelectionRequired
  cancelAiContext.disabled = false
  aiStatus.textContent = '请检查将要发送的内容，再交给日奈。'
  aiStatus.dataset.kind = 'ready'
  if (preview.manualSelectionRequired) {
    window.requestAnimationFrame(() => aiSelectedPreview.focus())
  }
}

function updateManualSelectionPreview(): void {
  if (!pendingAiPreview?.manualSelectionRequired) {
    return
  }
  const characters = Array.from(aiSelectedPreview.value.trim()).length
  const remainingSeconds = Math.max(0, Math.ceil((pendingAiPreview.expiresAt - Date.now()) / 1_000))
  aiPreviewNote.textContent = characters
    ? `已手动粘贴 ${characters} / ${MAX_AI_SELECTED_TEXT_CHARACTERS} 字 · 上下文将在 ${remainingSeconds} 秒后失效。`
    : `系统未直接读取到选区。请在 Obsidian 中复制文字，再按 ⌘V 粘贴到这里 · ${remainingSeconds} 秒后失效。`
  sendAiContext.disabled = saving || characters === 0
}

function setAiBusy(value: boolean): void {
  deepSeekKey.disabled = value || latestAiStatus?.encryptionAvailable === false
  saveDeepSeekKey.disabled = value || latestAiStatus?.encryptionAvailable === false
  deleteDeepSeekKey.disabled = value || !latestAiStatus?.keyConfigured
  requestAccessibility.disabled = value || latestAiStatus?.accessibilityTrusted === true
  aiAnalyzeTask.disabled = value || !latestAiStatus?.enabled
  aiAnalyzeSelection.disabled = value || !latestAiStatus?.enabled || !aiSelectedTextEnabled.checked
  sendAiContext.disabled =
    value ||
    !pendingAiPreview ||
    (pendingAiPreview.manualSelectionRequired && !aiSelectedPreview.value.trim())
  cancelAiContext.disabled = value || !pendingAiPreview
}

function renderTtsStatus(status: TtsResourceStatus): void {
  const labels: Record<TtsResourceStatus['state'], string> = {
    disabled: '已关闭',
    unloaded: '未加载',
    starting: '加载中',
    ready: '已就绪',
    error: '加载失败',
    suspended: '已暂停',
  }
  resourceTtsState.textContent = labels[status.state]
  resourceTtsState.dataset.state = status.state
  preloadTts.disabled =
    !latestSnapshot?.settings.localTtsEnabled ||
    status.state === 'ready' ||
    status.state === 'starting' ||
    status.state === 'suspended'
  unloadTts.disabled =
    status.state === 'unloaded' || status.state === 'disabled' || status.state === 'suspended'
}

function getResourceNote(status: TtsResourceStatus): string {
  if (!status.enabled || status.state === 'disabled') {
    return '本地 TTS 已关闭，不会加载 Irodori 模型。'
  }
  if (status.state === 'suspended') {
    return '睡眠或锁屏期间已释放声线模型；唤醒后会显示“未加载”，下次语音再按需启动。'
  }
  if (status.state === 'starting') {
    return '正在加载 Irodori 声线；首次使用通常比系统语音慢，请稍候。'
  }
  if (status.state === 'ready') {
    return 'Irodori 声线已就绪；空闲 5 分钟后自动释放，睡眠和锁屏时立即释放。'
  }
  if (status.state === 'error') {
    return status.lastError
      ? `Irodori 启动失败：${status.lastError}`
      : 'Irodori 启动失败；可以尝试“立即释放模型”后重新预加载。'
  }
  return 'Irodori 当前未加载；首次语音或手动预加载时才会占用模型内存。'
}

function startResourceRefresh(): void {
  if (resourceRefreshTimer || document.hidden) {
    return
  }
  void refreshResources()
  resourceRefreshTimer = window.setInterval(() => {
    void refreshResources()
  }, RESOURCE_REFRESH_MS)
}

function stopResourceRefresh(): void {
  if (!resourceRefreshTimer) {
    return
  }
  window.clearInterval(resourceRefreshTimer)
  resourceRefreshTimer = 0
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatIdleTime(seconds: number): string {
  if (seconds < 60) {
    return '刚刚活动'
  }
  if (seconds < 3_600) {
    return `空闲 ${Math.floor(seconds / 60)} 分钟`
  }
  return `空闲 ${(seconds / 3_600).toFixed(1)} 小时`
}

/**
 * 这两项会把本机内容发到云端，开启前必须让用户明确确认一次。
 */
function confirmSensitiveRead(kind: 'window-title' | 'selection' | 'screen-perception'): boolean {
  const message =
    kind === 'window-title'
      ? '开启后，只有你主动触发 AI 时才会读取前台窗口标题，并随请求发送到 DeepSeek 云端。窗口标题可能包含文档名或网页主题。\n\n确定开启吗？'
      : kind === 'selection'
        ? '开启后，按下“解释选中文字”时会把当前选中的文字发送到 DeepSeek 云端，文本会离开本机。\n\n确定开启吗？'
        : '开启后，日奈会约每 8 分钟截取一次当前屏幕；当你在对话里明确问到时，也会即时分析一次。截图会先在本机做敏感内容预检，只有通过预检的截图才会发送给 DeepSeek 做场景理解。\n\n检测到密码、网银、验证码、银行卡号、助记词或支付页面时会跳过本次上传；私人聊天不会按应用整体拦截，但明确包含凭据内容时仍会跳过。\n\n你可以随时在菜单栏点击“暂停屏幕感知”，或在设置页关闭。确定开启吗？'
  return window.confirm(message)
}

function showMessage(message: string, kind: 'info' | 'error' = 'info'): void {
  statusMessage.textContent = message
  statusMessage.dataset.kind = kind
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Required element is missing: ${selector}`)
  }
  return element
}

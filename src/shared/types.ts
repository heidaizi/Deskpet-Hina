import type { TimeSceneContext } from './time-scene'
import type { AiContextMode, AiContextPreview, AiSendResult, AiServiceStatus } from './ai-context'
import type { EpisodicMemory } from './presence'
import type { ScreenPerceptionStatus } from './screen-perception'
import type { PermissionService, PermissionSnapshot } from './permissions'
import type { LongTermMemoryView, ProfileCategory, ProfileFactView } from './memory'

export interface Point2D {
  x: number
  y: number
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayDescriptor {
  id: number
  workArea: Bounds
}

export interface SavedWindowState extends Bounds {
  displayId: number
}

export interface RectHitArea extends Bounds {
  id: string
  type: 'rect'
}

export interface CircleHitArea {
  id: string
  type: 'circle'
  x: number
  y: number
  radius: number
}

export type HitArea = RectHitArea | CircleHitArea

export type InteractionKind = 'tap' | 'hold' | 'drag' | 'double_tap'

export interface PetInteraction {
  kind: InteractionKind
  area: string
}

export const PET_ANIMATIONS = [
  'idle',
  'look_at_cursor',
  'walk',
  'sleep',
  'wake',
  'tap_head',
  'tap_horn',
  'tap_halo',
  'tap_body',
  'headpat',
  'drag_start',
  'drag_loop',
  'drag_end',
  'happy',
  'annoyed',
  'embarrassed',
  'surprised',
  'feed',
  'wave',
  'stretch',
] as const

export type PetAnimation = (typeof PET_ANIMATIONS)[number]

export const PET_EXPRESSIONS = [
  'neutral',
  'happy',
  'annoyed',
  'embarrassed',
  'sleepy',
  'surprised',
] as const

export type PetExpression = (typeof PET_EXPRESSIONS)[number]

export type FacingDirection = 'left' | 'right'

export function isPetAnimation(value: unknown): value is PetAnimation {
  return typeof value === 'string' && PET_ANIMATIONS.includes(value as PetAnimation)
}

export function isPetExpression(value: unknown): value is PetExpression {
  return typeof value === 'string' && PET_EXPRESSIONS.includes(value as PetExpression)
}

export interface RendererCommand {
  action: PetAnimation
  deliveryId?: string
  performanceToken?: string
  modelClip?: string
  performanceId?: string
  expression?: PetExpression
  dialogue?: string
  spokenText?: string
  ttsEmotion?: string
  ttsCaption?: string
  ttsSeed?: number
  ttsDurationScale?: number
  speakDialogue?: boolean
  voice?: string
  facing?: FacingDirection
  bodyPolicy?: 'replace' | 'overlay'
  microMotion?: MicroMotionKind
  idlePerformance?: boolean
  activityClass?: RendererActivityClass
}

export const MICRO_MOTION_KINDS = ['gaze', 'breath', 'hair', 'gaze_breath'] as const
export type MicroMotionKind = (typeof MICRO_MOTION_KINDS)[number]
export type RendererActivityClass = 'interactive' | 'speech' | 'ambient'

export interface CharacterRendererOption {
  id: string
  label: string
  mode: '2d' | '3d'
  status: 'available' | 'planned'
  assetPath?: string
  /** 模型自身的显示比例修正（默认 1）。 */
  scale?: number
}

export interface OutfitGreeting {
  dialogue: string
  spokenText: string
  voice: string
  action: PetAnimation
  expression: PetExpression
}

export interface CharacterInfo {
  id: string
  displayName: string
  renderers: CharacterRendererOption[]
}

export interface AppliedEffect {
  field: 'affectionXp' | 'mood' | 'energy'
  delta: number
}

export interface PetStateView {
  affectionXp: number
  affectionLevel: number
  affectionTitle: string
  affectionLevelMinXp: number
  nextLevelXp: number | null
  nextLevelTitle: string | null
  unlockedContent: string[]
  nextLevelUnlocks: string[]
  mood: number
  energy: number
  dailyAffectionXp: number
  dailyInteractions: number
  dailyAffectionCap: number
  affectionGainCooldownMs: number
}

export interface InteractionResult {
  deliveryId?: string
  performanceToken?: string
  ttsEmotion?: string
  ttsSeed?: number
  ttsDurationScale?: number
  ruleId: string
  animation: PetAnimation
  expression: PetExpression
  dialogue: string
  voice?: string
  state: PetStateView
  appliedEffects: AppliedEffect[]
}

export const PRESENCE_INTENSITIES = ['quiet', 'balanced', 'lively'] as const
export type PresenceIntensity = (typeof PRESENCE_INTENSITIES)[number]

export interface AppSettings {
  schemaVersion: number
  alwaysOnTop: boolean
  interactionsPaused: boolean
  rendererMode: '2d' | '3d'
  /** 3D 模型 id；为空时用该模式下的第一个可用模型。 */
  rendererId: string
  outfitRotationEnabled: boolean
  outfitRotationDays: number
  modelScale: number
  randomVoiceEnabled: boolean
  localTtsEnabled: boolean
  presenceMemoryEnabled: boolean
  presenceEmotionEnabled: boolean
  presenceAutonomyEnabled: boolean
  presenceIntensity: PresenceIntensity
  aiEnabled: boolean
  aiProactiveEnabled: boolean
  aiWindowTitleEnabled: boolean
  aiSelectedTextEnabled: boolean
  screenPerceptionEnabled: boolean
  screenPerceptionPaused: boolean
  conversationMemoryEnabled: boolean
  intelligenceLevel: 'off' | 'basic' | 'adaptive'
  ttsQuality: 'quality' | 'balanced' | 'speed'
  ttsEngine: 'irodori' | 'aivis'
}

export interface ChatMessageView {
  id: string
  role: 'user' | 'pet'
  text: string
  at: number
  emotion?: string
}

export interface ChatSendResult {
  ok: boolean
  message?: ChatMessageView
  error?: string
}

export interface SemanticMemoryView {
  id: string
  at: number
  source: 'explicit'
  statement: string
}

export interface PresenceTelemetrySnapshot {
  sampledAt: number
  uptimeMs: number
  sceneSamples: number
  decisions: number
  silentDecisions: number
  performed: number
  speeches: number
  proactiveRequests: number
  proactiveFallbacks: number
  proactiveCancellations: number
  repeatedDialoguesSuppressed: number
  repeatedIdleClipsSuppressed: number
  actionInterruptions: number
  recoveryCompletions: number
  voiceInterruptions: number
  rules: Record<string, number>
}

export interface RendererModeCommand {
  mode: '2d' | '3d'
  assetPath?: string
  scale?: number
}

export interface SettingsSnapshot {
  revision: number
  version: string
  state: PetStateView
  settings: AppSettings
  contentRuleCount: number
  character: CharacterInfo
}

export interface RuntimeInfo {
  milestone: 'M5'
  renderer: 'multi-renderer'
  e2e: boolean
  presenceMode: 'legacy' | 'shadow' | 'active'
  presenceAutonomyEnabled: boolean
  presenceIntensity: PresenceIntensity
  presenceSpeechState: 'idle' | 'synthesizing' | 'speaking' | 'interrupted'
  presencePerformanceState: 'idle' | 'preparing' | 'performing' | 'recovering'
  presenceActivePerformanceToken: string | null
  presenceLastPerformanceEvent: PerformanceLifecycleType | null
  presenceLastRuleId: string | null
  presenceLastDecision: 'silent' | 'perform' | null
  decisionObservations: number
  decisionSource: 'interaction' | 'autonomous' | 'scene' | 'presence' | null
  decisionUntil: number | null
  lastErrorAt: number | null
  lastErrorMessage: string | null
  presenceEmotionEnabled: boolean
  presenceEmotionDominant:
    'calm' | 'content' | 'concerned' | 'embarrassed' | 'annoyed' | 'tired' | null
  presenceValence: number | null
  presenceActivation: number | null
  presenceFatigue: number | null
  presencePatience: number | null
  presenceSocialBattery: number | null
  presenceMemoryCount: number
  presenceProactiveAiEnabled: boolean
  presenceProactiveAiRequestsLastHour: number
  presenceProactiveAiRequestLimit: number
  presenceLastProactiveAiOutcome: string | null
  presenceLastProactiveAiIntent: string | null
  presenceTelemetry: PresenceTelemetrySnapshot
  screenPerception: ScreenPerceptionStatus
  trayReady: boolean
  trayTitle: string
  trayMenuLabels: string[]
  clickThroughShortcutLabel: string | null
}

export type LocalSpeechSource = 'prebuilt-tts' | 'irodori-tts' | 'aivis-tts' | 'macos-say'

export interface LocalSpeechResult {
  audio: Uint8Array
  source: LocalSpeechSource
  seed?: number
  seedVariant?: number
}

export interface LocalSpeechOptions {
  emotion?: string
  caption?: string
  seed?: number
  durationScale?: number
}

export type TtsRuntimeState = 'disabled' | 'unloaded' | 'starting' | 'ready' | 'error' | 'suspended'

export interface TtsResourceStatus {
  enabled: boolean
  state: TtsRuntimeState
  pid?: number
  lastError?: string
}

export interface ResourceSnapshot {
  tts: TtsResourceStatus
  appCpuPercent: number
  appMemoryMB: number
  ttsMemoryMB: number | null
  cacheBytes: number
  logBytes: number
}

export interface SystemPowerState {
  suspended: boolean
  screenLocked: boolean
  onBatteryPower: boolean
}

export type DeliveryLifecycleType = 'speech_started' | 'speech_completed' | 'speech_interrupted'

export interface DeliveryLifecycleEvent {
  deliveryId: string
  type: DeliveryLifecycleType
  reason?: 'user' | 'new-speech' | 'power' | 'stop' | 'error'
}

export const PERFORMANCE_LIFECYCLE_TYPES = [
  'action_prepared',
  'action_started',
  'action_completed',
  'action_interrupted',
  'micro_started',
  'micro_completed',
  'recovery_started',
  'recovery_completed',
] as const

export type PerformanceLifecycleType = (typeof PERFORMANCE_LIFECYCLE_TYPES)[number]
export type PerformanceState = 'idle' | 'preparing' | 'performing' | 'recovering'
export type PerformanceInterruptReason = 'user' | 'new-action' | 'power' | 'stop' | 'error'

export interface PerformanceLifecycleEvent {
  performanceToken: string
  type: PerformanceLifecycleType
  reason?: PerformanceInterruptReason
  durationMs?: number
}

export interface DeskpetApi {
  updateHitAreas: (areas: HitArea[]) => void
  beginWindowDrag: (point: Point2D) => void
  moveWindowDrag: (point: Point2D) => void
  endWindowDrag: () => void
  showContextMenu: () => void
  getRuntimeInfo: () => Promise<RuntimeInfo>
  interact: (interaction: PetInteraction) => Promise<InteractionResult>
  getSettingsSnapshot: () => Promise<SettingsSnapshot>
  updateSettings: (
    patch: Partial<
      Pick<
        AppSettings,
        | 'alwaysOnTop'
        | 'interactionsPaused'
        | 'rendererMode'
        | 'rendererId'
        | 'outfitRotationEnabled'
        | 'outfitRotationDays'
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
  ) => Promise<SettingsSnapshot>
  previewModelClip: (clip: string) => Promise<boolean>
  resetPetState: () => Promise<SettingsSnapshot>
  openSettings: () => void
  openDataDirectory: () => Promise<void>
  onStateChanged: (callback: (snapshot: SettingsSnapshot) => void) => () => void
  onRendererCommand: (callback: (command: RendererCommand) => void) => () => void
  onRendererModeChanged: (callback: (command: RendererModeCommand) => void) => () => void
  onPreviewModelClip: (callback: (clip: string) => void) => () => void
  onGazePoint: (callback: (point: Point2D | null) => void) => () => void
  reportDeliveryEvent: (event: DeliveryLifecycleEvent) => void
  reportPerformanceEvent: (event: PerformanceLifecycleEvent) => void
  listEpisodicMemories: () => Promise<EpisodicMemory[]>
  deleteEpisodicMemory: (id: string) => Promise<EpisodicMemory[]>
  clearEpisodicMemories: () => Promise<void>
  getConversationStats: () => Promise<{ turns: number }>
  clearConversationMemory: () => Promise<{ turns: number }>
  openChat: () => void
  getOutfitGreeting: (scene?: 'login' | 'return') => Promise<OutfitGreeting | null>
  getChatHistory: () => Promise<ChatMessageView[]>
  sendChatMessage: (text: string) => Promise<ChatSendResult>
  clearChatHistory: () => Promise<void>
  rememberSemanticMemory: (text: string) => Promise<SemanticMemoryView[]>
  listSemanticMemories: () => Promise<SemanticMemoryView[]>
  updateSemanticMemory: (id: string, text: string) => Promise<SemanticMemoryView[]>
  deleteSemanticMemory: (id: string) => Promise<SemanticMemoryView[]>
  clearSemanticMemories: () => Promise<SemanticMemoryView[]>
  listProfileFacts: () => Promise<ProfileFactView[]>
  addProfileFact: (category: ProfileCategory, text: string) => Promise<ProfileFactView[]>
  updateProfileFact: (id: string, text: string) => Promise<ProfileFactView[]>
  deleteProfileFact: (id: string) => Promise<ProfileFactView[]>
  setProfileFactPinned: (id: string, pinned: boolean) => Promise<ProfileFactView[]>
  clearProfileFacts: () => Promise<ProfileFactView[]>
  listLongTermMemories: () => Promise<LongTermMemoryView[]>
  updateLongTermMemory: (id: string, text: string) => Promise<LongTermMemoryView[]>
  deleteLongTermMemory: (id: string) => Promise<LongTermMemoryView[]>
  clearLongTermMemories: () => Promise<LongTermMemoryView[]>
  loadCharacterAsset: (assetPath: string) => Promise<Uint8Array>
  synthesizeLocalSpeech: (
    text: string,
    options?: LocalSpeechOptions,
  ) => Promise<LocalSpeechResult | null>
  startSpeechStream: (streamId: string, text: string, options?: LocalSpeechOptions) => void
  cancelSpeechStream: (streamId: string) => void
  onSpeechChunk: (
    callback: (payload: { streamId: string; index: number; audio: Uint8Array }) => void,
  ) => () => void
  onSpeechStreamEnd: (callback: (payload: { streamId: string; ok: boolean }) => void) => () => void
  getResourceSnapshot: () => Promise<ResourceSnapshot>
  getTimeSceneContext: () => Promise<TimeSceneContext>
  getSystemPowerState: () => Promise<SystemPowerState>
  unloadLocalTts: () => Promise<TtsResourceStatus>
  preloadLocalTts: () => Promise<TtsResourceStatus>
  onTimeSceneChanged: (callback: (context: TimeSceneContext) => void) => () => void
  onSystemPowerState: (callback: (state: SystemPowerState) => void) => () => void
  getPermissionStatus: (probeAutomation?: boolean) => Promise<PermissionSnapshot>
  openPermissionSettings: (service: PermissionService) => Promise<void>
  getAiStatus: () => Promise<AiServiceStatus>
  saveDeepSeekKey: (key: string) => Promise<AiServiceStatus>
  deleteDeepSeekKey: () => Promise<AiServiceStatus>
  requestAccessibilityPermission: () => Promise<AiServiceStatus>
  prepareAiContext: (mode: AiContextMode) => Promise<AiContextPreview>
  getPendingAiContext: () => Promise<AiContextPreview | null>
  sendPendingAiContext: (id: string, manualSelectedText?: string) => Promise<AiSendResult>
  cancelPendingAiContext: (id: string) => Promise<void>
  onAiContextPrepared: (callback: (preview: AiContextPreview) => void) => () => void
  onAiContextError: (callback: (message: string) => void) => () => void
  reportRendererFailure: (message: string) => void
}

import type { BrowserWindow, Point, Tray } from 'electron'
import type { AiContextInput, AiContextPreview } from '../shared/ai-context'
import {
  PET_LOGICAL_HEIGHT,
  PET_LOGICAL_WIDTH,
  type InteractionEnvelope,
} from '../shared/interaction-envelope'
import {
  createTimeSceneContext,
  type TimePeriod,
  type TimeSceneContext,
} from '../shared/time-scene'
import type { HitArea, Point2D, SystemPowerState } from '../shared/types'
import type { AutonomousBehaviorScheduler } from './autonomous-behavior'
import type { AiContextService } from './domain/ai-context-service'
import type { DeepSeekKeyStore } from './domain/deepseek-key-store'
import type { GlossaryEntry } from './domain/glossary'
import type { LongTermMemory } from './domain/memory/long-term-memory'
import type { UserProfile } from './domain/memory/user-profile'
import type { RelationshipState } from './domain/relationship-state'
import type { ConversationBuffer } from './domain/memory/conversation-buffer'
import type { FeedbackStore } from './domain/memory/feedback-store'
import type { SemanticMemoryStore } from './domain/memory/semantic-memory'
import type { LocalTtsService } from './domain/local-tts-service'
import type { PetController } from './domain/pet-controller'
import type { PresenceController } from './presence/presence-controller'
import type { PresenceEmotionStore } from './presence/presence-emotion-store'
import type { PresenceMemoryStore } from './presence/presence-memory-store'
import type { PresenceSessionStore } from './presence/presence-session-store'
import type { SceneCompanion } from '../shared/scene-companion'
import type { TimeSceneMonitor } from './time-scene-monitor'

export interface ClickThroughShortcut {
  accelerator: string
  label: string
}

export interface PendingAiContext {
  preview: AiContextPreview
  context: AiContextInput
  timer: NodeJS.Timeout
}

/**
 * 主进程共享的可变状态。
 *
 * 这里只存放跨模块共享的句柄与运行期状态；模块内部的临时变量不应放进此对象。
 * 拆分 `index.ts` 时，各模块通过 `state` 读写同一份状态，语义与原来的模块级变量一致。
 */
export interface AppState {
  petWindow: BrowserWindow | null
  petWindowEnvelope: InteractionEnvelope
  settingsWindow: BrowserWindow | null
  chatWindow: BrowserWindow | null
  tray: Tray | null
  petController: PetController | null
  mousePollTimer: NodeJS.Timeout | null
  saveTimer: NodeJS.Timeout | null
  clickThroughFallbackTimer: NodeJS.Timeout | null
  hitAreas: HitArea[]
  ignoreMouseEvents: boolean
  interactionLocked: boolean
  clickThroughMode: boolean
  petVisible: boolean
  currentDisplayId: number
  dragStartPoint: Point | null
  dragStartWindowPosition: Point | null
  windowStateFilePath: string
  activeClickThroughShortcut: ClickThroughShortcut | null
  autonomousScheduler: AutonomousBehaviorScheduler | null
  autonomousWalkTimer: NodeJS.Timeout | null
  autonomousWalkGeneration: number
  lastInteractionAt: number
  lastProactiveDialogueAt: number
  lastAutonomousWalkDirection: -1 | 1 | undefined
  lastGazePoint: Point2D | null
  localTtsService: LocalTtsService | null
  timeSceneMonitor: TimeSceneMonitor | null
  sceneCompanion: SceneCompanion | null
  presenceController: PresenceController | null
  presenceSessionStore: PresenceSessionStore | null
  presenceEmotionStore: PresenceEmotionStore | null
  presenceMemoryStore: PresenceMemoryStore | null
  aiContextService: AiContextService | null
  conversationBuffer: ConversationBuffer | null
  glossary: GlossaryEntry[]
  longTermMemory: LongTermMemory | null
  userProfile: UserProfile | null
  relationshipState: RelationshipState | null
  semanticMemory: SemanticMemoryStore | null
  feedbackStore: FeedbackStore | null
  deepSeekKeyStore: DeepSeekKeyStore | null
  pendingAiContext: PendingAiContext | null
  aiLastError: string | undefined
  timeSceneContext: TimeSceneContext
  observedTimePeriod: TimePeriod | null
  lastExternalScene: TimeSceneContext['scene']
  timeSceneTrackingStartedAt: number
  systemPowerState: SystemPowerState
}

export function createAppState(): AppState {
  return {
    petWindow: null,
    petWindowEnvelope: {
      cropX: 0,
      cropY: 0,
      width: PET_LOGICAL_WIDTH,
      height: PET_LOGICAL_HEIGHT,
      modelOffsetY: 0,
      logicalHeight: PET_LOGICAL_HEIGHT,
    },
    settingsWindow: null,
    chatWindow: null,
    tray: null,
    petController: null,
    mousePollTimer: null,
    saveTimer: null,
    clickThroughFallbackTimer: null,
    hitAreas: [],
    ignoreMouseEvents: false,
    interactionLocked: false,
    clickThroughMode: false,
    petVisible: true,
    currentDisplayId: 0,
    dragStartPoint: null,
    dragStartWindowPosition: null,
    windowStateFilePath: '',
    activeClickThroughShortcut: null,
    autonomousScheduler: null,
    autonomousWalkTimer: null,
    autonomousWalkGeneration: 0,
    lastInteractionAt: Date.now(),
    lastProactiveDialogueAt: 0,
    lastAutonomousWalkDirection: undefined,
    lastGazePoint: null,
    localTtsService: null,
    timeSceneMonitor: null,
    sceneCompanion: null,
    presenceController: null,
    presenceSessionStore: null,
    presenceEmotionStore: null,
    presenceMemoryStore: null,
    aiContextService: null,
    conversationBuffer: null,
    glossary: [],
    longTermMemory: null,
    userProfile: null,
    relationshipState: null,
    semanticMemory: null,
    feedbackStore: null,
    deepSeekKeyStore: null,
    pendingAiContext: null,
    aiLastError: undefined,
    timeSceneContext: createTimeSceneContext(new Date(), null, 0, {
      onBatteryPower: false,
      screenLocked: false,
      suspended: false,
    }),
    observedTimePeriod: null,
    lastExternalScene: 'other',
    timeSceneTrackingStartedAt: 0,
    systemPowerState: {
      suspended: false,
      screenLocked: false,
      onBatteryPower: false,
    },
  }
}

export const state: AppState = createAppState()

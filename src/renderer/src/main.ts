import type {
  DeliveryLifecycleEvent,
  InteractionKind,
  LocalSpeechOptions,
  LocalSpeechResult,
  LocalSpeechSource,
  MicroMotionKind,
  PerformanceLifecycleEvent,
  PerformanceState,
  Point2D,
  RendererCommand,
  RendererModeCommand,
  SettingsSnapshot,
  SystemPowerState,
} from '@shared/types'
import {
  calculateBubbleDisplayDurationMs,
  calculateBubbleLayout,
  calculateInteractionEnvelope,
  PET_LOGICAL_HEIGHT,
  PET_LOGICAL_WIDTH,
  type InteractionEnvelope,
} from '@shared/interaction-envelope'
import { MODEL_SCALE_MAX, MODEL_SCALE_MIN } from '@shared/model-animations'
import { getOfficialVoiceLine } from '@shared/official-voices'
import { shouldChunkSpeech, splitSpeechText } from '@shared/speech-chunks'
import { normalizeRendererAction, normalizeRendererExpression } from './renderers/action-map'
import { GLBPetRenderer } from './renderers/glb-renderer'
import type { PetRenderer, RenderPowerMode } from './renderers/pet-renderer'
import { PlaceholderPixiRenderer } from './renderers/placeholder-pixi-renderer'
import { VRMRenderer } from './renderers/vrm-renderer'
import './style.css'

const LONG_PRESS_MS = 650
const DRAG_THRESHOLD = 3
const DOUBLE_TAP_MS = 300
const ACTIVE_IDLE_DELAY_MS = 15_000
const BATTERY_IDLE_DELAY_MS = 4_000
const ACTION_PREPARE_MS = 70
const RECOVERY_DELAY_MS = 120
const RECOVERY_DURATION_MS = 220
const MICRO_MOTION_DURATION_MS = 1_800
const LOOP_ACTION_WINDOW_MS = 4_000
const IDLE_CLIP_REPEAT_MS = 5 * 60_000

interface InteractionState {
  pointerId: number
  startClient: Point2D
  zone: string
  dragging: boolean
  longPressTriggered: boolean
  longPressTimer: number
}

const bubble = requireElement<HTMLDivElement>('#bubble')
const appContainer = requireElement<HTMLElement>('#app')
let renderer: PetRenderer | null = null
let canvas: HTMLCanvasElement | null = null
let removeCanvasListeners: (() => void) | null = null
let rendererMode: '2d' | '3d' = '2d'
let rendererSwitchGeneration = 0
let interaction: InteractionState | null = null
let bubbleTimer = 0
let bubbleVisibleUntil = 0
let activeBubbleText = ''
let lastTapZone = ''
let lastTapAt = 0
let interactionSequence = 0
let currentModelScale = 1
let activeVoice: HTMLAudioElement | null = null
let streamedVoiceSources: AudioBufferSourceNode[] = []
let streamedVoiceContext: AudioContext | null = null
let streamedVoiceId: string | null = null
let streamedNextTime = 0
let streamedUnsubscribeChunk: (() => void) | null = null
let streamedUnsubscribeEnd: (() => void) | null = null
let activeLocalVoiceUrl: string | null = null
let resolveActiveVoicePlayback: ((outcome: SynthesizedPlaybackOutcome) => void) | null = null
let activeDeliveryId: string | null = null
let voiceGeneration = 0
let performanceGeneration = 0
let activePerformanceToken: string | null = null
let performanceState: PerformanceState = 'idle'
let actionPrepareTimer = 0
let actionCompletionTimer = 0
let recoveryTimer = 0
let activeActionLoop = false
let dragLoopLocked = false
let recoveryScheduledForToken: string | null = null
let activeMicroToken: string | null = null
let lastIdleClip: { clip: string; at: number } | null = null
let voiceInterruptedCount = 0
let localTtsEnabled = true
let ttsEngine: 'irodori' | 'aivis' = 'irodori'
let settingsReady = false
let systemPowerState: SystemPowerState = {
  suspended: false,
  screenLocked: false,
  onBatteryPower: false,
}
let lastRendererActivityAt = performance.now()
let rendererIdleTimer = 0
let currentRenderPowerMode: RenderPowerMode | null = null
let lastGlobalGazePoint: Point2D | null = null
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const voiceUrlCache = new Map<string, string>()

type SynthesizedPlaybackOutcome = 'ended' | 'interrupted'

const initialSnapshot = await window.deskpet.getSettingsSnapshot()
systemPowerState = await window.deskpet.getSystemPowerState()
document.body.dataset.systemOnBattery = String(systemPowerState.onBatteryPower)
currentModelScale = initialSnapshot.settings.modelScale
localTtsEnabled = initialSnapshot.settings.localTtsEnabled
ttsEngine = initialSnapshot.settings.ttsEngine
settingsReady = true
await switchRenderer({
  mode: initialSnapshot.settings.rendererMode,
  assetPath: findRendererAsset(initialSnapshot, initialSnapshot.settings.rendererMode),
})

window.deskpet.onStateChanged((snapshot) => {
  applyModelScale(snapshot.settings.modelScale)
  const wasLocalTtsEnabled = localTtsEnabled
  localTtsEnabled = snapshot.settings.localTtsEnabled
  ttsEngine = snapshot.settings.ttsEngine
  settingsReady = true
  if (wasLocalTtsEnabled && !localTtsEnabled) {
    stopVoicePlayback()
  }
})
window.deskpet.onRendererCommand((command) => {
  applyRendererCommand(command)
})
window.deskpet.onRendererModeChanged((command) => {
  void switchRenderer(command)
})
window.deskpet.onPreviewModelClip((clip) => {
  if (!renderer?.playClip) {
    return
  }
  renderer.playClip(clip)
  document.body.dataset.lastModelClip = clip
})
window.deskpet.onGazePoint((point) => {
  if (
    point &&
    (!lastGlobalGazePoint ||
      Math.abs(point.x - lastGlobalGazePoint.x) > 0.25 ||
      Math.abs(point.y - lastGlobalGazePoint.y) > 0.25)
  ) {
    markRendererActivity()
  }
  lastGlobalGazePoint = point
  renderer?.setGaze(point)
})
window.deskpet.onSystemPowerState((state) => {
  systemPowerState = state
  document.body.dataset.systemOnBattery = String(state.onBatteryPower)
  if (state.suspended || state.screenLocked) {
    interruptActivePerformance('power')
  }
  applyRenderPowerMode()
  scheduleRendererIdleTransition()
})
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    interruptActivePerformance('power')
  }
  applyRenderPowerMode()
  scheduleRendererIdleTransition()
})
reducedMotionQuery.addEventListener('change', () => {
  applyRenderPowerMode()
  scheduleRendererIdleTransition()
})

const runtime = await window.deskpet.getRuntimeInfo()
document.body.dataset.runtime = `${runtime.milestone}-${document.body.dataset.rendererId ?? '2d-placeholder'}`
document.body.dataset.ready = 'true'
markRendererActivity()

window.setTimeout(() => {
  showBubble('啊，欢迎回来，老师。训练的准备已经做好了。')
  void playVoice(getOfficialVoiceLine('LogIn_1')?.path)
}, 500)

async function switchRenderer(command: RendererModeCommand): Promise<void> {
  if (renderer && rendererMode === command.mode) {
    return
  }

  if (interaction) {
    window.clearTimeout(interaction.longPressTimer)
    interaction = null
    window.deskpet.endWindowDrag()
  }
  interruptActivePerformance('stop')

  const generation = ++rendererSwitchGeneration
  removeCanvasListeners?.()
  removeCanvasListeners = null
  renderer?.destroy()
  renderer = null
  canvas = null

  let resolvedMode = command.mode
  let nextRenderer: PetRenderer
  if (command.mode === '3d') {
    if (!command.assetPath) {
      showBubble('没有配置 3D 模型，继续保持 2D。')
      window.deskpet.reportRendererFailure('No 3D asset path is configured.')
      nextRenderer = new PlaceholderPixiRenderer()
      resolvedMode = '2d'
    } else {
      nextRenderer = command.assetPath.toLowerCase().endsWith('.glb')
        ? new GLBPetRenderer(command.assetPath, window.deskpet.loadCharacterAsset)
        : new VRMRenderer(command.assetPath, window.deskpet.loadCharacterAsset)
    }
  } else {
    nextRenderer = new PlaceholderPixiRenderer()
  }

  try {
    await nextRenderer.mount(appContainer)
  } catch (error) {
    nextRenderer.destroy()
    if (generation !== rendererSwitchGeneration) {
      return
    }
    console.error('Renderer failed to mount:', error)
    window.deskpet.reportRendererFailure(String(error))
    showBubble('3D 模型加载失败，已切回 2D。')
    nextRenderer = new PlaceholderPixiRenderer()
    await nextRenderer.mount(appContainer)
    resolvedMode = '2d'
  }

  if (generation !== rendererSwitchGeneration) {
    nextRenderer.destroy()
    return
  }

  renderer = nextRenderer
  rendererMode = resolvedMode
  canvas = renderer.getCanvas()
  bindCanvasListeners(canvas)
  applyModelScale(currentModelScale)
  renderer.playAction('idle')
  document.body.dataset.rendererMode = rendererMode
  document.body.dataset.rendererId = renderer.id
  currentRenderPowerMode = null
  applyRenderPowerMode()
}

function applyModelScale(scale: number): void {
  currentModelScale = Math.min(MODEL_SCALE_MAX, Math.max(MODEL_SCALE_MIN, scale))
  renderer?.setScale?.(currentModelScale)
  const bubbleScale = rendererMode === '3d' ? currentModelScale : 1
  updateBubbleLayout(bubbleScale)
  updateInteractionEnvelope(calculateInteractionEnvelope(rendererMode, bubbleScale))
}

function updateBubbleLayout(scale: number): void {
  const layout = calculateBubbleLayout(scale)

  bubble.style.setProperty('--bubble-bottom', `${layout.bottom.toFixed(1)}px`)
  bubble.style.setProperty('--bubble-max-width', `${layout.maxWidth.toFixed(1)}px`)
  bubble.style.setProperty('--bubble-font-size', `${layout.fontSize.toFixed(2)}px`)
  bubble.style.setProperty('--bubble-padding-y', `${layout.paddingY.toFixed(1)}px`)
  bubble.style.setProperty('--bubble-padding-x', `${layout.paddingX.toFixed(1)}px`)
  bubble.style.setProperty('--bubble-border-radius', `${layout.borderRadius.toFixed(1)}px`)
  bubble.dataset.modelScale = scale.toFixed(2)
  bubble.dataset.anchorY = layout.headTop.toFixed(1)
  bubble.dataset.modelTop = layout.visualTop.toFixed(1)
}

function updateInteractionEnvelope(envelope: InteractionEnvelope): void {
  appContainer.style.position = 'absolute'
  appContainer.style.left = '0'
  appContainer.style.top = '0'
  appContainer.style.width = `${PET_LOGICAL_WIDTH}px`
  appContainer.style.height = `${envelope.logicalHeight}px`
  appContainer.style.setProperty('--model-offset-y', `${envelope.modelOffsetY}px`)
  appContainer.style.transformOrigin = '0 0'
  appContainer.style.transform = `translate(${-envelope.cropX}px, ${-envelope.cropY}px)`

  document.body.dataset.interactionWidth = String(envelope.width)
  document.body.dataset.interactionHeight = String(envelope.height)
  document.body.dataset.interactionCropX = String(envelope.cropX)
  document.body.dataset.interactionCropY = String(envelope.cropY)
  document.body.dataset.modelOffsetY = String(envelope.modelOffsetY)
  document.body.dataset.logicalHeight = String(envelope.logicalHeight)

  const areas = renderer?.getHitAreas() ?? []
  window.deskpet.updateHitAreas(
    areas.map((area) => ({
      ...area,
      x: area.x - envelope.cropX,
      y: area.y + envelope.modelOffsetY - envelope.cropY,
    })),
  )
}

function markRendererActivity(): void {
  lastRendererActivityAt = performance.now()
  applyRenderPowerMode()
  scheduleRendererIdleTransition()
}

function scheduleRendererIdleTransition(): void {
  window.clearTimeout(rendererIdleTimer)
  rendererIdleTimer = 0
  if (
    systemPowerState.suspended ||
    systemPowerState.screenLocked ||
    document.hidden ||
    reducedMotionQuery.matches
  ) {
    return
  }
  const idleDelay = systemPowerState.onBatteryPower ? BATTERY_IDLE_DELAY_MS : ACTIVE_IDLE_DELAY_MS
  const elapsed = performance.now() - lastRendererActivityAt
  const delay = Math.max(25, idleDelay - elapsed + 25)
  rendererIdleTimer = window.setTimeout(() => {
    rendererIdleTimer = 0
    applyRenderPowerMode()
    if (currentRenderPowerMode === 'active') {
      scheduleRendererIdleTransition()
    }
  }, delay)
}

function applyRenderPowerMode(): void {
  let mode: RenderPowerMode
  if (systemPowerState.suspended || systemPowerState.screenLocked || document.hidden) {
    mode = 'paused'
  } else if (reducedMotionQuery.matches) {
    mode = 'low-power'
  } else {
    const idleMs = performance.now() - lastRendererActivityAt
    if (systemPowerState.onBatteryPower) {
      mode = idleMs >= BATTERY_IDLE_DELAY_MS ? 'low-power' : 'active'
    } else {
      mode = idleMs >= ACTIVE_IDLE_DELAY_MS ? 'idle' : 'active'
    }
  }
  if (mode === currentRenderPowerMode) {
    return
  }
  currentRenderPowerMode = mode
  renderer?.setPowerMode?.(mode)
  document.body.dataset.renderPowerMode = mode
}

function bindCanvasListeners(currentCanvas: HTMLCanvasElement): void {
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !renderer) {
      return
    }

    const point = toCanvasPoint(event)
    const zone = renderer.hitTest(point)
    if (!zone) {
      return
    }

    markRendererActivity()
    interruptActivePerformance('user')
    event.preventDefault()
    currentCanvas.setPointerCapture(event.pointerId)
    interaction = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      zone: zone.id,
      dragging: false,
      longPressTriggered: false,
      longPressTimer: 0,
    }

    window.deskpet.beginWindowDrag({ x: event.screenX, y: event.screenY })

    if (zone.id === 'head') {
      interaction.longPressTimer = window.setTimeout(() => {
        if (interaction && !interaction.dragging) {
          interaction.longPressTriggered = true
          renderer?.playAction('headpat')
          void sendInteraction('hold', interaction.zone)
        }
      }, LONG_PRESS_MS)
    }
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!renderer) {
      return
    }
    const point = toCanvasPoint(event)

    if (!interaction) {
      markRendererActivity()
      renderer.setGaze(point)
      return
    }

    const distance = Math.hypot(
      event.clientX - interaction.startClient.x,
      event.clientY - interaction.startClient.y,
    )

    if (!interaction.dragging && distance > DRAG_THRESHOLD) {
      interaction.dragging = true
      window.clearTimeout(interaction.longPressTimer)
      markRendererActivity()
      renderer.playSustainedAction?.('drag_start') ??
        renderer.playAction('drag_start', { immediate: true, loop: true })
      void sendInteraction('drag', interaction.zone, { preserveAnimation: true })
    }

    if (interaction.dragging) {
      markRendererActivity()
      window.deskpet.moveWindowDrag({ x: event.screenX, y: event.screenY })
    }
  }

  const finishInteraction = (event: PointerEvent): void => {
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return
    }

    window.clearTimeout(interaction.longPressTimer)
    const completed = interaction
    interaction = null

    if (currentCanvas.hasPointerCapture(event.pointerId)) {
      currentCanvas.releasePointerCapture(event.pointerId)
    }
    window.deskpet.endWindowDrag()

    if (completed.dragging) {
      renderer?.playAction('drag_end', { immediate: true })
      // 拖动本身是一次完整交互，结束时只收起动作，让拖动台词播完。
      interruptActivePerformance('stop', { keepVoice: true })
      return
    }

    if (completed.longPressTriggered) {
      return
    }

    const now = performance.now()
    const isDoubleTap = completed.zone === lastTapZone && now - lastTapAt < DOUBLE_TAP_MS
    lastTapZone = completed.zone
    lastTapAt = now
    void sendInteraction(isDoubleTap ? 'double_tap' : 'tap', completed.zone)
  }

  const onPointerLeave = (): void => {
    if (!interaction) {
      renderer?.setGaze(null)
    }
  }

  const onContextMenu = (event: MouseEvent): void => {
    if (!renderer) {
      return
    }
    const point = toCanvasPoint(event)
    if (!renderer.hitTest(point)) {
      return
    }
    event.preventDefault()
    window.deskpet.showContextMenu()
  }

  currentCanvas.addEventListener('pointerdown', onPointerDown)
  currentCanvas.addEventListener('pointermove', onPointerMove)
  currentCanvas.addEventListener('pointerup', finishInteraction)
  currentCanvas.addEventListener('pointercancel', finishInteraction)
  currentCanvas.addEventListener('pointerleave', onPointerLeave)
  currentCanvas.addEventListener('contextmenu', onContextMenu)

  removeCanvasListeners = () => {
    currentCanvas.removeEventListener('pointerdown', onPointerDown)
    currentCanvas.removeEventListener('pointermove', onPointerMove)
    currentCanvas.removeEventListener('pointerup', finishInteraction)
    currentCanvas.removeEventListener('pointercancel', finishInteraction)
    currentCanvas.removeEventListener('pointerleave', onPointerLeave)
    currentCanvas.removeEventListener('contextmenu', onContextMenu)
  }
}

async function sendInteraction(
  kind: InteractionKind,
  area: string,
  options: { preserveAnimation?: boolean } = {},
): Promise<void> {
  const sequence = ++interactionSequence
  try {
    const result = await window.deskpet.interact({ kind, area })
    if (sequence !== interactionSequence) {
      return
    }
    const performanceToken = result.performanceToken ?? createPerformanceToken()
    if (!options.preserveAnimation) {
      runFullPerformance(
        {
          action: result.animation,
          deliveryId: result.deliveryId,
          performanceToken,
          performanceId: `interaction:${result.ruleId}`,
          expression: result.expression,
          dialogue: result.dialogue,
          spokenText: result.dialogue,
          voice: result.voice,
          ttsEmotion: result.ttsEmotion,
          ttsSeed: result.ttsSeed,
          ttsDurationScale: result.ttsDurationScale,
          speakDialogue: true,
          bodyPolicy: 'replace',
        },
        performanceToken,
      )
    } else {
      runPreservedPerformance(
        {
          action: result.animation,
          deliveryId: result.deliveryId,
          performanceToken,
          performanceId: `interaction:${result.ruleId}`,
          expression: result.expression,
          dialogue: result.dialogue,
          spokenText: result.dialogue,
          voice: result.voice,
          ttsEmotion: result.ttsEmotion,
          ttsSeed: result.ttsSeed,
          ttsDurationScale: result.ttsDurationScale,
          speakDialogue: true,
          bodyPolicy: 'replace',
        },
        performanceToken,
      )
    }
    document.body.dataset.lastZone = area
    document.body.dataset.lastRule = result.ruleId
  } catch (error) {
    console.error('Pet interaction failed:', error)
    showBubble('……现在有点不对劲。')
  }
}

function applyRendererCommand(command: RendererCommand): void {
  if (!renderer) {
    return
  }
  const performanceToken = command.performanceToken ?? createPerformanceToken()
  const resolvedCommand: RendererCommand = { ...command, performanceToken }
  if (resolvedCommand.bodyPolicy === 'overlay' && resolvedCommand.microMotion) {
    runMicroMotion(resolvedCommand, performanceToken)
    return
  }
  runFullPerformance(resolvedCommand, performanceToken)
}

function runFullPerformance(command: RendererCommand, performanceToken: string): void {
  if (!renderer) {
    return
  }
  const activityClass = command.activityClass ?? 'interactive'
  const wasLowPower = reducedMotionQuery.matches || currentRenderPowerMode === 'low-power'
  if (activePerformanceToken && activePerformanceToken !== performanceToken) {
    interruptActivePerformance('new-action')
  }
  if (activityClass !== 'ambient') {
    markRendererActivity()
  }
  const action = normalizeRendererAction(command.action)
  const generation = ++performanceGeneration
  activePerformanceToken = performanceToken
  const isDragHold = normalizeRendererAction(command.action) === 'drag_start'
  activeActionLoop = isDragHold
  dragLoopLocked = isDragHold
  recoveryScheduledForToken = null
  clearPerformanceTimers()
  setPerformanceState('preparing')
  reportPerformance({
    performanceToken,
    type: 'action_prepared',
  })
  document.body.dataset.performanceToken = performanceToken
  document.body.dataset.actionPreparedAt = String(Math.round(performance.now()))
  if (command.expression !== undefined) {
    renderer.setExpression(normalizeRendererExpression(command.expression))
  }
  if (command.facing) {
    renderer.setFacing(command.facing)
  }
  if (command.dialogue) {
    showBubble(command.dialogue)
  }
  const hasSpeech =
    Boolean(command.voice) ||
    Boolean(command.dialogue?.trim()) ||
    Boolean(command.spokenText?.trim())
  const willPlayVoice = command.speakDialogue !== false && hasSpeech
  if (command.performanceId) {
    document.body.dataset.lastPerformanceId = command.performanceId
  }
  document.body.dataset.lastAutonomousAction = action
  const prepareDelay = wasLowPower ? 0 : ACTION_PREPARE_MS
  document.body.dataset.performancePrepDelayMs = String(prepareDelay)
  actionPrepareTimer = window.setTimeout(() => {
    actionPrepareTimer = 0
    if (
      generation !== performanceGeneration ||
      activePerformanceToken !== performanceToken ||
      !renderer
    ) {
      return
    }
    const repeatedIdleClip =
      command.idlePerformance &&
      Boolean(
        command.modelClip &&
        lastIdleClip?.clip === command.modelClip &&
        performance.now() - lastIdleClip.at < IDLE_CLIP_REPEAT_MS,
      )
    if (command.idlePerformance && command.modelClip && !repeatedIdleClip) {
      lastIdleClip = { clip: command.modelClip, at: performance.now() }
    }
    document.body.dataset.idleClipSuppressed = repeatedIdleClip ? 'repeat' : ''
    let playback = null
    if (repeatedIdleClip) {
      renderer.setMicroMotion?.('gaze', MICRO_MOTION_DURATION_MS)
      document.body.dataset.actionPlaybackMode = 'micro-repeat-guard'
    } else {
      playback =
        command.modelClip && renderer.playClip
          ? renderer.playClip(command.modelClip)
          : renderer.playAction(action)
      if (command.modelClip) {
        document.body.dataset.lastAutonomousClip = command.modelClip
      }
      document.body.dataset.actionPlaybackMode = command.modelClip ? 'clip' : 'action'
    }
    const metadata = playback && typeof playback === 'object' ? playback : null
    activeActionLoop = metadata?.loop ?? false
    document.body.dataset.actionStartedAt = String(Math.round(performance.now()))
    document.body.dataset.actionDurationMs = String(metadata ? Math.round(metadata.durationMs) : 0)
    document.body.dataset.actionLoop = String(activeActionLoop)
    reportPerformance({
      performanceToken,
      type: 'action_started',
      ...(metadata ? { durationMs: Math.round(metadata.durationMs) } : {}),
    })
    setPerformanceState('performing')

    if (willPlayVoice) {
      void playVoice(
        command.voice,
        command.dialogue,
        command.spokenText,
        {
          emotion: command.ttsEmotion,
          caption: command.ttsCaption,
          seed: command.ttsSeed,
          durationScale: command.ttsDurationScale,
        },
        command.deliveryId,
      )
    }

    if (isDragHold) {
      document.body.dataset.dragLoopState = 'looping-until-release'
    } else if (metadata && !metadata.loop && metadata.durationMs > 0) {
      scheduleActionCompletion(performanceToken, generation, metadata.durationMs)
    } else if (metadata?.loop && !willPlayVoice) {
      scheduleActionCompletion(performanceToken, generation, LOOP_ACTION_WINDOW_MS)
    }
  }, prepareDelay)
}

function scheduleActionCompletion(
  performanceToken: string,
  generation: number,
  durationMs: number,
): void {
  const boundedDuration = Math.max(180, Math.min(120_000, durationMs))
  actionCompletionTimer = window.setTimeout(() => {
    actionCompletionTimer = 0
    if (generation !== performanceGeneration || activePerformanceToken !== performanceToken) {
      return
    }
    document.body.dataset.actionCompletedAt = String(Math.round(performance.now()))
    reportPerformance({
      performanceToken,
      type: 'action_completed',
      durationMs: Math.round(boundedDuration),
    })
    beginPerformanceRecovery(performanceToken, generation)
  }, boundedDuration)
}

function runPreservedPerformance(command: RendererCommand, performanceToken: string): void {
  if (!renderer) {
    return
  }
  const isDragHold =
    Boolean(interaction?.dragging) || normalizeRendererAction(command.action) === 'drag_start'
  if (activePerformanceToken && activePerformanceToken !== performanceToken) {
    interruptActivePerformance('new-action')
  }
  markRendererActivity()
  const generation = ++performanceGeneration
  activePerformanceToken = performanceToken
  activeActionLoop = isDragHold
  dragLoopLocked = isDragHold
  recoveryScheduledForToken = null
  clearPerformanceTimers()
  setPerformanceState('performing')
  renderer.setExpression(normalizeRendererExpression(command.expression ?? 'neutral'))
  if (command.dialogue) {
    showBubble(command.dialogue)
  }
  const durationMs = isDragHold ? 0 : 1_800
  document.body.dataset.performanceToken = performanceToken
  document.body.dataset.actionStartedAt = String(Math.round(performance.now()))
  document.body.dataset.actionDurationMs = String(durationMs)
  document.body.dataset.actionLoop = String(isDragHold)
  document.body.dataset.actionPlaybackMode = 'preserved-immediate'
  reportPerformance({
    performanceToken,
    type: 'action_started',
    durationMs,
  })
  void playVoice(
    command.voice,
    command.dialogue,
    command.spokenText,
    {
      emotion: command.ttsEmotion,
      caption: command.ttsCaption,
      seed: command.ttsSeed,
      durationScale: command.ttsDurationScale,
    },
    command.deliveryId,
  )
  if (command.performanceId) {
    document.body.dataset.lastPerformanceId = command.performanceId
  }
  if (isDragHold) {
    document.body.dataset.dragLoopState = 'looping-until-release'
    return
  }
  actionCompletionTimer = window.setTimeout(() => {
    actionCompletionTimer = 0
    if (generation !== performanceGeneration || activePerformanceToken !== performanceToken) {
      return
    }
    document.body.dataset.actionCompletedAt = String(Math.round(performance.now()))
    reportPerformance({
      performanceToken,
      type: 'action_completed',
      durationMs,
    })
    beginPerformanceRecovery(performanceToken, generation)
  }, durationMs)
}

function runMicroMotion(command: RendererCommand, performanceToken: string): void {
  if (!renderer || !command.microMotion) {
    return
  }
  if ((command.activityClass ?? 'interactive') !== 'ambient') {
    markRendererActivity()
  }
  const ownsPerformanceState = !activePerformanceToken
  if (ownsPerformanceState) {
    activePerformanceToken = performanceToken
    setPerformanceState('performing')
  }
  activeMicroToken = performanceToken
  renderer.setMicroMotion?.(command.microMotion, MICRO_MOTION_DURATION_MS)
  if (command.expression !== undefined) {
    renderer.setExpression(normalizeRendererExpression(command.expression))
  }
  if (command.dialogue) {
    showBubble(command.dialogue)
  }
  document.body.dataset.lastPerformanceId =
    command.performanceId ?? `presence:micro:${command.microMotion}`
  document.body.dataset.lastAutonomousAction = command.action
  document.body.dataset.actionPlaybackMode = 'micro-overlay'
  document.body.dataset.microStartedAt = String(Math.round(performance.now()))
  reportPerformance({
    performanceToken,
    type: 'micro_started',
    durationMs: MICRO_MOTION_DURATION_MS,
  })
  window.setTimeout(() => {
    if (activeMicroToken !== performanceToken) {
      return
    }
    activeMicroToken = null
    document.body.dataset.microCompletedAt = String(Math.round(performance.now()))
    reportPerformance({
      performanceToken,
      type: 'micro_completed',
      durationMs: MICRO_MOTION_DURATION_MS,
    })
    if (ownsPerformanceState && activePerformanceToken === performanceToken) {
      beginPerformanceRecovery(performanceToken, performanceGeneration)
    }
  }, MICRO_MOTION_DURATION_MS)
}

function beginPerformanceRecovery(performanceToken: string, generation: number): void {
  if (
    dragLoopLocked ||
    activePerformanceToken !== performanceToken ||
    generation !== performanceGeneration ||
    recoveryScheduledForToken === performanceToken
  ) {
    return
  }
  recoveryScheduledForToken = performanceToken
  window.clearTimeout(recoveryTimer)
  recoveryTimer = window.setTimeout(() => {
    if (activePerformanceToken !== performanceToken || generation !== performanceGeneration) {
      return
    }
    setPerformanceState('recovering')
    document.body.dataset.recoveryStartedAt = String(Math.round(performance.now()))
    reportPerformance({
      performanceToken,
      type: 'recovery_started',
    })
    recoveryTimer = window.setTimeout(() => {
      recoveryTimer = 0
      if (activePerformanceToken !== performanceToken || generation !== performanceGeneration) {
        return
      }
      renderer?.setExpression('neutral')
      document.body.dataset.recoveryCompletedAt = String(Math.round(performance.now()))
      reportPerformance({
        performanceToken,
        type: 'recovery_completed',
      })
      activePerformanceToken = null
      activeActionLoop = false
      recoveryScheduledForToken = null
      setPerformanceState('idle')
    }, RECOVERY_DURATION_MS)
  }, RECOVERY_DELAY_MS)
}

function interruptActivePerformance(
  reason: NonNullable<PerformanceLifecycleEvent['reason']>,
  options: { keepVoice?: boolean } = {},
): void {
  const performanceToken = activePerformanceToken
  const microToken = activeMicroToken
  const wasLoopingDrag = activeActionLoop
  if (!performanceToken && !microToken) {
    if (!options.keepVoice) {
      stopVoicePlayback(voiceInterruptReason(reason))
    }
    return
  }
  performanceGeneration += 1
  clearPerformanceTimers()
  if (performanceToken) {
    reportPerformance({
      performanceToken,
      type: 'action_interrupted',
      reason,
    })
  }
  if (microToken && microToken !== performanceToken) {
    reportPerformance({
      performanceToken: microToken,
      type: 'action_interrupted',
      reason,
    })
  }
  activePerformanceToken = null
  activeMicroToken = null
  activeActionLoop = false
  const wasDragLoopLocked = dragLoopLocked
  dragLoopLocked = false
  if (wasLoopingDrag || wasDragLoopLocked) {
    document.body.dataset.dragLoopState = 'released'
  }
  recoveryScheduledForToken = null
  document.body.dataset.performanceInterruptedReason = reason
  document.body.dataset.performanceInterruptedAt = String(Math.round(performance.now()))
  if (reason === 'user') {
    document.body.dataset.lastUserPerformanceInterruptedReason = 'user'
  }
  setPerformanceState('idle')
  if (!options.keepVoice) {
    stopVoicePlayback(voiceInterruptReason(reason))
  }
}

function voiceInterruptReason(
  reason: NonNullable<PerformanceLifecycleEvent['reason']>,
): NonNullable<DeliveryLifecycleEvent['reason']> {
  if (reason === 'user') {
    return 'user'
  }
  if (reason === 'power') {
    return 'power'
  }
  if (reason === 'new-action') {
    return 'new-speech'
  }
  return 'stop'
}

function clearPerformanceTimers(): void {
  window.clearTimeout(actionPrepareTimer)
  window.clearTimeout(actionCompletionTimer)
  window.clearTimeout(recoveryTimer)
  actionPrepareTimer = 0
  actionCompletionTimer = 0
  recoveryTimer = 0
}

function setPerformanceState(next: PerformanceState): void {
  const previous = performanceState
  performanceState = next
  document.body.dataset.performanceState = next
  document.body.dataset.previousPerformanceState = previous
}

function reportPerformance(event: PerformanceLifecycleEvent): void {
  document.body.dataset.lastPerformanceLifecycle = event.type
  window.deskpet.reportPerformanceEvent(event)
}

let voiceEqContext: AudioContext | null = null
let voiceEqChain: { input: AudioNode } | null = null

/**
 * 给语音加一点存在感：模型输出高频偏暗，听起来发闷。
 * 统一走 70Hz 高通 + 3kHz 高频搁架，让声音更贴耳。
 */
/** 官方片段已离线提升到约 -14.9dBFS，合成约 -13.2dBFS，播放增益用于消除剩余差异。 */
const TTS_PLAYBACK_GAIN = 0.52
const OFFICIAL_PLAYBACK_GAIN = 0.72

function attachVoicePresence(audio: HTMLAudioElement): void {
  try {
    if (!voiceEqContext) {
      voiceEqContext = new AudioContext()
      const highpass = voiceEqContext.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = 70
      highpass.Q.value = 0.707
      const shelf = voiceEqContext.createBiquadFilter()
      shelf.type = 'highshelf'
      shelf.frequency.value = 3000
      shelf.gain.value = 3.5
      highpass.connect(shelf)
      shelf.connect(voiceEqContext.destination)
      voiceEqChain = { input: highpass }
    }
    void voiceEqContext.resume().catch(() => undefined)
    const source = voiceEqContext.createMediaElementSource(audio)
    source.connect(voiceEqChain!.input)
    document.body.dataset.voiceEq = 'on'
  } catch (error) {
    console.warn('Voice EQ unavailable, playing raw audio:', error)
    document.body.dataset.voiceEq = 'off'
  }
}

function createPerformanceToken(): string {
  return crypto.randomUUID()
}

function stopStreamedVoice(): void {
  streamedUnsubscribeChunk?.()
  streamedUnsubscribeEnd?.()
  streamedUnsubscribeChunk = null
  streamedUnsubscribeEnd = null
  for (const source of streamedVoiceSources) {
    try {
      source.stop()
    } catch {
      // 已停止的音源忽略
    }
  }
  streamedVoiceSources = []
  if (streamedVoiceContext) {
    void streamedVoiceContext.close().catch(() => undefined)
    streamedVoiceContext = null
  }
  if (streamedVoiceId) {
    window.deskpet.cancelSpeechStream(streamedVoiceId)
    streamedVoiceId = null
  }
  streamedNextTime = 0
}

/**
 * 服务端 SSE 流式播放：第一块音频到达即开始，后续块按时间轴依次排程。
 * 任一步失败都返回 false，交由调用方回退到整句合成。
 */
async function tryStreamedSpeech(
  text: string,
  options: LocalSpeechOptions | undefined,
  generation: number,
): Promise<boolean> {
  if (
    ttsEngine !== 'irodori' ||
    !localTtsEnabled ||
    !text.trim() ||
    typeof window.deskpet.startSpeechStream !== 'function'
  ) {
    return false
  }
  try {
    stopStreamedVoice()
    const id = crypto.randomUUID()
    streamedVoiceId = id
    let resolveStarted: (value: boolean) => void = () => undefined
    const started = new Promise<boolean>((resolve) => {
      resolveStarted = resolve
    })
    let ended = false
    let scheduled = 0
    let completed = 0
    const startedAt = performance.now()

    streamedUnsubscribeChunk = window.deskpet.onSpeechChunk((payload) => {
      if (payload.streamId !== id || generation !== voiceGeneration) {
        return
      }
      const context = (streamedVoiceContext ??= new AudioContext())
      void context
        .decodeAudioData(payload.audio.slice().buffer)
        .then((buffer) => {
          if (payload.streamId !== streamedVoiceId || generation !== voiceGeneration) {
            return
          }
          const source = context.createBufferSource()
          source.buffer = buffer
          source.connect(context.destination)
          const startAt = Math.max(context.currentTime + 0.04, streamedNextTime)
          source.start(startAt)
          streamedNextTime = startAt + buffer.duration
          streamedVoiceSources.push(source)
          scheduled += 1
          source.onended = () => {
            completed += 1
            if (ended && completed >= scheduled && generation === voiceGeneration) {
              document.body.dataset.voiceStatus = 'ended'
              document.body.dataset.voiceQueueOutcome = 'completed'
              completeVoiceDelivery(activeDeliveryId ?? undefined)
            }
          }
          if (scheduled === 1) {
            document.body.dataset.voiceStatus = 'playing'
            document.body.dataset.voiceQueueOutcome = 'playing'
            document.body.dataset.lastVoiceClip = 'local-tts-stream'
            document.body.dataset.lastVoiceSource = 'irodori-tts'
            document.body.dataset.ttsFirstChunkMs = String(
              Math.round(performance.now() - startedAt),
            )
            resolveStarted(true)
          }
        })
        .catch((error: unknown) => {
          console.warn('Streamed audio decode failed:', error)
        })
    })

    streamedUnsubscribeEnd = window.deskpet.onSpeechStreamEnd((payload) => {
      if (payload.streamId !== id) {
        return
      }
      ended = true
      if (scheduled === 0) {
        resolveStarted(false)
      }
    })

    window.deskpet.startSpeechStream(id, text, options)
    const ok = await Promise.race([
      started,
      new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 6_000)),
    ])
    if (!ok) {
      stopStreamedVoice()
      return false
    }
    return true
  } catch (error) {
    console.warn('Streamed speech failed, falling back:', error)
    stopStreamedVoice()
    return false
  }
}

async function playVoice(
  assetPath: string | undefined,
  fallbackText?: string,
  synthesisText = fallbackText,
  options?: LocalSpeechOptions,
  deliveryId?: string,
): Promise<void> {
  document.body.dataset.voiceDurationScale =
    options?.durationScale === undefined ? '' : String(options.durationScale)
  const useTts = !assetPath && localTtsEnabled && Boolean(synthesisText?.trim())
  if (systemPowerState.suspended || systemPowerState.screenLocked || document.hidden) {
    if (deliveryId) {
      beginVoiceDelivery(deliveryId)
      interruptVoiceDelivery(deliveryId, 'power')
    }
    return
  }
  if (!assetPath && !useTts) {
    if (deliveryId) {
      beginVoiceDelivery(deliveryId)
      completeVoiceDelivery(deliveryId)
    }
    return
  }
  beginVoiceDelivery(deliveryId)
  const generation = ++voiceGeneration
  releaseVoiceAudio()
  resetVoicePlaybackDiagnostics()

  if (!assetPath && useTts) {
    const streamed = await tryStreamedSpeech(synthesisText ?? '', options, generation)
    if (streamed) {
      return
    }
  }

  try {
    // Aivis 按整句合成更连贯；分句合成会在句号处各起一次音，听起来断开。
    // 设置尚未同步时按 Aivis 处理：宁可整句合成，也不要拆句造成断句。
    const chunkingEnabled = settingsReady && ttsEngine === 'irodori'
    if (!assetPath && useTts && chunkingEnabled && shouldChunkSpeech(synthesisText ?? '')) {
      const chunks = splitSpeechText(synthesisText ?? '')
      if (chunks.length > 1) {
        await playSynthesizedSpeechChunks(chunks, fallbackText, options, generation, deliveryId)
        return
      }
    }

    let url: string
    let source: 'official' | LocalSpeechSource
    let seed: number | undefined
    let seedVariant: number | undefined
    if (assetPath) {
      source = 'official'
      const cachedUrl = voiceUrlCache.get(assetPath)
      if (cachedUrl) {
        url = cachedUrl
      } else {
        const asset = await window.deskpet.loadCharacterAsset(assetPath)
        if (generation !== voiceGeneration) {
          return
        }
        const buffer = asset.buffer.slice(
          asset.byteOffset,
          asset.byteOffset + asset.byteLength,
        ) as ArrayBuffer
        url = URL.createObjectURL(new Blob([buffer], { type: 'audio/ogg' }))
        voiceUrlCache.set(assetPath, url)
      }
    } else {
      document.body.dataset.voiceStatus = 'synthesizing'
      const result = await window.deskpet.synthesizeLocalSpeech(synthesisText ?? '', options)
      if (generation !== voiceGeneration) {
        return
      }
      if (!result) {
        document.body.dataset.voiceStatus = 'idle'
        interruptVoiceDelivery(deliveryId, 'error')
        return
      }
      source = result.source
      seed = result.seed
      seedVariant = result.seedVariant
      const buffer = result.audio.buffer.slice(
        result.audio.byteOffset,
        result.audio.byteOffset + result.audio.byteLength,
      ) as ArrayBuffer
      url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
      activeLocalVoiceUrl = url
    }
    if (generation !== voiceGeneration) {
      releaseVoiceAudio()
      return
    }
    const audio = new Audio(url)
    audio.volume = OFFICIAL_PLAYBACK_GAIN
    audio.addEventListener(
      'loadedmetadata',
      () => {
        if (generation === voiceGeneration && fallbackText && Number.isFinite(audio.duration)) {
          extendBubbleForAudio(fallbackText, audio.duration * 1_000)
        }
      },
      { once: true },
    )
    audio.addEventListener(
      'ended',
      () => {
        if (generation === voiceGeneration && activeVoice === audio) {
          document.body.dataset.voiceChunksCompleted = '1'
          document.body.dataset.voiceQueueCompleted = 'true'
          document.body.dataset.voiceQueueOutcome = 'completed'
          document.body.dataset.voiceStatus = 'ended'
          completeVoiceDelivery(deliveryId)
          releaseVoiceAudio('ended')
        }
      },
      { once: true },
    )
    activeVoice = audio
    await audio.play()
    if (generation !== voiceGeneration || activeVoice !== audio) {
      return
    }
    const filename = assetPath ? (assetPath.split('/').at(-1) ?? assetPath) : 'local-tts'
    document.body.dataset.lastVoiceClip = filename.replace(/\.(?:ogg|wav)$/i, '')
    document.body.dataset.lastVoiceSource = source
    document.body.dataset.lastLocalTtsSource = assetPath ? '' : source
    document.body.dataset.lastLocalTtsSeed = seed === undefined ? '' : String(seed)
    document.body.dataset.lastLocalTtsSeedVariant =
      seedVariant === undefined ? '' : String(seedVariant)
    document.body.dataset.voiceChunksStarted = '1'
    document.body.dataset.voiceStatus = 'playing'
  } catch (error) {
    releaseVoiceAudio()
    document.body.dataset.voiceStatus = 'error'
    document.body.dataset.voiceQueueCompleted = 'false'
    document.body.dataset.voiceQueueOutcome = 'error'
    interruptVoiceDelivery(deliveryId, 'error')
    console.error('Voice playback failed:', error)
  }
}

async function playSynthesizedSpeechChunks(
  chunks: string[],
  fallbackText: string | undefined,
  options: LocalSpeechOptions | undefined,
  generation: number,
  deliveryId: string | undefined,
): Promise<void> {
  const startedAt = performance.now()
  resetVoicePlaybackDiagnostics(chunks.length)
  document.body.dataset.ttsStreamChunks = String(chunks.length)
  document.body.dataset.voiceStatus = 'synthesizing'
  let nextSynthesis = window.deskpet.synthesizeLocalSpeech(chunks[0] ?? '', options)
  let completedChunks = 0

  for (let index = 0; index < chunks.length; index += 1) {
    const result = await nextSynthesis
    if (generation !== voiceGeneration) {
      return
    }
    if (!result) {
      document.body.dataset.voiceStatus = 'idle'
      return
    }
    if (index + 1 < chunks.length) {
      nextSynthesis = window.deskpet.synthesizeLocalSpeech(chunks[index + 1] ?? '', options)
    }
    if (index === 0) {
      document.body.dataset.lastVoiceClip = 'local-tts'
      document.body.dataset.lastVoiceSource = result.source
      document.body.dataset.lastLocalTtsSource = result.source
      document.body.dataset.lastLocalTtsSeed = result.seed === undefined ? '' : String(result.seed)
      document.body.dataset.lastLocalTtsSeedVariant =
        result.seedVariant === undefined ? '' : String(result.seedVariant)
    }
    const outcome = await playSynthesizedAudio(result, fallbackText, generation, () => {
      document.body.dataset.voiceChunksStarted = String(index + 1)
      if (index === 0) {
        document.body.dataset.ttsFirstChunkMs = String(Math.round(performance.now() - startedAt))
      }
    })
    if (generation !== voiceGeneration) {
      return
    }
    if (outcome === 'interrupted') {
      document.body.dataset.voiceStatus = 'interrupted'
      document.body.dataset.voiceQueueOutcome = 'interrupted'
      interruptVoiceDelivery(deliveryId, 'stop')
      return
    }
    completedChunks += 1
    document.body.dataset.voiceChunksCompleted = String(completedChunks)
    if (index + 1 < chunks.length) {
      document.body.dataset.voiceStatus = 'synthesizing'
    }
  }
  document.body.dataset.voiceQueueCompleted = 'true'
  document.body.dataset.voiceQueueOutcome = 'completed'
  document.body.dataset.voiceStatus = 'ended'
  completeVoiceDelivery(deliveryId)
}

function playSynthesizedAudio(
  result: LocalSpeechResult,
  fallbackText: string | undefined,
  generation: number,
  onStarted: () => void,
): Promise<SynthesizedPlaybackOutcome> {
  return new Promise<SynthesizedPlaybackOutcome>((resolve, reject) => {
    let settled = false
    const buffer = result.audio.buffer.slice(
      result.audio.byteOffset,
      result.audio.byteOffset + result.audio.byteLength,
    ) as ArrayBuffer
    const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
    const audio = new Audio(url)
    audio.volume = TTS_PLAYBACK_GAIN
    attachVoicePresence(audio)
    activeVoice = audio
    activeLocalVoiceUrl = url

    const complete = (outcome: SynthesizedPlaybackOutcome): void => {
      if (settled) {
        return
      }
      settled = true
      resolveActiveVoicePlayback = null
      resolve(outcome)
    }
    const fail = (error: unknown): void => {
      if (settled) {
        return
      }
      settled = true
      resolveActiveVoicePlayback = null
      if (activeVoice === audio) {
        clearActiveVoiceAudio()
      }
      reject(error)
    }
    resolveActiveVoicePlayback = complete

    audio.addEventListener(
      'loadedmetadata',
      () => {
        if (generation === voiceGeneration && fallbackText && Number.isFinite(audio.duration)) {
          extendBubbleForAudio(fallbackText, audio.duration * 1_000)
        }
      },
      { once: true },
    )
    audio.addEventListener(
      'ended',
      () => {
        if (generation === voiceGeneration && activeVoice === audio) {
          releaseVoiceAudio('ended')
        }
      },
      { once: true },
    )
    audio.addEventListener(
      'error',
      () => {
        fail(new Error('Streamed voice chunk playback failed.'))
      },
      { once: true },
    )
    void audio
      .play()
      .then(() => {
        if (generation !== voiceGeneration) {
          releaseVoiceAudio()
          return
        }
        document.body.dataset.voiceStatus = 'playing'
        document.body.dataset.voiceQueueOutcome = 'playing'
        onStarted()
      })
      .catch((error: unknown) => {
        fail(error)
      })
  })
}

function releaseVoiceAudio(outcome: SynthesizedPlaybackOutcome = 'interrupted'): void {
  const resolvePlayback = resolveActiveVoicePlayback
  resolveActiveVoicePlayback = null
  resolvePlayback?.(outcome)
  clearActiveVoiceAudio()
}

function clearActiveVoiceAudio(): void {
  activeVoice?.pause()
  activeVoice = null
  if (activeLocalVoiceUrl) {
    URL.revokeObjectURL(activeLocalVoiceUrl)
    activeLocalVoiceUrl = null
  }
}

function stopVoicePlayback(reason: NonNullable<DeliveryLifecycleEvent['reason']> = 'stop'): void {
  if (activeDeliveryId) {
    voiceInterruptedCount += 1
    document.body.dataset.voiceInterruptedCount = String(voiceInterruptedCount)
    document.body.dataset.lastVoiceInterruptedReason = reason
  }
  stopStreamedVoice()
  interruptVoiceDelivery(activeDeliveryId ?? undefined, reason)
  voiceGeneration += 1
  releaseVoiceAudio()
  document.body.dataset.voiceStatus = 'idle'
  document.body.dataset.voiceQueueCompleted = 'false'
  document.body.dataset.voiceQueueOutcome = 'cancelled'
}

function resetVoicePlaybackDiagnostics(totalChunks = 1): void {
  document.body.dataset.voiceChunksTotal = String(totalChunks)
  document.body.dataset.voiceChunksStarted = '0'
  document.body.dataset.voiceChunksCompleted = '0'
  document.body.dataset.voiceQueueCompleted = 'false'
  document.body.dataset.voiceQueueOutcome = 'pending'
}

function beginVoiceDelivery(deliveryId: string | undefined): void {
  if (activeDeliveryId && activeDeliveryId !== deliveryId) {
    reportDelivery({
      deliveryId: activeDeliveryId,
      type: 'speech_interrupted',
      reason: 'new-speech',
    })
    activeDeliveryId = null
  }
  if (!deliveryId || activeDeliveryId === deliveryId) {
    return
  }
  activeDeliveryId = deliveryId
  reportDelivery({
    deliveryId,
    type: 'speech_started',
  })
}

function completeVoiceDelivery(deliveryId: string | undefined): void {
  flushVoiceDelivery(deliveryId, 'speech_completed')
  if (activePerformanceToken && activeActionLoop && !dragLoopLocked) {
    beginPerformanceRecovery(activePerformanceToken, performanceGeneration)
  }
}

function interruptVoiceDelivery(
  deliveryId: string | undefined,
  reason: NonNullable<DeliveryLifecycleEvent['reason']>,
): void {
  flushVoiceDelivery(deliveryId, 'speech_interrupted', reason)
}

function flushVoiceDelivery(
  deliveryId: string | undefined,
  type: DeliveryLifecycleEvent['type'],
  reason?: DeliveryLifecycleEvent['reason'],
): void {
  if (!deliveryId || activeDeliveryId !== deliveryId) {
    return
  }
  activeDeliveryId = null
  reportDelivery({
    deliveryId,
    type,
    ...(reason ? { reason } : {}),
  })
}

function reportDelivery(event: DeliveryLifecycleEvent): void {
  window.deskpet.reportDeliveryEvent(event)
}

function showBubble(text: string, duration = calculateBubbleDisplayDurationMs(text)): void {
  window.clearTimeout(bubbleTimer)
  activeBubbleText = text
  bubbleVisibleUntil = performance.now() + duration
  bubble.textContent = text
  bubble.dataset.readingDurationMs = String(Math.round(duration))
  bubble.dataset.visible = 'true'
  scheduleBubbleHide(duration)
}

function extendBubbleForAudio(text: string, audioDurationMs: number): void {
  if (activeBubbleText !== text || bubble.dataset.visible !== 'true') {
    return
  }
  const target = performance.now() + audioDurationMs + 650
  if (target <= bubbleVisibleUntil) {
    return
  }
  bubbleVisibleUntil = target
  window.clearTimeout(bubbleTimer)
  scheduleBubbleHide(bubbleVisibleUntil - performance.now())
}

function scheduleBubbleHide(delay: number): void {
  window.clearTimeout(bubbleTimer)
  bubbleTimer = window.setTimeout(
    () => {
      bubble.dataset.visible = 'false'
      activeBubbleText = ''
      bubbleVisibleUntil = 0
    },
    Math.max(0, delay),
  )
}

function toCanvasPoint(event: MouseEvent | PointerEvent): Point2D {
  if (!canvas) {
    return { x: 0, y: 0 }
  }
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * 340,
    y: ((event.clientY - rect.top) / rect.height) * 460,
  }
}

function findRendererAsset(snapshot: SettingsSnapshot, mode: '2d' | '3d'): string | undefined {
  return snapshot.character.renderers.find(
    (renderer) => renderer.mode === mode && renderer.status === 'available',
  )?.assetPath
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Required element is missing: ${selector}`)
  }
  return element
}

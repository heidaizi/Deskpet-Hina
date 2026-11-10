import { MODEL_SCALE_MAX, MODEL_SCALE_MIN } from '../../shared/model-animations'
import type {
  AppSettings,
  DeliveryLifecycleEvent,
  HitArea,
  LocalSpeechOptions,
  PerformanceLifecycleEvent,
  PetInteraction,
  Point2D,
} from '../../shared/types'
import { state } from '../app-state'

export function isPetSender(sender: Electron.WebContents): boolean {
  return Boolean(
    state.petWindow && !state.petWindow.isDestroyed() && sender === state.petWindow.webContents,
  )
}

export function isSettingsSender(sender: Electron.WebContents): boolean {
  return Boolean(
    state.settingsWindow &&
    !state.settingsWindow.isDestroyed() &&
    sender === state.settingsWindow.webContents,
  )
}

export function isChatSender(sender: Electron.WebContents): boolean {
  return Boolean(
    state.chatWindow && !state.chatWindow.isDestroyed() && sender === state.chatWindow.webContents,
  )
}

export function isDeskpetSender(sender: Electron.WebContents): boolean {
  return isPetSender(sender) || isSettingsSender(sender)
}

export function isPetInteraction(value: unknown): value is PetInteraction {
  if (!value || typeof value !== 'object') {
    return false
  }
  const interaction = value as Partial<PetInteraction>
  return (
    ['tap', 'hold', 'drag', 'double_tap'].includes(interaction.kind ?? '') &&
    typeof interaction.area === 'string' &&
    interaction.area.length > 0
  )
}

export function isDeliveryLifecycleEvent(value: unknown): value is DeliveryLifecycleEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const event = value as Partial<DeliveryLifecycleEvent>
  return (
    typeof event.deliveryId === 'string' &&
    event.deliveryId.length > 0 &&
    event.deliveryId.length <= 128 &&
    ['speech_started', 'speech_completed', 'speech_interrupted'].includes(event.type ?? '') &&
    (event.reason === undefined ||
      ['user', 'new-speech', 'power', 'stop', 'error'].includes(event.reason))
  )
}

export function isPerformanceLifecycleEvent(value: unknown): value is PerformanceLifecycleEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const event = value as Partial<PerformanceLifecycleEvent>
  return (
    typeof event.performanceToken === 'string' &&
    event.performanceToken.length > 0 &&
    event.performanceToken.length <= 128 &&
    [
      'action_prepared',
      'action_started',
      'action_completed',
      'action_interrupted',
      'micro_started',
      'micro_completed',
      'recovery_started',
      'recovery_completed',
    ].includes(event.type ?? '') &&
    (event.reason === undefined ||
      ['user', 'new-action', 'power', 'stop', 'error'].includes(event.reason)) &&
    (event.durationMs === undefined ||
      (typeof event.durationMs === 'number' &&
        Number.isFinite(event.durationMs) &&
        event.durationMs >= 0 &&
        event.durationMs <= 600_000))
  )
}

export function isSettingsPatch(
  value: unknown,
): value is Partial<
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
> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const patch = value as Record<string, unknown>
  return Object.entries(patch).every(([key, field]) => {
    if (key === 'rendererMode') {
      return field === '2d' || field === '3d'
    }
    if (key === 'modelScale') {
      return typeof field === 'number' && field >= MODEL_SCALE_MIN && field <= MODEL_SCALE_MAX
    }
    if (key === 'presenceIntensity') {
      return field === 'quiet' || field === 'balanced' || field === 'lively'
    }
    if (key === 'ttsEngine') {
      return field === 'irodori' || field === 'aivis'
    }
    if (key === 'ttsQuality') {
      return field === 'quality' || field === 'balanced' || field === 'speed'
    }
    if (key === 'intelligenceLevel') {
      return field === 'off' || field === 'basic' || field === 'adaptive'
    }
    return (
      [
        'alwaysOnTop',
        'interactionsPaused',
        'randomVoiceEnabled',
        'localTtsEnabled',
        'presenceMemoryEnabled',
        'presenceEmotionEnabled',
        'presenceAutonomyEnabled',
        'aiEnabled',
        'aiProactiveEnabled',
        'aiWindowTitleEnabled',
        'aiSelectedTextEnabled',
        'conversationMemoryEnabled',
      ].includes(key) && typeof field === 'boolean'
    )
  })
}

export function isLocalSpeechOptions(value: unknown): value is LocalSpeechOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const options = value as Record<string, unknown>
  return Object.entries(options).every(([key, field]) => {
    if (field === undefined) {
      return true
    }
    if (key === 'emotion' || key === 'caption') {
      return typeof field === 'string'
    }
    return (
      (key === 'seed' || key === 'durationScale') &&
      typeof field === 'number' &&
      Number.isFinite(field)
    )
  })
}

export function isPoint(value: unknown): value is Point2D {
  if (!value || typeof value !== 'object') {
    return false
  }
  const point = value as Partial<Point2D>
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

export function isValidPoint(point: Point2D): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

export function isHitArea(value: unknown): value is HitArea {
  if (!value || typeof value !== 'object') {
    return false
  }
  const area = value as Partial<HitArea>
  if (typeof area.id !== 'string') {
    return false
  }

  if (area.type === 'circle') {
    return (
      Number.isFinite(area.x) &&
      Number.isFinite(area.y) &&
      Number.isFinite(area.radius) &&
      area.radius! > 0
    )
  }

  if (area.type === 'rect') {
    return (
      Number.isFinite(area.x) &&
      Number.isFinite(area.y) &&
      Number.isFinite(area.width) &&
      Number.isFinite(area.height) &&
      area.width! > 0 &&
      area.height! > 0
    )
  }

  return false
}

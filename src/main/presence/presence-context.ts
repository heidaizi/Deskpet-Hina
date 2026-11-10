import type {
  EmotionState,
  PresenceContextV1,
  PresenceRuntimeState,
  RelationshipProfile,
  SpeechState,
} from '../../shared/presence'
import type { PerformanceState } from '../../shared/types'
import type { TimeSceneContext } from '../../shared/time-scene'

export interface PresencePetSnapshot {
  energy: number
  mood: number
  affectionLevel: number
}

export function createPresenceContext(
  scene: TimeSceneContext,
  pet: PresencePetSnapshot,
  runtime: Omit<PresenceRuntimeState, 'speechState' | 'performanceState'>,
  speechState: SpeechState,
  performanceState: PerformanceState,
  emotion?: EmotionState,
  relationship?: RelationshipProfile,
): PresenceContextV1 {
  return {
    now: scene.sampledAt,
    scene,
    pet: {
      mood: pet.mood,
      energy: pet.energy,
      affectionLevel: pet.affectionLevel,
    },
    runtime: {
      visible: runtime.visible,
      dragging: runtime.dragging,
      clickThrough: runtime.clickThrough,
      interactionsPaused: runtime.interactionsPaused,
      randomVoiceEnabled: runtime.randomVoiceEnabled,
      autonomyEnabled: runtime.autonomyEnabled,
      intensity: runtime.intensity,
      speechState,
      performanceState,
      lastInteractionAt: runtime.lastInteractionAt,
    },
    ...(emotion ? { emotion } : {}),
    ...(relationship ? { relationship } : {}),
  }
}

export function isExternalScene(scene: TimeSceneContext['scene']): boolean {
  return scene !== 'system' && scene !== 'unknown'
}

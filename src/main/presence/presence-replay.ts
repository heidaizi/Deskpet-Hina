import { performance } from 'node:perf_hooks'
import type { PresenceIntensity, PresenceTelemetrySnapshot } from '../../shared/types'
import { createTimeSceneContext } from '../../shared/time-scene'
import { PresenceController, type PresenceDelivery } from './presence-controller'

export interface PresenceReplaySegment {
  durationHours: number
  app: string
  idleSeconds?: number
}

export interface PresenceSleepWindow {
  startHour: number
  durationMinutes: number
}

export interface PresenceReplayScenario {
  name: string
  durationHours: number
  sampleIntervalSeconds: number
  intensity: PresenceIntensity
  seed: number
  interactionEveryMinutes: number
  interruptEveryNthDelivery?: number
  segments: PresenceReplaySegment[]
  sleepWindows?: PresenceSleepWindow[]
}

export interface PresenceReplayReport {
  name: string
  durationHours: number
  wallTimeMs: number
  samples: number
  deliveries: number
  deliveriesPerHour: number
  speechesPerHour: number
  peakSpeechesPerHour: number
  silentRate: number
  duplicateDialogueRate: number
  interruptions: number
  interruptionRate: number
  uniqueRules: number
  maxMemoryCount: number
  heapDeltaBytes: number
  telemetry: PresenceTelemetrySnapshot
  passed: {
    memoryBudget: boolean
    speechBudget: boolean
    deliveryBudget: boolean
    repeatBudget: boolean
  }
}

export function runPresenceReplayScenario(scenario: PresenceReplayScenario): PresenceReplayReport {
  const startedAt = Date.now()
  const wallStartedAt = performance.now()
  const heapStartedAt = process.memoryUsage().heapUsed
  const random = seededRandom(scenario.seed)
  let lastInteractionAt = startedAt
  let deliveryCount = 0
  let maxMemoryCount = 0
  const deliveries: PresenceDelivery[] = []
  let currentNow = startedAt
  let currentEnergy = 72
  let currentMood = 64

  const controller = new PresenceController({
    mode: 'active',
    memoryEnabled: true,
    emotionEnabled: true,
    now: () => currentNow,
    random,
    interactionGraceMs: 30_000,
    getRuntime: () => ({
      visible: true,
      dragging: false,
      clickThrough: false,
      interactionsPaused: false,
      randomVoiceEnabled: true,
      autonomyEnabled: true,
      intensity: scenario.intensity,
      energy: currentEnergy,
      mood: currentMood,
      affectionLevel: 4,
      lastInteractionAt,
    }),
    deliver: (delivery) => {
      deliveries.push(delivery)
      deliveryCount += 1
    },
  })

  const sampleIntervalMs = scenario.sampleIntervalSeconds * 1_000
  const totalSamples = Math.ceil((scenario.durationHours * 3_600_000) / sampleIntervalMs)
  let nextInteractionAt = startedAt + scenario.interactionEveryMinutes * 60_000
  let completedDeliveries = 0

  for (let index = 0; index < totalSamples; index += 1) {
    currentNow = startedAt + index * sampleIntervalMs
    const elapsedHours = (currentNow - startedAt) / 3_600_000
    const sleepWindow = scenario.sleepWindows?.find(
      (window) =>
        elapsedHours >= window.startHour &&
        elapsedHours < window.startHour + window.durationMinutes / 60,
    )
    const segment = resolveSegment(scenario.segments, elapsedHours)
    currentEnergy = clamp(52 + Math.sin(elapsedHours * 0.8) * 22, 15, 92)
    currentMood = clamp(58 + Math.sin(elapsedHours * 0.37 + 0.7) * 18, 20, 90)

    if (currentNow >= nextInteractionAt && !sleepWindow) {
      lastInteractionAt = currentNow
      controller.notifyInteraction({
        kind: elapsedHours % 3 < 1 ? 'tap' : 'hold',
        area: elapsedHours % 4 < 1 ? 'head' : 'body',
      })
      nextInteractionAt += scenario.interactionEveryMinutes * 60_000
    } else if (sleepWindow) {
      lastInteractionAt = Math.min(lastInteractionAt, currentNow - 10 * 60_000)
    }

    const scene = createTimeSceneContext(
      new Date(currentNow),
      sleepWindow ? null : segment.app,
      sleepWindow ? 0 : (segment.idleSeconds ?? 0),
      {
        onBatteryPower: elapsedHours % 6 >= 4,
        screenLocked: Boolean(sleepWindow),
        suspended: Boolean(sleepWindow),
      },
    )
    controller.observeScene(scene)

    while (completedDeliveries < deliveries.length) {
      const delivery = deliveries[completedDeliveries]
      completedDeliveries += 1
      if (!delivery) {
        continue
      }
      completeVirtualDelivery(
        controller,
        delivery,
        completedDeliveries,
        scenario.interruptEveryNthDelivery ?? 0,
      )
    }
    maxMemoryCount = Math.max(maxMemoryCount, controller.getEpisodicMemories().length)
  }

  const telemetry = controller.getTelemetry()
  const interruptions = telemetry.actionInterruptions
  const walls = Math.max(1, performance.now() - wallStartedAt)
  const speechTimes = deliveries
    .filter((delivery) => delivery.candidate.speech !== 'none')
    .map((delivery) => delivery.selectedAt)
  const hourlySpeechCounts = new Map<number, number>()
  for (const at of speechTimes) {
    const bucket = Math.floor((at - startedAt) / 3_600_000)
    hourlySpeechCounts.set(bucket, (hourlySpeechCounts.get(bucket) ?? 0) + 1)
  }
  const lastDialogueAt = new Map<string, number>()
  let duplicateDialogues = 0
  for (const delivery of deliveries) {
    const text = delivery.candidate.spokenText ?? delivery.candidate.dialogue
    if (!text) {
      continue
    }
    const previousAt = lastDialogueAt.get(text)
    if (previousAt !== undefined && delivery.selectedAt - previousAt < 30 * 60_000) {
      duplicateDialogues += 1
    }
    lastDialogueAt.set(text, delivery.selectedAt)
  }
  return {
    name: scenario.name,
    durationHours: scenario.durationHours,
    wallTimeMs: Math.round(walls),
    samples: totalSamples,
    deliveries: deliveryCount,
    deliveriesPerHour: roundTwo(deliveryCount / scenario.durationHours),
    speechesPerHour: roundTwo(speechTimes.length / scenario.durationHours),
    peakSpeechesPerHour: Math.max(0, ...hourlySpeechCounts.values()),
    silentRate:
      telemetry.decisions === 0 ? 0 : roundTwo(telemetry.silentDecisions / telemetry.decisions),
    duplicateDialogueRate:
      speechTimes.length === 0 ? 0 : roundTwo(duplicateDialogues / speechTimes.length),
    interruptions,
    interruptionRate: deliveryCount === 0 ? 0 : roundTwo(interruptions / deliveryCount),
    uniqueRules: Object.keys(telemetry.rules).length,
    maxMemoryCount,
    heapDeltaBytes: process.memoryUsage().heapUsed - heapStartedAt,
    telemetry,
    passed: {
      memoryBudget: maxMemoryCount <= 100,
      speechBudget: Math.max(0, ...hourlySpeechCounts.values()) <= 9,
      deliveryBudget: deliveryCount <= scenario.durationHours * 16,
      repeatBudget: duplicateDialogues === 0,
    },
  }
}

function completeVirtualDelivery(
  controller: PresenceController,
  delivery: PresenceDelivery,
  deliveryIndex: number,
  interruptEveryNthDelivery: number,
): void {
  controller.handlePerformanceScheduled(delivery.performanceToken)
  controller.handlePerformanceEvent({
    performanceToken: delivery.performanceToken,
    type: 'action_started',
    durationMs: 1_200,
  })
  const shouldInterrupt =
    interruptEveryNthDelivery > 0 && deliveryIndex % interruptEveryNthDelivery === 0
  if (shouldInterrupt) {
    if (delivery.deliveryId) {
      controller.handleDeliveryEvent({
        deliveryId: delivery.deliveryId,
        type: 'speech_started',
      })
      controller.handleDeliveryEvent({
        deliveryId: delivery.deliveryId,
        type: 'speech_interrupted',
        reason: 'user',
      })
    }
    controller.handlePerformanceEvent({
      performanceToken: delivery.performanceToken,
      type: 'action_interrupted',
      reason: 'user',
    })
    return
  }

  if (delivery.deliveryId) {
    controller.handleDeliveryEvent({
      deliveryId: delivery.deliveryId,
      type: 'speech_started',
    })
    controller.handleDeliveryEvent({
      deliveryId: delivery.deliveryId,
      type: 'speech_completed',
    })
  }
  controller.handlePerformanceEvent({
    performanceToken: delivery.performanceToken,
    type: 'action_completed',
    durationMs: 1_200,
  })
  controller.handlePerformanceEvent({
    performanceToken: delivery.performanceToken,
    type: 'recovery_started',
  })
  controller.handlePerformanceEvent({
    performanceToken: delivery.performanceToken,
    type: 'recovery_completed',
  })
}

function resolveSegment(
  segments: PresenceReplaySegment[],
  elapsedHours: number,
): PresenceReplaySegment {
  let cursor = 0
  for (const segment of segments) {
    cursor += segment.durationHours
    if (elapsedHours < cursor) {
      return segment
    }
  }
  return (
    segments.at(-1) ?? {
      durationHours: 1,
      app: 'Visual Studio Code',
    }
  )
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100
}

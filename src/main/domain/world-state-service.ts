import { state } from '../app-state'
import { getNowPlaying, getSchedule } from '../perception/life-context'
import { buildWorldState, type WorldState } from './world-state'

const REFRESH_MS = 60_000

let latest: WorldState | null = null
let timer: NodeJS.Timeout | null = null
let refreshing: Promise<WorldState> | null = null

function snapshotSettings() {
  return state.petController?.getSettingsSnapshot()
}

function fallbackWorld(): WorldState {
  const snapshot = snapshotSettings()
  const scene = state.timeSceneContext
  return buildWorldState({
    now: Date.now(),
    scene,
    snapshot:
      snapshot ??
      ({
        settings: { rendererId: '', rendererMode: '2d' },
        state: { affectionLevel: 1, affectionTitle: '初识' },
        character: { renderers: [] },
      } as never),
    emotion: state.presenceController?.getEmotionState() ?? null,
    routine: state.routineService?.getSnapshot() ?? {
      pomodoroPhase: null,
      pomodoroMinutesLeft: null,
      waterReminderEnabled: false,
      sleepTime: '23:30',
    },
    schedule: [],
    media: null,
  })
}

/** 刷新并返回最新世界状态；聊天请求用它拿到同一份快照。 */
export async function refreshWorldState(): Promise<WorldState> {
  if (refreshing) {
    return refreshing
  }
  refreshing = (async () => {
    const snapshot = snapshotSettings()
    if (!snapshot) {
      latest = fallbackWorld()
      return latest
    }
    const [schedule, media] = await Promise.all([getSchedule(), getNowPlaying()])
    latest = buildWorldState({
      now: Date.now(),
      scene: state.timeSceneContext,
      snapshot,
      emotion: state.presenceController?.getEmotionState() ?? null,
      routine: state.routineService?.getSnapshot() ?? {
        pomodoroPhase: null,
        pomodoroMinutesLeft: null,
        waterReminderEnabled: false,
        sleepTime: '23:30',
      },
      schedule,
      media,
    })
    return latest
  })()
  try {
    return await refreshing
  } finally {
    refreshing = null
  }
}

export function getWorldState(): WorldState {
  return latest ?? fallbackWorld()
}

export function startWorldStateService(): void {
  void refreshWorldState()
  if (timer) {
    clearInterval(timer)
  }
  timer = setInterval(() => void refreshWorldState(), REFRESH_MS)
  timer.unref?.()
}

export function stopWorldStateService(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

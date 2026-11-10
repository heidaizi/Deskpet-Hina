import { matchesConditions } from './conditions'
import { getOfficialVoiceLine } from '../../shared/official-voices'
import type { TimeSceneContext } from '../../shared/time-scene'
import type { BehaviorBundle, DialogueEntry, PetState } from './types'

export interface DialogueSelection {
  state: PetState
  dialogue: string
  dialogueId: string
  voice?: string
}

function chooseWeighted(
  entries: readonly DialogueEntry[],
  random: () => number,
): DialogueEntry | null {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight ?? 1), 0)
  if (total <= 0) {
    return entries[0] ?? null
  }

  let threshold = random() * total
  for (const entry of entries) {
    threshold -= Math.max(0, entry.weight ?? 1)
    if (threshold <= 0) {
      return entry
    }
  }
  return entries.at(-1) ?? null
}

export class DialogueService {
  constructor(
    private readonly bundle: BehaviorBundle,
    private readonly random: () => number = Math.random,
  ) {}

  select(poolId: string, state: PetState, timeScene?: TimeSceneContext): DialogueSelection {
    const pool = this.bundle.dialogues.pools[poolId]
    const eligible = (pool?.entries ?? []).filter((entry) =>
      matchesConditions(state, entry.conditions, { timeScene }),
    )
    if (eligible.length === 0) {
      return {
        state,
        dialogue: '……',
        dialogueId: `${poolId}-fallback`,
      }
    }

    const recent = new Set(state.dialogueHistory.slice(-2))
    const fresh = eligible.filter((entry) => !recent.has(entry.id))
    const selected = chooseWeighted(fresh.length > 0 ? fresh : eligible, this.random)

    if (!selected) {
      return {
        state,
        dialogue: '……',
        dialogueId: `${poolId}-fallback`,
      }
    }

    const nextState = structuredClone(state)
    nextState.dialogueHistory = [...nextState.dialogueHistory, selected.id].slice(-12)
    return {
      state: nextState,
      dialogue: selected.text,
      dialogueId: selected.id,
      voice: getOfficialVoiceLine(selected.source?.clip)?.path,
    }
  }
}

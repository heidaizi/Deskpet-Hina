import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FEEDBACK_WINDOW_MS, FeedbackStore } from '../../src/main/domain/memory/feedback-store'

const directories: string[] = []

function makeStore(): { store: FeedbackStore; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'deskpet-feedback-'))
  directories.push(directory)
  const path = join(directory, 'feedback.json')
  return { store: new FeedbackStore(path), path }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('feedback store', () => {
  it('records an interaction inside the window as engaged', () => {
    const { store } = makeStore()
    store.noteDelivery('scene-companion:cafe', 'development', 1_000)
    store.noteInteraction(4_000)

    const [event] = store.list()
    expect(event.kind).toBe('engaged')
    expect(event.latencyMs).toBe(3_000)
    expect(store.summary()).toMatchObject({ engaged: 1, ignored: 0, interrupted: 0 })
  })

  it('records a user interruption', () => {
    const { store } = makeStore()
    store.noteDelivery('rest-needed', 'focus', 1_000)
    store.noteInterruption(2_000)
    expect(store.list()[0].kind).toBe('interrupted')
  })

  it('settles an unanswered delivery as ignored after the window', () => {
    const { store } = makeStore()
    store.noteDelivery('idle-micro-motion', 'other', 1_000)

    store.settleExpired(1_000 + FEEDBACK_WINDOW_MS - 1)
    expect(store.list()).toHaveLength(0)

    store.settleExpired(1_000 + FEEDBACK_WINDOW_MS)
    expect(store.list()[0].kind).toBe('ignored')
  })

  it('ignores interactions that happen without an active delivery', () => {
    const { store } = makeStore()
    store.noteInteraction(5_000)
    expect(store.list()).toHaveLength(0)
  })

  it('persists events and restores them', () => {
    const { store, path } = makeStore()
    store.noteDelivery('return-greeting', 'desktop', 1_000)
    store.noteInteraction(1_500)

    const restored = new FeedbackStore(path)
    expect(restored.summary()).toMatchObject({ engaged: 1, total: 1 })
  })

  it('clears events and pending state', () => {
    const { store } = makeStore()
    store.noteDelivery('late-night-first', 'media', 1_000)
    store.clear()
    store.settleExpired(10_000_000)
    expect(store.list()).toHaveLength(0)
  })
})

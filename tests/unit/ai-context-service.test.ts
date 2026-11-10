import { describe, expect, it, vi } from 'vitest'
import { AiContextService } from '../../src/main/domain/ai-context-service'
import { createTimeSceneContext } from '../../src/shared/time-scene'

const timeScene = createTimeSceneContext(new Date('2026-10-25T10:30:00+08:00'), 'Obsidian', 5, {
  onBatteryPower: false,
  screenLocked: false,
  suspended: false,
})

describe('AI desktop context selection fallback', () => {
  it('offers manual paste when accessibility is unavailable', async () => {
    const reader = vi.fn()
    const service = new AiContextService({
      getTimeSceneContext: () => timeScene,
      isAccessibilityTrusted: () => false,
      readFrontmostDetails: reader,
    })

    const captured = await service.createContext('selection', {
      includeWindowTitle: true,
      includeSelectedText: true,
    })

    expect(captured.manualSelectionRequired).toBe(true)
    expect(captured.context.selectedText).toBeUndefined()
    expect(captured.context.windowTitle).toBeUndefined()
    expect(reader).not.toHaveBeenCalled()
  })

  it('offers manual paste when Obsidian exposes no AXSelectedText', async () => {
    const service = new AiContextService({
      getTimeSceneContext: () => timeScene,
      isAccessibilityTrusted: () => true,
      readFrontmostDetails: async () => ({
        appName: 'Obsidian',
        windowTitle: 'Project notes',
        selectedText: '',
      }),
    })

    const captured = await service.createContext('selection', {
      includeWindowTitle: true,
      includeSelectedText: true,
    })

    expect(captured).toMatchObject({
      manualSelectionRequired: true,
      selectedTextTruncated: false,
      context: { windowTitle: 'Project notes' },
    })
    expect(captured.context.selectedText).toBeUndefined()
  })

  it('uses accessibility selected text when the target app exposes it', async () => {
    const service = new AiContextService({
      getTimeSceneContext: () => timeScene,
      isAccessibilityTrusted: () => true,
      readFrontmostDetails: async () => ({
        appName: 'Safari',
        windowTitle: 'Documentation',
        selectedText: 'selected paragraph',
      }),
    })

    const captured = await service.createContext('selection', {
      includeWindowTitle: true,
      includeSelectedText: true,
    })

    expect(captured.manualSelectionRequired).toBe(false)
    expect(captured.context.selectedText).toBe('selected paragraph')
  })
})

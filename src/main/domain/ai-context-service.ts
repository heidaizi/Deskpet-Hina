import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { systemPreferences } from 'electron'
import {
  MAX_AI_SELECTED_TEXT_CHARACTERS,
  type AiContextInput,
  type AiContextMode,
} from '../../shared/ai-context'
import type { TimeSceneContext } from '../../shared/time-scene'

const execFileAsync = promisify(execFile)
const MAX_WINDOW_TITLE = 160

export interface FrontmostDetails {
  appName: string
  windowTitle: string
  selectedText: string
}

export interface AiContextServiceOptions {
  getTimeSceneContext: () => TimeSceneContext
  getFallbackScene?: () => TimeSceneContext['scene']
  isAccessibilityTrusted?: (prompt: boolean) => boolean
  readFrontmostDetails?: (includeSelectedText: boolean) => Promise<FrontmostDetails>
}

export class AiContextService {
  constructor(private readonly options: AiContextServiceOptions) {}

  isAccessibilityTrusted(prompt = false): boolean {
    if (process.platform !== 'darwin') {
      return false
    }
    const check =
      this.options.isAccessibilityTrusted ??
      ((shouldPrompt: boolean) => systemPreferences.isTrustedAccessibilityClient(shouldPrompt))
    return check(prompt)
  }

  async createContext(
    mode: AiContextMode,
    options: {
      includeWindowTitle: boolean
      includeSelectedText: boolean
    },
  ): Promise<{
    context: AiContextInput
    manualSelectionRequired: boolean
    selectedTextTruncated: boolean
  }> {
    const sceneContext = this.options.getTimeSceneContext()
    if (sceneContext.screenLocked || sceneContext.suspended) {
      throw new Error('锁屏或睡眠期间不读取桌面上下文。')
    }
    const needsFrontmostRead =
      options.includeWindowTitle || (mode === 'selection' && options.includeSelectedText)
    let windowTitle = ''
    let selectedText = ''
    let selectedTextTruncated = false
    let manualSelectionRequired = false

    if (needsFrontmostRead) {
      if (!this.isAccessibilityTrusted(false)) {
        if (mode === 'selection' && options.includeSelectedText) {
          manualSelectionRequired = true
        } else {
          throw new Error('需要辅助功能权限才能读取窗口标题或选中文字。')
        }
      } else {
        try {
          const details = await (this.options.readFrontmostDetails ?? readFrontmostDetails)(
            mode === 'selection' && options.includeSelectedText,
          )
          if (!isDeskpetApplication(details.appName)) {
            if (options.includeWindowTitle) {
              windowTitle = details.windowTitle.trim().slice(0, MAX_WINDOW_TITLE)
            }
            if (mode === 'selection' && options.includeSelectedText) {
              selectedText = details.selectedText.trim()
              const characters = Array.from(selectedText)
              selectedTextTruncated = characters.length > MAX_AI_SELECTED_TEXT_CHARACTERS
              selectedText = characters.slice(0, MAX_AI_SELECTED_TEXT_CHARACTERS).join('')
            }
          } else if (mode === 'selection' && options.includeSelectedText) {
            manualSelectionRequired = true
          }
        } catch (error) {
          if (mode === 'selection' && options.includeSelectedText) {
            manualSelectionRequired = true
          } else {
            throw error
          }
        }
      }
    }

    if (mode === 'selection' && options.includeSelectedText && !selectedText) {
      manualSelectionRequired = true
    }

    return {
      context: {
        scene:
          sceneContext.scene === 'system' || sceneContext.scene === 'unknown'
            ? (this.options.getFallbackScene?.() ?? 'other')
            : sceneContext.scene,
        timePeriod: sceneContext.timePeriod,
        localTime: sceneContext.localTime,
        isWeekend: sceneContext.isWeekend,
        ...(windowTitle ? { windowTitle } : {}),
        ...(selectedText ? { selectedText } : {}),
      },
      manualSelectionRequired,
      selectedTextTruncated,
    }
  }
}

async function readFrontmostDetails(includeSelectedText: boolean): Promise<FrontmostDetails> {
  const script = `
tell application "System Events"
  set frontProcess to first application process whose frontmost is true
  set frontName to name of frontProcess
  set windowTitleText to ""
  try
    set windowTitleText to name of front window of frontProcess
  end try
  set selectedTextValue to ""
  ${
    includeSelectedText
      ? `
  try
    set focusedElement to value of attribute "AXFocusedUIElement" of frontProcess
    set selectedTextValue to value of attribute "AXSelectedText" of focusedElement
  end try
  `
      : ''
  }
  return frontName & linefeed & windowTitleText & linefeed & selectedTextValue
end tell`
  const result = await execFileAsync('/usr/bin/osascript', ['-e', script], {
    timeout: 4_000,
    maxBuffer: 64 * 1024,
  })
  const lines = result.stdout.replace(/\r\n/gu, '\n').split('\n')
  const windowTitle = lines[1]?.trim() ?? ''
  const selectedText = lines.slice(2).join('\n').trim()
  return {
    appName: normalizeAppleScriptValue(lines[0]),
    windowTitle: normalizeAppleScriptValue(windowTitle),
    selectedText: normalizeAppleScriptValue(selectedText),
  }
}

function normalizeAppleScriptValue(value: string | undefined): string {
  const normalized = value?.trim() ?? ''
  return normalized === 'missing value' ? '' : normalized
}

function isDeskpetApplication(name: string): boolean {
  return /(deskpet|日奈桌宠|^electron$)/iu.test(name.trim())
}

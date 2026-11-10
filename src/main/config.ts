import { parsePresenceMode } from '../shared/presence'

export const MOUSE_POLL_MS = 16
export const SAVE_DEBOUNCE_MS = 350
export const IS_E2E = process.env.DESKPET_E2E === '1'
export const presenceMode = parsePresenceMode(process.env.DESKPET_PRESENCE_MODE)

export const CLICK_THROUGH_SHORTCUT_CANDIDATES = [
  {
    accelerator: 'Command+Shift+Alt+H',
    label: '⌘⌥⇧H',
  },
  {
    accelerator: 'Command+Shift+Alt+P',
    label: '⌘⌥⇧P',
  },
  {
    accelerator: 'Command+Alt+H',
    label: '⌘⌥H',
  },
] as const

export const CLICK_THROUGH_FALLBACK_MS = 12_000

export const AI_CONTEXT_SHORTCUTS = {
  task: { accelerator: 'Command+Shift+Alt+D', label: '⌘⌥⇧D' },
  selection: { accelerator: 'Command+Shift+Alt+S', label: '⌘⌥⇧S' },
} as const

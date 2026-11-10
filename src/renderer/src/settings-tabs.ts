export type SettingsTabName = 'appearance' | 'relationship' | 'behavior' | 'ai' | 'data'

const STORAGE_KEY = 'deskpet.settings.tab'
const TAB_NAMES: SettingsTabName[] = ['appearance', 'relationship', 'behavior', 'ai', 'data']

let activeTab: SettingsTabName = 'appearance'

function isTabName(value: string | null): value is SettingsTabName {
  return value !== null && (TAB_NAMES as string[]).includes(value)
}

function readStoredTab(): SettingsTabName | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isTabName(stored) ? stored : null
  } catch {
    return null
  }
}

function storeTab(name: SettingsTabName): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, name)
  } catch {
    // 本地存储不可用时只影响记忆上次所在分页，不影响功能。
  }
}

export function activateSettingsTab(
  name: SettingsTabName,
  options: { focus?: boolean } = {},
): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.settings-tab')
  const panels = document.querySelectorAll<HTMLElement>('.tab-panel')

  for (const button of buttons) {
    const isActive = button.dataset.tab === name
    button.setAttribute('aria-selected', String(isActive))
    button.classList.toggle('is-active', isActive)
    button.tabIndex = isActive ? 0 : -1
    if (isActive && options.focus) {
      button.focus()
    }
  }

  for (const panel of panels) {
    panel.classList.toggle('is-active', panel.id === `tab-${name}`)
  }

  activeTab = name
  storeTab(name)
  window.scrollTo({ top: 0, behavior: 'auto' })
}

function moveFocus(offset: number): void {
  const index = TAB_NAMES.indexOf(activeTab)
  const next = TAB_NAMES[(index + offset + TAB_NAMES.length) % TAB_NAMES.length]
  activateSettingsTab(next, { focus: true })
}

export function setupSettingsTabs(): void {
  const tablist = document.querySelector<HTMLElement>('.settings-tabs')
  if (!tablist) {
    return
  }

  tablist.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.settings-tab')
    const name = button?.dataset.tab
    if (name && isTabName(name)) {
      activateSettingsTab(name)
    }
  })

  tablist.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      moveFocus(1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveFocus(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      activateSettingsTab(TAB_NAMES[0], { focus: true })
    } else if (event.key === 'End') {
      event.preventDefault()
      activateSettingsTab(TAB_NAMES[TAB_NAMES.length - 1], { focus: true })
    }
  })

  activateSettingsTab(readStoredTab() ?? 'appearance')
}

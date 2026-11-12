import {
  app,
  Menu,
  globalShortcut,
  Notification,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron'
import { state } from '../app-state'
import { showChatWindow } from '../chat/bridge'
import { createTrayIcon } from '../tray-icon'
import { resetPetPosition, togglePetVisibility } from '../window/pet-window'
import { showSettingsWindow, updateAppSettings } from '../settings/bridge'
import {
  AI_CONTEXT_SHORTCUTS,
  CLICK_THROUGH_FALLBACK_MS,
  CLICK_THROUGH_SHORTCUT_CANDIDATES,
} from '../config'
import { openAiContext } from '../ai/bridge'
import { updateMousePolicyFromCursor } from '../window/mouse'
import { describeScreenPerception, screenPerceptionTrayTitle } from '../../shared/screen-perception'
import { getScreenVisionStatus } from '../perception/screen-vision'
export function createTray(): void {
  state.tray = new Tray(createTrayIcon())
  updateTrayPresentation()
  refreshTrayMenu()
}

export function buildMenuTemplate(): MenuItemConstructorOptions[] {
  const snapshot = state.petController?.getSettingsSnapshot()
  const stateLabel = snapshot
    ? `Lv.${snapshot.state.affectionLevel} · 心情 ${snapshot.state.mood} · 精力 ${snapshot.state.energy}`
    : '状态加载中'
  const screenPerception = getScreenVisionStatus()
  return [
    {
      label: state.petVisible ? '隐藏日奈' : '显示日奈',
      click: togglePetVisibility,
    },
    {
      label: '形象渲染',
      submenu: [
        {
          label: '2D 占位',
          type: 'radio',
          checked: snapshot?.settings.rendererMode === '2d',
          click: () => {
            updateAppSettings({ rendererMode: '2d' })
          },
        },
        {
          label: '3D VRM 占位',
          type: 'radio',
          checked: snapshot?.settings.rendererMode === '3d',
          click: () => {
            updateAppSettings({ rendererMode: '3d' })
          },
        },
      ],
    },
    {
      label: stateLabel,
      enabled: false,
    },
    {
      label: '让日奈看看…',
      submenu: [
        {
          label: `分析当前任务（${AI_CONTEXT_SHORTCUTS.task.label}）`,
          click: () => {
            void openAiContext('task')
          },
        },
        {
          label: `解释选中文字…（${AI_CONTEXT_SHORTCUTS.selection.label}）`,
          enabled: snapshot?.settings.aiSelectedTextEnabled ?? false,
          click: () => {
            void openAiContext('selection')
          },
        },
      ],
    },
    {
      label: '暂停互动',
      type: 'checkbox',
      checked: snapshot?.settings.interactionsPaused ?? false,
      click: (menuItem) => {
        updateAppSettings({ interactionsPaused: menuItem.checked })
      },
    },
    {
      label: `屏幕感知：${describeScreenPerception(screenPerception)}`,
      enabled: false,
    },
    {
      label: screenPerception.paused ? '继续屏幕感知' : '暂停屏幕感知',
      enabled: screenPerception.configured,
      click: () => {
        updateAppSettings({ screenPerceptionPaused: !screenPerception.paused })
      },
    },
    {
      label: '和日奈说话…',
      click: () => {
        void showChatWindow()
      },
    },
    {
      label: '打开设置…',
      click: () => {
        void showSettingsWindow()
      },
    },
    { type: 'separator' },
    {
      label: '完全鼠标穿透（可用快捷键或 Dock 恢复）',
      type: 'checkbox',
      checked: state.clickThroughMode,
      click: (menuItem) => {
        setClickThroughMode(menuItem.checked)
      },
    },
    {
      label: state.activeClickThroughShortcut
        ? `恢复快捷键：${state.activeClickThroughShortcut.label}`
        : '恢复快捷键不可用',
      enabled: false,
    },
    {
      label: '重置到主屏右下角',
      click: resetPetPosition,
    },
    { type: 'separator' },
    {
      label: '退出 Deskpet',
      role: 'quit',
    },
  ]
}

export function refreshTrayMenu(): void {
  updateTrayPresentation()
  const template = buildMenuTemplate()
  state.tray?.setContextMenu(Menu.buildFromTemplate(template))
}

export function updateTrayPresentation(): void {
  if (!state.tray || state.tray.isDestroyed()) {
    return
  }

  const screenPerception = getScreenVisionStatus()
  state.tray.setTitle(screenPerceptionTrayTitle(screenPerception, state.clickThroughMode))
  state.tray.setToolTip(
    state.clickThroughMode
      ? `Deskpet · 完全鼠标穿透中${state.activeClickThroughShortcut ? ` · ${state.activeClickThroughShortcut.label} 恢复` : ''}`
      : screenPerception.active
        ? 'Deskpet · 屏幕感知中（每 8 分钟本地预检后分析）'
        : 'Deskpet · 日奈 M4 VRM 3D 技术接入',
  )
}

export function registerClickThroughShortcut(): void {
  state.activeClickThroughShortcut =
    CLICK_THROUGH_SHORTCUT_CANDIDATES.find((candidate) =>
      globalShortcut.register(candidate.accelerator, () => {
        setClickThroughMode(!state.clickThroughMode)
      }),
    ) ?? null

  if (!state.activeClickThroughShortcut) {
    console.error('Unable to register a global shortcut for restoring mouse input.')
  }
}

export function showClickThroughNotification(): void {
  if (!Notification.isSupported()) {
    return
  }

  const notification = new Notification({
    title: '空崎日奈',
    body: state.activeClickThroughShortcut
      ? `完全鼠标穿透已开启。按 ${state.activeClickThroughShortcut.label} 或点击 Dock 图标恢复。`
      : '完全鼠标穿透已临时开启，12 秒后会自动恢复。',
    silent: true,
  })
  notification.on('click', () => {
    setClickThroughMode(false)
  })
  notification.show()
}

export function setClickThroughMode(enabled: boolean): void {
  state.clickThroughMode = enabled

  if (state.clickThroughFallbackTimer) {
    clearTimeout(state.clickThroughFallbackTimer)
    state.clickThroughFallbackTimer = null
  }

  if (enabled) {
    state.presenceController?.cancelProactiveAi('click-through')
    const dock = app.dock
    if (dock) {
      void dock.show().then(() => {
        dock.bounce('informational')
      })
    }
    if (!state.activeClickThroughShortcut) {
      state.clickThroughFallbackTimer = setTimeout(() => {
        state.clickThroughFallbackTimer = null
        setClickThroughMode(false)
      }, CLICK_THROUGH_FALLBACK_MS)
    }
    showClickThroughNotification()
  } else {
    app.dock?.hide()
  }

  refreshTrayMenu()
  updateMousePolicyFromCursor()
}

import type { StickerView } from '@shared/stickers'
import type { ChatMessageView } from '@shared/types'
import './chat.css'

const messages = requireElement<HTMLElement>('#chat-messages')
const status = requireElement<HTMLElement>('#chat-status')
const form = requireElement<HTMLFormElement>('#chat-form')
const input = requireElement<HTMLTextAreaElement>('#chat-input')
const sendButton = requireElement<HTMLButtonElement>('#chat-send')
const clearButton = requireElement<HTMLButtonElement>('#chat-clear')
const stickerButton = requireElement<HTMLButtonElement>('#chat-sticker')
const stickerPanel = requireElement<HTMLElement>('#sticker-panel')

let busy = false
let pendingFollowups = 0
const pendingStickers: ChatMessageView[] = []
const stickers = new Map<string, StickerView>()

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Required element is missing: ${selector}`)
  }
  return element
}

function setStatus(text: string, kind: 'info' | 'error' = 'info'): void {
  status.textContent = text
  status.dataset.kind = kind
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function scrollToBottom(): void {
  messages.scrollTop = messages.scrollHeight
}

function appendMessage(message: ChatMessageView): void {
  const row = document.createElement('div')
  row.className = `chat-row ${message.role === 'user' ? 'is-user' : 'is-pet'}`
  row.dataset.messageId = message.id

  const sticker = message.stickerId ? stickers.get(message.stickerId) : undefined
  const bubble = document.createElement('div')
  bubble.className = sticker ? 'bubble sticker-bubble' : 'bubble'
  if (sticker) {
    const image = document.createElement('img')
    image.src = sticker.dataUrl
    image.alt = sticker.label
    image.className = 'sticker-image'
    bubble.append(image)
  } else {
    bubble.textContent = message.text
  }

  const meta = document.createElement('div')
  meta.className = 'meta'
  meta.textContent = `${message.role === 'user' ? '你' : '日奈'} · ${formatTime(message.at)}`

  row.append(bubble, meta)
  messages.append(row)
  scrollToBottom()
}

function renderEmpty(): void {
  const empty = document.createElement('div')
  empty.className = 'chat-empty'
  empty.id = 'chat-empty'
  empty.textContent = '还没有聊过。她记得最近几轮，试着从今天在做什么开始。'
  messages.append(empty)
}

function removeEmpty(): void {
  messages.querySelector('#chat-empty')?.remove()
}

async function refreshStickers(): Promise<void> {
  try {
    const pack = await window.deskpet.getStickers()
    stickerPanel.replaceChildren()
    stickers.clear()
    if (pack.stickers.length === 0) {
      stickerButton.hidden = true
      stickerPanel.hidden = true
      return
    }
    stickerButton.hidden = false
    for (const sticker of pack.stickers) {
      stickers.set(sticker.id, sticker)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'sticker-option'
      button.title = sticker.adjective ? `${sticker.label} · ${sticker.adjective}` : sticker.label
      const image = document.createElement('img')
      image.src = sticker.dataUrl
      image.alt = sticker.label
      const caption = document.createElement('span')
      caption.textContent = sticker.label
      button.append(image, caption)
      button.addEventListener('click', () => {
        stickerPanel.hidden = true
        stickerButton.setAttribute('aria-expanded', 'false')
        void sendSticker(sticker.id)
      })
      stickerPanel.append(button)
    }
  } catch {
    stickerButton.hidden = true
  }
}

async function sendSticker(id: string): Promise<void> {
  removeEmpty()
  try {
    const result = await window.deskpet.sendSticker(id)
    if (result.ok && result.message) {
      appendMessage(result.message)
      setStatus('')
    } else {
      setStatus(result.error ?? '贴纸发送失败。', 'error')
    }
  } catch (error) {
    setStatus(`贴纸发送失败：${String(error)}`, 'error')
  }
}

function setBusy(next: boolean): void {
  busy = next
  sendButton.disabled = next
  input.disabled = next
  if (!next) {
    input.focus()
  }
}

async function loadHistory(): Promise<void> {
  try {
    const history = await window.deskpet.getChatHistory()
    messages.replaceChildren()
    if (history.length === 0) {
      renderEmpty()
      return
    }
    for (const message of history) {
      appendMessage(message)
    }
  } catch (error) {
    setStatus(`读取对话记录失败：${String(error)}`, 'error')
  }
}

async function submit(): Promise<void> {
  const text = input.value.trim()
  if (busy || !text) {
    return
  }
  removeEmpty()
  const now = Date.now()
  appendMessage({ id: `local-${now}`, role: 'user', text, at: now })
  input.value = ''
  setBusy(true)
  setStatus('日奈正在想…')

  try {
    const result = await window.deskpet.sendChatMessage(text)
    if (result.ok && result.message) {
      appendMessage(result.message)
      pendingFollowups = result.followupCount ?? 0
      setStatus(pendingFollowups > 0 ? '日奈还在说…' : '')
    } else {
      setStatus(result.error ?? '没有得到回复。', 'error')
    }
  } catch (error) {
    setStatus(`发送失败：${String(error)}`, 'error')
  } finally {
    setBusy(false)
    while (pendingStickers.length > 0) {
      const sticker = pendingStickers.shift()
      if (sticker) {
        appendMessage(sticker)
      }
    }
  }
}

window.deskpet.onChatMessage((message) => {
  appendMessage(message)
  pendingFollowups = Math.max(0, pendingFollowups - 1)
  if (pendingFollowups === 0) {
    setStatus('')
  }
})

window.deskpet.onChatSticker((message) => {
  if (busy) {
    pendingStickers.push(message)
    return
  }
  appendMessage(message)
})

stickerButton.addEventListener('click', () => {
  const willOpen = stickerPanel.hidden
  stickerPanel.hidden = !willOpen
  stickerButton.setAttribute('aria-expanded', String(willOpen))
  if (willOpen) {
    void refreshStickers()
  }
})

stickerPanel.addEventListener('click', (event) => {
  if (event.target === stickerPanel) {
    stickerPanel.hidden = true
    stickerButton.setAttribute('aria-expanded', 'false')
  }
})

form.addEventListener('submit', (event) => {
  event.preventDefault()
  void submit()
})

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void submit()
  }
})

clearButton.addEventListener('click', async () => {
  try {
    await window.deskpet.clearChatHistory()
    messages.replaceChildren()
    renderEmpty()
    setStatus('已清除对话记录。')
  } catch (error) {
    setStatus(`清除失败：${String(error)}`, 'error')
  }
})

void refreshStickers()
void loadHistory()
input.focus()

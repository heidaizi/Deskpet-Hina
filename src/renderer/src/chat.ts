import type { ChatMessageView } from '@shared/types'
import './chat.css'

const messages = requireElement<HTMLElement>('#chat-messages')
const status = requireElement<HTMLElement>('#chat-status')
const form = requireElement<HTMLFormElement>('#chat-form')
const input = requireElement<HTMLTextAreaElement>('#chat-input')
const sendButton = requireElement<HTMLButtonElement>('#chat-send')
const clearButton = requireElement<HTMLButtonElement>('#chat-clear')

let busy = false

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

  const bubble = document.createElement('div')
  bubble.className = 'bubble'
  bubble.textContent = message.text

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
      setStatus('')
    } else {
      setStatus(result.error ?? '没有得到回复。', 'error')
    }
  } catch (error) {
    setStatus(`发送失败：${String(error)}`, 'error')
  } finally {
    setBusy(false)
  }
}

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

void loadHistory()
input.focus()

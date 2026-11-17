export const PROFILE_CATEGORIES = ['project', 'preference', 'schedule', 'other'] as const
export type ProfileCategory = (typeof PROFILE_CATEGORIES)[number]

export const PROFILE_CATEGORY_LABELS: Record<ProfileCategory, string> = {
  project: '项目',
  preference: '偏好',
  schedule: '作息',
  other: '其它',
}

export type ProfileSource = 'auto' | 'manual'

export interface ProfileFactView {
  id: string
  category: ProfileCategory
  text: string
  createdAt: number
  updatedAt: number
  source: ProfileSource
  pinned: boolean
}

export const MEMORY_EVENT_KINDS = [
  'outfit',
  'routine',
  'sticker',
  'chat',
  'presence',
  'milestone',
] as const
export type MemoryEventKind = (typeof MEMORY_EVENT_KINDS)[number]

export const MEMORY_EVENT_KIND_LABELS: Record<MemoryEventKind, string> = {
  outfit: '换装',
  routine: '作息',
  sticker: '贴纸',
  chat: '对话',
  presence: '陪伴',
  milestone: '重要时刻',
}

export interface MemoryEventView {
  id: string
  kind: MemoryEventKind
  at: number
  summary: string
  importance: number
}

export interface LongTermMemoryView {
  id: string
  text: string
  createdAt: number
  hits: number
}

export function isProfileCategory(value: unknown): value is ProfileCategory {
  return typeof value === 'string' && (PROFILE_CATEGORIES as readonly string[]).includes(value)
}

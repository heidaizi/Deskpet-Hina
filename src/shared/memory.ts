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

export interface LongTermMemoryView {
  id: string
  text: string
  createdAt: number
  hits: number
}

export function isProfileCategory(value: unknown): value is ProfileCategory {
  return typeof value === 'string' && (PROFILE_CATEGORIES as readonly string[]).includes(value)
}

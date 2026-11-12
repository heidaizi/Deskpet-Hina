export const PERMISSION_SERVICES = ['screen', 'accessibility', 'automation'] as const
export type PermissionService = (typeof PERMISSION_SERVICES)[number]

export type PermissionState = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

export interface PermissionSnapshot {
  screen: PermissionState
  accessibility: PermissionState
  automation: PermissionState
  /** 自动化检测的补充说明；不包含任何页面或窗口内容。 */
  automationDetail: string | null
  checkedAt: number
}

export const PERMISSION_STATE_LABELS: Record<PermissionState, string> = {
  granted: '已授权',
  denied: '未授权',
  'not-determined': '未授权',
  restricted: '受系统限制',
  unknown: '未检测',
}

export function isPermissionService(value: unknown): value is PermissionService {
  return typeof value === 'string' && (PERMISSION_SERVICES as readonly string[]).includes(value)
}

export type ScreenPerceptionPermission =
  'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'

export type ScreenPerceptionOutcome =
  | 'idle'
  | 'checking'
  | 'analyzed'
  | 'skipped-risk'
  | 'skipped-paused'
  | 'skipped-disabled'
  | 'skipped-no-permission'
  | 'skipped-no-key'
  | 'probe-failed'
  | 'error'

export type ScreenRiskReason =
  | 'secure-input'
  | 'password'
  | 'banking'
  | 'one-time-code'
  | 'card-number'
  | 'seed-phrase'
  | 'password-manager'
  | 'payment'

export interface ScreenPerceptionStatus {
  /** 用户是否打开了独立开关（不代表此刻真的在运行）。 */
  configured: boolean
  /** 是否从菜单栏或设置页临时暂停。 */
  paused: boolean
  /** 此刻是否满足运行条件（开关 + AI + 权限 + Key）。 */
  active: boolean
  permission: ScreenPerceptionPermission
  keyConfigured: boolean | null
  lastOutcome: ScreenPerceptionOutcome
  lastRunAt: number | null
  lastUploadAt: number | null
  lastSkipAt: number | null
  lastSkipLabels: string[]
  lastError: string | null
}

export const SCREEN_RISK_LABELS: Record<ScreenRiskReason, string> = {
  'secure-input': '密码输入',
  password: '密码',
  banking: '网银/银行',
  'one-time-code': '验证码',
  'card-number': '银行卡号',
  'seed-phrase': '助记词/私钥',
  'password-manager': '密码管理器',
  payment: '支付页面',
}

export function emptyScreenPerceptionStatus(): ScreenPerceptionStatus {
  return {
    configured: false,
    paused: false,
    active: false,
    permission: 'unknown',
    keyConfigured: null,
    lastOutcome: 'idle',
    lastRunAt: null,
    lastUploadAt: null,
    lastSkipAt: null,
    lastSkipLabels: [],
    lastError: null,
  }
}

/** 托盘标题只表达“此刻是否在感知”，详细原因放在菜单里。 */
export function screenPerceptionTrayTitle(
  status: ScreenPerceptionStatus,
  clickThroughMode: boolean,
): string {
  if (clickThroughMode) {
    return '日奈 · 穿透'
  }
  return status.active ? '日奈 · 感知中' : '日奈'
}

/** 给设置页与托盘菜单用的短状态；不包含任何截图或 OCR 原文。 */
export function describeScreenPerception(status: ScreenPerceptionStatus): string {
  if (!status.configured) {
    return '未开启'
  }
  if (status.paused) {
    return '已暂停'
  }
  if (status.permission !== 'granted') {
    return '缺少屏幕录制权限'
  }
  if (status.keyConfigured === false) {
    return '缺少 DeepSeek API Key'
  }
  if (status.lastOutcome === 'probe-failed') {
    return '本地预检不可用，已跳过本次'
  }
  if (status.lastOutcome === 'skipped-risk') {
    return status.lastSkipLabels.length > 0
      ? `已跳过：${status.lastSkipLabels.join('、')}`
      : '已跳过敏感画面'
  }
  if (status.lastOutcome === 'error') {
    return '上次分析失败'
  }
  if (status.active) {
    return '感知中'
  }
  return '等待可用条件'
}

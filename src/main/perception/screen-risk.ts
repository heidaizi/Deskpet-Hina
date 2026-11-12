import { SCREEN_RISK_LABELS, type ScreenRiskReason } from '../../shared/screen-perception'

export interface ScreenRiskInput {
  /** 本机 Vision OCR 结果；只用于本地判断，不会上传。 */
  ocrText?: string | null
  appName?: string | null
  bundleId?: string | null
  windowTitle?: string | null
  url?: string | null
  pageText?: string | null
  /** macOS 全局安全输入状态；true 表示有应用正在输入密码。 */
  secureInput?: boolean | null
}

export interface ScreenRiskAssessment {
  sensitive: boolean
  score: number
  reasons: ScreenRiskReason[]
  labels: string[]
}

const PASSWORD_PATTERN = /\bpass(?:word|wd|phrase|code)s?\b|密码|口令|secret\s+code/iu
const BANKING_PATTERN =
  /\b(?:online|net|internet)\s*banking\b|\bbank(?:ing)?\s+(?:login|log-in|account|transfer|sign-in|signin)\b|\b(?:icbc|ccb|abchina|boc|cmbchina|bankofchina|chase|wellsfargo|hsbc|citibank|paypal)\b|网银|网上银行|手机银行|银行登录|银行账户|账户余额|转账|汇款|开户行|信用卡|储蓄卡|招商银行|工商银行|建设银行|农业银行|中国银行|交通银行|邮储银行|浦发银行|中信银行|民生银行|兴业银行|光大银行|平安银行|广发银行|华夏银行/iu
const OTP_PATTERN =
  /验证码|动态码|短信码|one[-\s]?time\s+(?:code|password)|\botp\b|2fa|two[-\s]?factor|security\s+code/iu
const SEED_PATTERN = /\b(?:seed|recovery)\s+phrase\b|\bprivate\s+key\b|助记词|私钥/iu
const PASSWORD_MANAGER_PATTERN =
  /\b(?:1password|bitwarden|lastpass|keepass|keychain)\b|钥匙串|密码管理器/iu
const PAYMENT_PATTERN =
  /\b(?:paypal|alipay|apple\s*pay|google\s*pay)\b|支付宝|微信支付|收银台|付款码|支付页面|结算页面/iu

function normalize(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim()
}

function passesLuhn(digits: string): boolean {
  let sum = 0
  let double = false
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index])
    if (double) {
      value *= 2
      if (value > 9) {
        value -= 9
      }
    }
    sum += value
    double = !double
  }
  return sum % 10 === 0
}

function hasCardNumber(text: string): boolean {
  const matches = text.match(/(?:\d[ -]?){13,19}/gu) ?? []
  return matches.some((match) => {
    const digits = match.replace(/\D/gu, '')
    return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)
  })
}

/**
 * 本地内容风险判断。
 *
 * 只接收文本与上下文信号，不接收图片；调用方必须在任何上传动作之前执行。
 * “私人聊天”本身不是风险项，只有出现明确的凭据/支付信号时才跳过。
 */
export function assessScreenRisk(input: ScreenRiskInput): ScreenRiskAssessment {
  const ocrText = normalize(input.ocrText)
  const appText = normalize([input.appName, input.bundleId].filter(Boolean).join(' '))
  const contextText = normalize(
    [input.windowTitle, input.url, input.pageText].filter(Boolean).join('\n'),
  )
  const allText = [ocrText, contextText, appText].filter(Boolean).join('\n')

  const weighted: Array<{ reason: ScreenRiskReason; weight: number }> = []
  const add = (reason: ScreenRiskReason, weight: number): void => {
    if (!weighted.some((item) => item.reason === reason)) {
      weighted.push({ reason, weight })
    }
  }

  if (input.secureInput === true) {
    add('secure-input', 100)
  }
  if (PASSWORD_MANAGER_PATTERN.test(appText) || PASSWORD_MANAGER_PATTERN.test(contextText)) {
    add('password-manager', 95)
  }
  if (SEED_PATTERN.test(allText)) {
    add('seed-phrase', 95)
  }
  if (hasCardNumber(allText)) {
    add('card-number', 90)
  }
  if (BANKING_PATTERN.test(allText)) {
    add('banking', 85)
  }
  if (PASSWORD_PATTERN.test(allText)) {
    add('password', 80)
  }
  if (OTP_PATTERN.test(allText)) {
    add('one-time-code', 75)
  }
  if (PAYMENT_PATTERN.test(allText)) {
    add('payment', 70)
  }

  weighted.sort((left, right) => right.weight - left.weight)
  const reasons = weighted.map((item) => item.reason)
  const score = weighted[0]?.weight ?? 0
  return {
    sensitive: score >= 60,
    score,
    reasons,
    labels: reasons.map((reason) => SCREEN_RISK_LABELS[reason]),
  }
}

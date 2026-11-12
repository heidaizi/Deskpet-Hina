import { describe, expect, it } from 'vitest'
import { assessScreenRisk } from '../../src/main/perception/screen-risk'

describe('local screen risk assessment', () => {
  it('blocks password fields even when the OCR text is empty', () => {
    const risk = assessScreenRisk({ secureInput: true, appName: 'Safari' })
    expect(risk.sensitive).toBe(true)
    expect(risk.reasons).toContain('secure-input')
    expect(risk.labels).toContain('密码输入')
  })

  it('blocks password keywords in OCR or page text', () => {
    expect(assessScreenRisk({ ocrText: 'Password: hunter2' }).reasons).toContain('password')
    expect(assessScreenRisk({ windowTitle: '登录 - 密码' }).reasons).toContain('password')
  })

  it('blocks banking pages by title, URL or visible text', () => {
    expect(assessScreenRisk({ windowTitle: '网上银行登录' }).reasons).toContain('banking')
    expect(assessScreenRisk({ url: 'https://ebank.icbc.com.cn/login' }).reasons).toContain(
      'banking',
    )
    expect(assessScreenRisk({ pageText: '招商银行个人网银' }).reasons).toContain('banking')
  })

  it('keeps ordinary private chats visible to Hina', () => {
    const risk = assessScreenRisk({
      appName: 'WeChat',
      windowTitle: '和朋友聊天',
      pageText: '周末一起去看电影吗？',
      ocrText: '周末一起去看电影吗？',
    })
    expect(risk.sensitive).toBe(false)
    expect(risk.reasons).toEqual([])
  })

  it('still blocks a private chat that contains explicit credentials', () => {
    const risk = assessScreenRisk({
      appName: 'WeChat',
      pageText: '我的密码是 abc123，帮我记一下',
    })
    expect(risk.sensitive).toBe(true)
    expect(risk.reasons).toContain('password')
  })

  it('detects valid card numbers but not arbitrary digit strings', () => {
    expect(assessScreenRisk({ ocrText: '卡号 4111 1111 1111 1111' }).reasons).toContain(
      'card-number',
    )
    expect(assessScreenRisk({ ocrText: '订单号 1234 5678 9012 3456' }).sensitive).toBe(false)
  })

  it('detects one-time codes, password managers and payment pages', () => {
    expect(assessScreenRisk({ ocrText: '验证码 123456' }).reasons).toContain('one-time-code')
    expect(assessScreenRisk({ appName: '1Password' }).reasons).toContain('password-manager')
    expect(assessScreenRisk({ windowTitle: '支付宝收银台' }).reasons).toContain('payment')
  })

  it('leaves ordinary coding work alone', () => {
    const risk = assessScreenRisk({
      appName: 'Code',
      windowTitle: 'main.ts - Deskpet',
      ocrText: 'const answer = 42; // TODO: refactor',
    })
    expect(risk.sensitive).toBe(false)
    expect(risk.score).toBe(0)
  })
})

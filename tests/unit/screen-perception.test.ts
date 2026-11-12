import { describe, expect, it } from 'vitest'
import {
  describeScreenPerception,
  emptyScreenPerceptionStatus,
  screenPerceptionTrayTitle,
  type ScreenPerceptionStatus,
} from '../../src/shared/screen-perception'

function status(overrides: Partial<ScreenPerceptionStatus> = {}): ScreenPerceptionStatus {
  return { ...emptyScreenPerceptionStatus(), ...overrides }
}

describe('screen perception status', () => {
  it('keeps the tray title short and click-through precedence', () => {
    expect(screenPerceptionTrayTitle(status({ active: true }), false)).toBe('日奈 · 感知中')
    expect(screenPerceptionTrayTitle(status({ active: true }), true)).toBe('日奈 · 穿透')
    expect(screenPerceptionTrayTitle(status({ active: false }), false)).toBe('日奈')
  })

  it('describes enabled, paused and permission states without screenshot text', () => {
    expect(describeScreenPerception(status())).toBe('未开启')
    expect(describeScreenPerception(status({ configured: true, paused: true }))).toBe('已暂停')
    expect(describeScreenPerception(status({ configured: true, permission: 'denied' }))).toBe(
      '缺少屏幕录制权限',
    )
    expect(
      describeScreenPerception(status({ configured: true, permission: 'granted', active: true })),
    ).toBe('感知中')
  })

  it('shows the local skip reason but never the captured content', () => {
    const text = describeScreenPerception(
      status({
        configured: true,
        permission: 'granted',
        active: true,
        lastOutcome: 'skipped-risk',
        lastSkipLabels: ['密码', '网银/银行'],
      }),
    )
    expect(text).toContain('已跳过')
    expect(text).toContain('密码')
    expect(text).toContain('网银/银行')
  })
})

import { describe, expect, it } from 'vitest'
import { parseLocalScreenProbe } from '../../src/main/perception/local-screen-probe'

describe('local screen probe parsing', () => {
  it('parses the local JSON result', () => {
    const probe = parseLocalScreenProbe(
      JSON.stringify({
        secureInput: false,
        appName: 'Google Chrome',
        bundleId: 'com.google.Chrome',
        windowTitle: '登录 - 网上银行',
        ocrText: 'Password: hunter2',
        ocrAvailable: true,
      }),
    )
    expect(probe).toMatchObject({
      ok: true,
      secureInput: false,
      appName: 'Google Chrome',
      bundleId: 'com.google.Chrome',
      windowTitle: '登录 - 网上银行',
      ocrText: 'Password: hunter2',
      ocrAvailable: true,
    })
  })

  it('fails closed when the probe output is not JSON', () => {
    expect(parseLocalScreenProbe('not json')).toMatchObject({
      ok: false,
      secureInput: null,
      appName: null,
      ocrText: '',
    })
  })

  it('keeps an empty OCR result usable for context-based checks', () => {
    const probe = parseLocalScreenProbe(
      JSON.stringify({ secureInput: null, appName: null, ocrText: '', ocrAvailable: false }),
    )
    expect(probe.ok).toBe(true)
    expect(probe.secureInput).toBeNull()
    expect(probe.ocrAvailable).toBe(false)
  })
})

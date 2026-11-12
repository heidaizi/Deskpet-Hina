import { describe, expect, it } from 'vitest'
import {
  PERMISSION_STATE_LABELS,
  isPermissionService,
  type PermissionState,
} from '../../src/shared/permissions'

describe('permission status helpers', () => {
  it('validates the services that may be opened in System Settings', () => {
    expect(isPermissionService('screen')).toBe(true)
    expect(isPermissionService('accessibility')).toBe(true)
    expect(isPermissionService('automation')).toBe(true)
    expect(isPermissionService('camera')).toBe(false)
    expect(isPermissionService(null)).toBe(false)
  })

  it('has a label for every permission state', () => {
    const states: PermissionState[] = [
      'granted',
      'denied',
      'not-determined',
      'restricted',
      'unknown',
    ]
    for (const state of states) {
      expect(PERMISSION_STATE_LABELS[state]).toBeTruthy()
    }
  })
})

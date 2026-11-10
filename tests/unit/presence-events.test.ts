import { describe, expect, it } from 'vitest'
import { parsePresenceMode } from '../../src/shared/presence'

describe('presence mode', () => {
  it('accepts the three explicit interaction modes', () => {
    expect(parsePresenceMode('legacy')).toBe('legacy')
    expect(parsePresenceMode('shadow')).toBe('shadow')
    expect(parsePresenceMode('active')).toBe('active')
  })

  it('defaults missing mode to active and malformed mode to shadow', () => {
    expect(parsePresenceMode(undefined)).toBe('active')
    expect(parsePresenceMode('unsafe')).toBe('shadow')
  })
})

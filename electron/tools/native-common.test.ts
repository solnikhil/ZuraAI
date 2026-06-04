import { describe, expect, it } from 'vitest'

import { clampTimeoutMs, requireApproval, stringArg } from './native-common'

describe('native tool helpers', () => {
  it('requires explicit approval for mutating native actions', () => {
    expect(requireApproval({}, 'system_shell')).toEqual({
      success: false,
      error: 'system_shell requires user approval before it can run.',
    })
    expect(requireApproval({ autoApprove: true }, 'system_shell')).toBeNull()
  })

  it('normalizes string args and clamps timeouts', () => {
    expect(stringArg({ command: '  Get-Date  ' }, 'command')).toBe('Get-Date')
    expect(stringArg({ command: 1 }, 'command')).toBe('')
    expect(clampTimeoutMs(999_999)).toBe(60_000)
    expect(clampTimeoutMs(50)).toBe(1_000)
    expect(clampTimeoutMs('5000')).toBe(5_000)
  })
})

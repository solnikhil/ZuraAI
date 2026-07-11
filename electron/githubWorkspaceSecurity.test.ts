import { describe, expect, it } from 'vitest'
import {
  classifyGitHubDevicePoll,
  isGitHubDeviceFlowExpired,
  isValidGitHubDeviceUserCode,
  redactGitHubSecrets,
} from './githubWorkspaceSecurity'

describe('GitHub Workspace security policy', () => {
  it('handles pending, slowdown, denial, expiry, and authorization', () => {
    expect(classifyGitHubDevicePoll({ error: 'authorization_pending' }, 5)).toEqual({ kind: 'retry', intervalSeconds: 5 })
    expect(classifyGitHubDevicePoll({ error: 'slow_down' }, 5)).toEqual({ kind: 'retry', intervalSeconds: 10 })
    expect(classifyGitHubDevicePoll({ error: 'access_denied' }, 5).kind).toBe('denied')
    expect(classifyGitHubDevicePoll({ error: 'expired_token' }, 5).kind).toBe('expired')
    expect(classifyGitHubDevicePoll({ access_token: 'token-for-main-only' }, 5)).toEqual({ kind: 'authorized', token: 'token-for-main-only' })
  })

  it('validates the only renderer-copyable device code shape', () => {
    expect(isValidGitHubDeviceUserCode('ABCD-1234')).toBe(true)
    expect(isValidGitHubDeviceUserCode('token-for-main-only')).toBe(false)
    expect(isValidGitHubDeviceUserCode('abcd-1234')).toBe(false)
  })

  it('redacts GitHub tokens and bearer headers from errors', () => {
    const message = 'failed gho_abcdefghijklmnopqrstuvwxyz012345 Bearer secret.token.value github_pat_abcdefghijklmnopqrstuvwxyz012345'
    const redacted = redactGitHubSecrets(message)
    expect(redacted).not.toContain('gho_')
    expect(redacted).not.toContain('secret.token')
    expect(redacted).not.toContain('github_pat_')
  })

  it('treats exact expiry and invalid timestamps as expired', () => {
    expect(isGitHubDeviceFlowExpired(100, 100)).toBe(true)
    expect(isGitHubDeviceFlowExpired(99, 100)).toBe(false)
    expect(isGitHubDeviceFlowExpired(99, Number.NaN)).toBe(true)
  })
})

// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  stored: '[]',
  setSecureValue: vi.fn(async (_key: string, value: string) => {
    mocks.stored = value
    return true
  }),
}))

vi.mock('../secureStorage', () => ({
  getSecureValueAsync: vi.fn(async () => mocks.stored),
  setSecureValueAsync: mocks.setSecureValue,
}))

import {
  listAgentTrustedActions,
  resetAgentTrustedActionsForTests,
  revokeAgentTrustedAction,
  revokeAllAgentTrustedActions,
  trustAgentExactRepeat,
  useAgentTrustedAction,
} from './agentTrustedActions'

const signatureA = 'a'.repeat(64)
const signatureB = 'b'.repeat(64)

describe('Agent trusted exact-repeat action storage', () => {
  beforeEach(() => {
    mocks.stored = '[]'
    mocks.setSecureValue.mockClear()
    resetAgentTrustedActionsForTests()
  })

  it('stores only sanitized metadata publicly and keeps signature authority encrypted in main', async () => {
    const action = await trustAgentExactRepeat(
      signatureA,
      'mcp__private server__write-file',
      'elevated'
    )

    expect(action).toMatchObject({
      toolName: 'mcp__private_server__write-file',
      riskClass: 'elevated',
    })
    expect(action).not.toHaveProperty('signature')
    expect(await listAgentTrustedActions()).toEqual([action])
    expect(mocks.stored).toContain(signatureA)
  })

  it('migrates legacy signatures without inventing argument or path metadata', async () => {
    mocks.stored = JSON.stringify([signatureA])
    const [action] = await listAgentTrustedActions()

    expect(action).toMatchObject({
      toolName: 'Legacy exact-repeat action',
      riskClass: 'unknown',
    })
    expect(action).not.toHaveProperty('signature')
  })

  it('updates last-used metadata and serializes concurrent mutations', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200).mockReturnValue(300)
    await Promise.all([
      trustAgentExactRepeat(signatureA, 'system_shell', 'high'),
      trustAgentExactRepeat(signatureB, 'code_execution', 'high'),
    ])
    await expect(useAgentTrustedAction(signatureA)).resolves.toBe(true)

    const actions = await listAgentTrustedActions()
    expect(actions).toHaveLength(2)
    expect(actions.find((action) => action.toolName === 'system_shell')?.lastUsedAt).toBe(300)
    vi.restoreAllMocks()
  })

  it('revokes one action or all actions without accepting arbitrary identifiers', async () => {
    const first = await trustAgentExactRepeat(signatureA, 'system_shell', 'high')
    await trustAgentExactRepeat(signatureB, 'code_execution', 'high')

    await expect(revokeAgentTrustedAction('../signature')).resolves.toBe(false)
    await expect(revokeAgentTrustedAction(first.id)).resolves.toBe(true)
    await expect(useAgentTrustedAction(signatureA)).resolves.toBe(false)
    await expect(revokeAllAgentTrustedActions()).resolves.toBe(1)
    await expect(listAgentTrustedActions()).resolves.toEqual([])
  })

  it('does not mutate in-memory authority when secure persistence fails', async () => {
    await trustAgentExactRepeat(signatureA, 'system_shell', 'high')
    mocks.setSecureValue.mockRejectedValueOnce(new Error('secure storage unavailable'))

    await expect(revokeAllAgentTrustedActions()).rejects.toThrow('secure storage unavailable')
    await expect(listAgentTrustedActions()).resolves.toHaveLength(1)
  })
})

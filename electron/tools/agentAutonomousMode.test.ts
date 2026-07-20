import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSecureValueAsync: vi.fn(),
  setSecureValueAsync: vi.fn(),
}))

vi.mock('../secureStorage', () => ({
  getSecureValueAsync: mocks.getSecureValueAsync,
  setSecureValueAsync: mocks.setSecureValueAsync,
}))

import {
  isAgentAutonomousModeEnabled,
  resetAgentAutonomousModeCacheForTests,
  setAgentAutonomousModeEnabled,
} from './agentAutonomousMode'

describe('main-owned Agent Mode autonomous policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAgentAutonomousModeCacheForTests()
    mocks.getSecureValueAsync.mockResolvedValue('')
    mocks.setSecureValueAsync.mockResolvedValue(true)
  })

  it('defaults off and persists explicit enablement in secure storage', async () => {
    await expect(isAgentAutonomousModeEnabled()).resolves.toBe(false)
    await expect(setAgentAutonomousModeEnabled(true)).resolves.toBe(true)
    expect(mocks.setSecureValueAsync).toHaveBeenCalledWith('agentAutonomousModeEnabled', 'enabled')
    await expect(isAgentAutonomousModeEnabled()).resolves.toBe(true)
  })

  it('fails closed when the authority setting cannot be persisted', async () => {
    mocks.setSecureValueAsync.mockResolvedValue(false)
    await expect(setAgentAutonomousModeEnabled(true)).rejects.toThrow('persisted securely')
    await expect(isAgentAutonomousModeEnabled()).resolves.toBe(false)
  })
})

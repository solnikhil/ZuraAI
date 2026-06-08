import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveProviderCredential, CredentialReadError } from './credentials'

vi.mock('../../secureStorage', () => ({
  getSecureValueAsync: vi.fn(),
}))

import { getSecureValueAsync } from '../../secureStorage'

const mockGetSecureValue = vi.mocked(getSecureValueAsync)

describe('resolveProviderCredential', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('resolves to the trimmed string when getSecureValueAsync returns a non-empty value', async () => {
    mockGetSecureValue.mockResolvedValue('tvly-abc123')
    const result = await resolveProviderCredential('tavilyApiKey')
    expect(result).toBe('tvly-abc123')
    expect(mockGetSecureValue).toHaveBeenCalledWith('tavilyApiKey')
  })

  it('resolves to null when getSecureValueAsync returns an empty string', async () => {
    mockGetSecureValue.mockResolvedValue('')
    const result = await resolveProviderCredential('tavilyApiKey')
    expect(result).toBeNull()
  })

  it('resolves to null when getSecureValueAsync returns a whitespace-only string', async () => {
    mockGetSecureValue.mockResolvedValue('   ')
    const result = await resolveProviderCredential('tavilyApiKey')
    expect(result).toBeNull()
  })

  it('throws CredentialReadError when getSecureValueAsync throws', async () => {
    const originalError = new Error('OS keychain unavailable')
    mockGetSecureValue.mockRejectedValue(originalError)

    await expect(resolveProviderCredential('tavilyApiKey')).rejects.toThrow(CredentialReadError)

    try {
      await resolveProviderCredential('tavilyApiKey')
    } catch (error) {
      expect(error).toBeInstanceOf(CredentialReadError)
      expect((error as CredentialReadError).cause).toBe(originalError)
      expect((error as CredentialReadError).message).toContain('tavilyApiKey')
    }
  })
})

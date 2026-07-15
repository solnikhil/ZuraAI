import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  SECURE_API_KEY_NAMES,
  SECURE_API_KEY_PRESENT_VALUE,
  loadApiKeyPresenceFromSecureStorage,
  migrateApiKeysFromLocalStorage,
  saveApiKeyToSecureStorage,
} from './secureApiKeys'

type SecureApiKeyName = (typeof SECURE_API_KEY_NAMES)[number]
const secureStorage = { set: vi.fn(), getPresence: vi.fn() }
const storedLocalValues: Record<string, string> = {}
const localStorage = {
  getItem: vi.fn((key: string) => storedLocalValues[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storedLocalValues[key] = value
  }),
}

describe('secure API key boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(storedLocalValues)) delete storedLocalValues[key]
    ;(global as any).window = { secureStorage, localStorage }
    Object.defineProperty(global, 'localStorage', { value: localStorage, writable: true })
  })

  afterEach(() => {
    delete (global as any).window
  })

  it('exposes only presence placeholders, never stored values', async () => {
    const keyArbitrary = fc.constantFrom(...SECURE_API_KEY_NAMES) as fc.Arbitrary<SecureApiKeyName>
    await fc.assert(
      fc.asyncProperty(keyArbitrary, async (key) => {
        secureStorage.getPresence.mockResolvedValue({ [key]: true })
        const values = await loadApiKeyPresenceFromSecureStorage()
        expect(values[key]).toBe(SECURE_API_KEY_PRESENT_VALUE)
        expect(JSON.stringify(values)).not.toContain('real-secret')
      }),
      { numRuns: 30 }
    )
  })

  it('writes replacement values without reading them back into the renderer', async () => {
    const keyArbitrary = fc.constantFrom(...SECURE_API_KEY_NAMES) as fc.Arbitrary<SecureApiKeyName>
    const valueArbitrary = fc.string({ minLength: 1, maxLength: 100 })
    secureStorage.set.mockResolvedValue(true)
    await fc.assert(
      fc.asyncProperty(keyArbitrary, valueArbitrary, async (key, value) => {
        await expect(saveApiKeyToSecureStorage(key, value)).resolves.toBe(true)
        expect(secureStorage.set).toHaveBeenCalledWith(key, value)
      }),
      { numRuns: 30 }
    )
  })

  it('migrates legacy provider keys through the write-only bridge', async () => {
    secureStorage.set.mockResolvedValue(true)
    await expect(
      migrateApiKeysFromLocalStorage({ alibabaApiKey: 'legacy-key', fireworksApiKey: '' })
    ).resolves.toBe(true)
    expect(secureStorage.set).toHaveBeenCalledWith('alibabaApiKey', 'legacy-key')
  })
})

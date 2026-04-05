/**
 * Property-Based Tests for Secure API Keys Storage
 *
 * These tests verify the correctness properties for secure storage of API keys
 * including OpenRouter, Perplexity, Groq, Tavily, Alibaba, and Fireworks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import {
  loadApiKeysFromSecureStorage,
  saveApiKeyToSecureStorage,
  migrateApiKeysFromLocalStorage,
} from './secureApiKeys'

// Mock window.secureStorage
const mockSecureStorage = {
  get: vi.fn(),
  set: vi.fn(),
}

// Mock localStorage
const mockLocalStorage: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    mockLocalStorage[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete mockLocalStorage[key]
  }),
  clear: vi.fn(() => {
    Object.keys(mockLocalStorage).forEach((key) => delete mockLocalStorage[key])
  }),
}

describe('Secure API Keys Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset localStorage mock
    Object.keys(mockLocalStorage).forEach((key) => delete mockLocalStorage[key])
    // Setup window.secureStorage mock
    ;(global as any).window = {
      secureStorage: mockSecureStorage,
      localStorage: localStorageMock,
    }
    Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (global as any).window
  })
  describe('Property 8: Secure Storage Round-Trip', () => {
    // Arbitrary for generating valid API keys (non-empty strings that could be real API keys)
    const apiKeyArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0)

    // Arbitrary for generating API key names
    const apiKeyNameArb = fc.constantFrom(
      'openRouterApiKey',
      'perplexityApiKey',
      'groqApiKey',
      'tavilyApiKey',
      'alibabaApiKey',
      'fireworksApiKey'
    ) as fc.Arbitrary<
      | 'openRouterApiKey'
      | 'perplexityApiKey'
      | 'groqApiKey'
      | 'tavilyApiKey'
      | 'alibabaApiKey'
      | 'fireworksApiKey'
    >

    it('should return identical value after save and load for any API key', async () => {
      await fc.assert(
        fc.asyncProperty(apiKeyNameArb, apiKeyArb, async (keyName, keyValue) => {
          // Setup mock to simulate successful save
          mockSecureStorage.set.mockResolvedValue(true)

          // Setup mock to return empty for other keys and saved value for this key
          mockSecureStorage.get.mockImplementation((key: string) =>
            Promise.resolve(key === keyName ? keyValue : '')
          )

          // Save the key
          const saveResult = await saveApiKeyToSecureStorage(keyName, keyValue)
          expect(saveResult).toBe(true)

          // Load all keys
          const loadedKeys = await loadApiKeysFromSecureStorage()

          // Property: The loaded value should be identical to the saved value
          expect(loadedKeys[keyName]).toBe(keyValue)
        }),
        { numRuns: 100 }
      )
    })

    it('should preserve alibabaApiKey specifically through round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(apiKeyArb, async (keyValue) => {
          // Setup mock to simulate successful save
          mockSecureStorage.set.mockResolvedValue(true)

          mockSecureStorage.get.mockImplementation((key: string) =>
            Promise.resolve(key === 'alibabaApiKey' ? keyValue : '')
          )

          // Save the Alibaba API key
          const saveResult = await saveApiKeyToSecureStorage('alibabaApiKey', keyValue)
          expect(saveResult).toBe(true)

          // Load all keys
          const loadedKeys = await loadApiKeysFromSecureStorage()

          // Property: The loaded alibabaApiKey should be identical to the saved value
          expect(loadedKeys.alibabaApiKey).toBe(keyValue)
        }),
        { numRuns: 100 }
      )
    })

    it('should preserve fireworksApiKey specifically through round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(apiKeyArb, async (keyValue) => {
          mockSecureStorage.set.mockResolvedValue(true)

          mockSecureStorage.get.mockImplementation((key: string) =>
            Promise.resolve(key === 'fireworksApiKey' ? keyValue : '')
          )

          const saveResult = await saveApiKeyToSecureStorage('fireworksApiKey', keyValue)
          expect(saveResult).toBe(true)

          const loadedKeys = await loadApiKeysFromSecureStorage()

          expect(loadedKeys.fireworksApiKey).toBe(keyValue)
        }),
        { numRuns: 100 }
      )
    })

    it('should return empty string for missing keys', async () => {
      await fc.assert(
        fc.asyncProperty(apiKeyNameArb, async (keyName) => {
          // Setup mock to return empty values (no keys stored)
          mockSecureStorage.get.mockResolvedValue('')

          // Load all keys
          const loadedKeys = await loadApiKeysFromSecureStorage()

          // Property: Missing keys should return empty string
          expect(loadedKeys[keyName]).toBe('')
        }),
        { numRuns: 100 }
      )
    })

    it('should handle multiple keys stored simultaneously', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            openRouterApiKey: apiKeyArb,
            perplexityApiKey: apiKeyArb,
            groqApiKey: apiKeyArb,
            tavilyApiKey: apiKeyArb,
            alibabaApiKey: apiKeyArb,
            fireworksApiKey: apiKeyArb,
          }),
          async (allKeys) => {
            mockSecureStorage.get.mockImplementation((key: string) =>
              Promise.resolve((allKeys as Record<string, string>)[key] ?? '')
            )

            // Load all keys
            const loadedKeys = await loadApiKeysFromSecureStorage()

            // Property: All keys should be preserved
            expect(loadedKeys.openRouterApiKey).toBe(allKeys.openRouterApiKey)
            expect(loadedKeys.perplexityApiKey).toBe(allKeys.perplexityApiKey)
            expect(loadedKeys.groqApiKey).toBe(allKeys.groqApiKey)
            expect(loadedKeys.tavilyApiKey).toBe(allKeys.tavilyApiKey)
            expect(loadedKeys.alibabaApiKey).toBe(allKeys.alibabaApiKey)
            expect(loadedKeys.fireworksApiKey).toBe(allKeys.fireworksApiKey)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return defaults when secureStorage is unavailable', async () => {
      // Remove secureStorage from window
      ;(global as any).window = {}

      await fc.assert(
        fc.asyncProperty(apiKeyNameArb, async (keyName) => {
          // Load all keys (should return defaults)
          const loadedKeys = await loadApiKeysFromSecureStorage()

          // Property: All keys should be empty strings when storage unavailable
          expect(loadedKeys[keyName]).toBe('')
        }),
        { numRuns: 100 }
      )
    })

    it('should return false when saving with unavailable secureStorage', async () => {
      // Remove secureStorage from window
      ;(global as any).window = {}

      const saveKeyArb = fc.constantFrom(
        'openRouterApiKey',
        'perplexityApiKey',
        'groqApiKey',
        'tavilyApiKey',
        'alibabaApiKey',
        'fireworksApiKey'
      ) as fc.Arbitrary<
        | 'openRouterApiKey'
        | 'perplexityApiKey'
        | 'groqApiKey'
        | 'tavilyApiKey'
        | 'alibabaApiKey'
        | 'fireworksApiKey'
      >

      await fc.assert(
        fc.asyncProperty(saveKeyArb, apiKeyArb, async (keyName, keyValue) => {
          // Try to save
          const saveResult = await saveApiKeyToSecureStorage(keyName, keyValue)

          // Property: Save should return false when storage unavailable
          expect(saveResult).toBe(false)
        }),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Additional property tests for migration logic
   */
  describe('Migration Logic Properties', () => {
    it('should migrate alibabaApiKey from localStorage to secure storage', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
          async (alibabaKey) => {
            // Reset migration flag
            delete mockLocalStorage['zura-api-keys-migrated']

            // Setup mock to simulate successful save
            mockSecureStorage.set.mockResolvedValue(true)

            // Settings object with alibabaApiKey
            const settings = {
              alibabaApiKey: alibabaKey,
              fireworksApiKey: '',
            }

            // Migrate
            const result = await migrateApiKeysFromLocalStorage(settings)

            // Property: Migration should succeed
            expect(result).toBe(true)

            // Property: secureStorage.set should have been called with alibabaApiKey
            expect(mockSecureStorage.set).toHaveBeenCalledWith('alibabaApiKey', alibabaKey)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should skip migration if already migrated', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
          async (alibabaKey) => {
            // Set migration flag
            mockLocalStorage['zura-api-keys-migrated'] = 'true'

            // Settings object with alibabaApiKey
            const settings = {
              alibabaApiKey: alibabaKey,
              fireworksApiKey: '',
            }

            // Migrate
            const result = await migrateApiKeysFromLocalStorage(settings)

            // Property: Migration should return true (already done)
            expect(result).toBe(true)

            // Property: secureStorage.set should NOT have been called
            expect(mockSecureStorage.set).not.toHaveBeenCalled()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should not migrate empty or whitespace-only keys', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom('', '   ', '\t', '\n', '  \t  '), async (emptyKey) => {
          // Reset migration flag
          delete mockLocalStorage['zura-api-keys-migrated']

          // Setup mock
          mockSecureStorage.set.mockResolvedValue(true)

          // Settings object with empty alibabaApiKey
          const settings = {
            alibabaApiKey: emptyKey,
            fireworksApiKey: '',
          }

          // Migrate
          await migrateApiKeysFromLocalStorage(settings)

          // Property: secureStorage.set should NOT have been called for empty keys
          expect(mockSecureStorage.set).not.toHaveBeenCalledWith('alibabaApiKey', expect.anything())
        }),
        { numRuns: 100 }
      )
    })
  })
})

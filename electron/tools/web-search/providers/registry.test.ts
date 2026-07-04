// @vitest-environment node

/**
 * Unit tests for `providers/registry.ts` — provider registration and resolution.
 *
 * The registry has module-level state and the Tavily provider may already be
 * registered if service.ts was imported. To keep tests isolated, we use unique
 * mock provider ids that won't collide with the real Tavily provider.
 *
 * Requirements: 4.2, 4.3, 4.4
 */

import { describe, it, expect } from 'vitest'

import { registerProvider, resolveProvider, listProviders } from './registry'
import type { SearchProvider } from './types'

// ---------------------------------------------------------------------------
// Helpers — mock providers with unique ids (cast to SearchProviderId)
// ---------------------------------------------------------------------------

let mockIdCounter = 0

function createMockProvider(overrides?: Partial<SearchProvider>): SearchProvider {
  mockIdCounter++
  const id = `__test_provider_${mockIdCounter}_${Date.now()}` as SearchProvider['id']
  return {
    id,
    credentialKey: 'tavilyApiKey',
    capabilities: { search: true, extract: true },
    search: async () => ({ ok: false, error: 'not implemented' }),
    extract: async () => ({ ok: false, error: 'not implemented' }),
    ...overrides,
  } as SearchProvider
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('providers/registry', () => {
  describe('resolveProvider() returns the active provider', () => {
    it('returns a provider after at least one has been registered', () => {
      const provider = createMockProvider()
      registerProvider(provider)

      // resolveProvider() without an id should return an active provider
      const resolved = resolveProvider()
      expect(resolved).toBeDefined()
      expect(resolved.id).toBeDefined()
      expect(typeof resolved.id).toBe('string')
    })
  })

  describe('resolveProvider(id) returns the matching provider by id', () => {
    it('resolves a specific provider by its id', () => {
      const provider = createMockProvider()
      registerProvider(provider)

      const resolved = resolveProvider(provider.id)
      expect(resolved).toBe(provider)
      expect(resolved.id).toBe(provider.id)
    })
  })

  describe('resolveProvider with unknown id throws descriptive error', () => {
    it('throws an error containing the unknown id', () => {
      const unknownId = `__nonexistent_${Date.now()}` as SearchProvider['id']

      expect(() => resolveProvider(unknownId)).toThrow()
      try {
        resolveProvider(unknownId)
      } catch (err: unknown) {
        const message = (err as Error).message
        expect(message).toContain(unknownId)
        expect(message.length).toBeGreaterThan(0)
      }
    })
  })

  describe('first registered provider becomes the default', () => {
    it('resolveProvider() returns the first registered even after more are registered', () => {
      const first = createMockProvider()
      const second = createMockProvider()

      registerProvider(first)
      registerProvider(second)

      // The active (default) provider should still be the first one that was
      // registered across the module's lifetime. Since module state accumulates,
      // the active provider was set on the very first `registerProvider` call
      // ever in this test suite. We verify that calling resolveProvider() does
      // not return `second` (the most recently registered).
      const resolved = resolveProvider()
      expect(resolved.id).not.toBe(second.id)
    })
  })

  describe('re-registering same id updates the provider object', () => {
    it('updates the provider but does not change the active provider', () => {
      const originalProvider = createMockProvider()
      const updatedProvider = createMockProvider({
        id: originalProvider.id,
      } as Partial<SearchProvider>)
      // Force same id
      ;(updatedProvider as { id: SearchProvider['id'] }).id = originalProvider.id

      registerProvider(originalProvider)

      // Capture active before re-registration
      const activeBefore = resolveProvider()

      // Re-register with same id but different object
      const replacement: SearchProvider = {
        ...originalProvider,
        capabilities: { search: true, extract: false },
        search: async () => ({ ok: false, error: 'updated' }),
        extract: async () => ({ ok: false, error: 'updated' }),
      }
      registerProvider(replacement)

      // The provider object should be updated
      const resolved = resolveProvider(originalProvider.id)
      expect(resolved).toBe(replacement)
      expect(resolved.capabilities.extract).toBe(false)

      // The active provider should not change
      const activeAfter = resolveProvider()
      expect(activeAfter.id).toBe(activeBefore.id)
    })
  })

  describe('listProviders()', () => {
    it('includes registered providers', () => {
      const provider = createMockProvider()
      registerProvider(provider)

      const all = listProviders()
      const found = all.find((p) => p.id === provider.id)
      expect(found).toBe(provider)
    })
  })
})

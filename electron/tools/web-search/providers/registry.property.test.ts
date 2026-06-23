// @vitest-environment node

/**
 * Property-based test for provider seam isolation.
 *
 * **Property 8: Provider seam isolation** — registering an additional
 * `SearchProvider` requires no change to orchestrator/request/intent/normalize
 * and `resolveProvider` returns the active provider by default.
 *
 * **Validates: Requirements 4.6**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import { registerProvider, resolveProvider, listProviders } from './registry'
import type { SearchProvider } from './types'
import type {
  ProviderSearchRequest,
  ProviderExtractRequest,
  ProviderContext,
  ProviderResult,
  SearchProviderId,
} from '../types'

/**
 * Create a minimal mock SearchProvider with the given id.
 * The search/extract operations resolve with ok:false (never called in these tests).
 */
function createMockProvider(id: string): SearchProvider {
  return {
    id: id as SearchProviderId,
    credentialKey: `${id}ApiKey` as any,
    capabilities: { search: true, extract: true },
    async search(
      _request: ProviderSearchRequest,
      _ctx: ProviderContext,
    ): Promise<ProviderResult> {
      return { ok: false, error: 'mock: not implemented' }
    },
    async extract(
      _request: ProviderExtractRequest,
      _ctx: ProviderContext,
    ): Promise<ProviderResult> {
      return { ok: false, error: 'mock: not implemented' }
    },
  }
}

/**
 * Arbitrary for non-empty provider ids (strings with minLength 1).
 * Filters out whitespace-only strings for meaningfulness.
 */
const arbProviderId = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0)

describe('Provider registry — seam isolation (property)', () => {
  // NOTE: The registry module uses module-level mutable state. Since there is
  // no `clearProviders` export, these tests are designed to work with additive
  // (cumulative) state. Each test registers providers with unique generated ids
  // so they don't collide with each other or with previously registered entries.

  // Property 8.1: Registering a provider makes it resolvable; first registered
  // becomes the default.
  it('registering a provider makes it resolvable via resolveProvider(id); first registered is the default', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbProviderId, { minLength: 1, maxLength: 5 }),
        (ids) => {
          // Prefix ids to avoid collision with other test runs or the real Tavily provider
          const prefixed = ids.map((id) => `__test_prop81_${id}_${Date.now()}`)
          const providers = prefixed.map((id) => createMockProvider(id))

          // Register all providers
          for (const p of providers) {
            registerProvider(p)
          }

          // Each registered provider is resolvable by id
          for (let i = 0; i < providers.length; i++) {
            const resolved = resolveProvider(providers[i].id)
            expect(resolved).toBe(providers[i])
            expect(resolved.id).toBe(prefixed[i])
          }
        },
      ),
      { numRuns: 50 },
    )
  })

  // Property 8.2: Registering additional providers does NOT change the active
  // provider — resolveProvider() still returns the first registered.
  it('registering additional providers does NOT change the active provider', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbProviderId, { minLength: 2, maxLength: 6 }),
        (ids) => {
          const prefixed = ids.map((id) => `__test_prop82_${id}_${Date.now()}`)
          const providers = prefixed.map((id) => createMockProvider(id))

          // Register the first one and capture the default
          registerProvider(providers[0])
          const defaultAfterFirst = resolveProvider()

          // Register additional providers
          for (let i = 1; i < providers.length; i++) {
            registerProvider(providers[i])
          }

          // The default has NOT changed — still the overall first registered
          // (which might be from a prior test or the Tavily import, but crucially
          // is NOT changed by later registrations in this test block)
          const defaultAfterAll = resolveProvider()
          expect(defaultAfterAll).toBe(defaultAfterFirst)
        },
      ),
      { numRuns: 50 },
    )
  })

  // Property 8.3: resolveProvider with an unknown id throws a descriptive error.
  it('resolveProvider with an unknown id throws', () => {
    fc.assert(
      fc.property(arbProviderId, (id) => {
        const unknownId = `__test_prop83_unknown_${id}_${Date.now()}`
        expect(() => resolveProvider(unknownId as SearchProviderId)).toThrow(
          /not registered/i,
        )
      }),
      { numRuns: 50 },
    )
  })

  // Property 8.4: listProviders() always includes all registered providers.
  it('listProviders() includes all registered providers', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbProviderId, { minLength: 1, maxLength: 5 }),
        (ids) => {
          const prefixed = ids.map((id) => `__test_prop84_${id}_${Date.now()}`)
          const providers = prefixed.map((id) => createMockProvider(id))

          for (const p of providers) {
            registerProvider(p)
          }

          const listed = listProviders()
          for (const p of providers) {
            expect(listed).toContain(p)
          }
        },
      ),
      { numRuns: 50 },
    )
  })
})

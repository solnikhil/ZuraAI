// ---------------------------------------------------------------------------
// Provider registry (web-search-backend-rebuild)
//
// The pluggable seam. Holds the set of available providers and resolves the
// active one. The first provider registered becomes the active provider
// (Tavily registers itself at module load in a later task). Re-registering the
// same id updates the existing entry.
//
// Adding a new `SearchProvider` here requires no change to the orchestrator,
// request normalizer, intent classifier, or result normalizer.
// ---------------------------------------------------------------------------

import type { SearchProvider, SearchProviderId } from './types'

/** Internal module-level registry of providers keyed by id. */
const providers = new Map<SearchProviderId, SearchProvider>()

/** The active provider id; defaults to the first registered provider. */
let activeProviderId: SearchProviderId | null = null

/**
 * Register a provider. The first provider registered becomes the active
 * provider. Re-registering the same id updates the stored provider without
 * changing the active pointer.
 */
export function registerProvider(provider: SearchProvider): void {
  providers.set(provider.id, provider)
  if (activeProviderId === null) {
    activeProviderId = provider.id
  }
}

/**
 * Resolve a provider.
 *
 * - With no id, returns the active provider; throws a descriptive error when no
 *   provider has been registered.
 * - With an id, returns the matching registered provider; throws a descriptive
 *   error naming the unknown/unregistered provider id. Never returns an
 *   unregistered provider.
 */
export function resolveProvider(id?: SearchProviderId): SearchProvider {
  if (id === undefined) {
    if (activeProviderId === null) {
      throw new Error('No search provider is registered; cannot resolve the active provider.')
    }
    const active = providers.get(activeProviderId)
    if (!active) {
      throw new Error(
        `Active search provider "${activeProviderId}" is not registered; cannot resolve it.`,
      )
    }
    return active
  }

  const provider = providers.get(id)
  if (!provider) {
    throw new Error(`Search provider "${id}" is not registered.`)
  }
  return provider
}

/**
 * Return a readonly snapshot of all registered providers.
 */
export function listProviders(): readonly SearchProvider[] {
  return Array.from(providers.values())
}

// ---------------------------------------------------------------------------
// SearchProvider interface (web-search-backend-rebuild)
//
// The canonical provider-seam types (SearchProviderId, SecureStorageKey,
// ProviderCapabilities, ProviderContext, ProviderSearchRequest,
// ProviderExtractRequest, ProviderResult, WebSearchData) live in
// `electron/tools/web-search/types.ts`. This module only adds the
// `SearchProvider` interface every provider implements, and re-exports the
// shared seam types for convenient single-import access from provider modules.
// ---------------------------------------------------------------------------

import type {
  SearchProviderId,
  SecureStorageKey,
  ProviderCapabilities,
  ProviderContext,
  ProviderSearchRequest,
  ProviderExtractRequest,
  ProviderResult,
} from '../types'

export type {
  SearchProviderId,
  SecureStorageKey,
  ProviderCapabilities,
  ProviderContext,
  ProviderSearchRequest,
  ProviderExtractRequest,
  ProviderResult,
  WebSearchData,
} from '../types'

/**
 * Stable contract every search provider implements. This is the abstraction
 * that makes adding providers easy: a provider declares its identity, the
 * secure-storage key backing its credential, and which operations it supports,
 * then implements one transport call per operation that resolves to a
 * normalized `ProviderResult` (never throwing).
 */
export interface SearchProvider {
  /** Stable identifier used by the registry to resolve this provider. */
  readonly id: SearchProviderId
  /** Secure-storage key whose stored secret backs this provider's credential. */
  readonly credentialKey: SecureStorageKey
  /** Declares which operations this provider can perform. */
  readonly capabilities: ProviderCapabilities
  /**
   * Perform a single search transport call. Resolves to a normalized
   * `ProviderResult`; transport/parse errors are captured into
   * `{ ok: false, error }` rather than thrown.
   */
  search(request: ProviderSearchRequest, ctx: ProviderContext): Promise<ProviderResult>
  /**
   * Perform a single URL-extraction transport call. Resolves to a normalized
   * `ProviderResult`; transport/parse errors are captured into
   * `{ ok: false, error }` rather than thrown.
   */
  extract(request: ProviderExtractRequest, ctx: ProviderContext): Promise<ProviderResult>
}

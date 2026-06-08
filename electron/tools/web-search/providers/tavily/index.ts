// ---------------------------------------------------------------------------
// Tavily provider (web-search-backend-rebuild)
//
// Concrete `SearchProvider` implementation for Tavily. This module is the thin
// wiring layer that composes the pure transport (`transport.ts`) and the pure
// mapper (`mapper.ts`) into a normalized `ProviderResult`:
//
//   transport (raw HTTP outcome) -> mapper (payload -> WebSearchData) -> ProviderResult
//
// Both `search` and `extract` NEVER throw: transport already captures network,
// abort/timeout, non-OK status, and parse errors into `{ ok: false }`, and a
// defensive try/catch here ensures any unexpected mapper or runtime error is
// also captured into `{ ok: false, error }` (Req 7.6 / 8.7).
//
// Registering the provider is the only "add a provider" touchpoint: declaring
// `id`/`credentialKey`/`capabilities` and calling `registerProvider` at module
// load wires Tavily into the registry without any orchestrator change
// (Req 4.1 / 4.5).
// ---------------------------------------------------------------------------

import { registerProvider } from '../registry'
import type { SearchProvider } from '../types'
import type {
  ProviderContext,
  ProviderExtractRequest,
  ProviderResult,
  ProviderSearchRequest,
} from '../../types'
import { tavilyExtract, tavilySearch } from './transport'
import { mapTavilyExtractPayload, mapTavilySearchPayload } from './mapper'

/** Extract a human-readable message from an unknown thrown value. */
function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/**
 * Perform one Tavily `/search` transport call and map the raw payload into a
 * normalized `ProviderResult`. Resolves to `{ ok: false, error }` on transport
 * failure (already captured by the transport layer) or on any unexpected
 * mapper/runtime error; never throws (Req 7.6).
 */
async function search(
  request: ProviderSearchRequest,
  ctx: ProviderContext,
): Promise<ProviderResult> {
  try {
    const transport = await tavilySearch(request, ctx)
    if (!transport.ok) {
      return { ok: false, error: transport.error }
    }
    return mapTavilySearchPayload(transport.payload, request)
  } catch (error: unknown) {
    return { ok: false, error: messageOf(error, 'Failed to search with Tavily') }
  }
}

/**
 * Perform one Tavily `/extract` transport call and map the raw payload into a
 * normalized `ProviderResult`. Resolves to `{ ok: false, error }` on transport
 * failure (already captured by the transport layer) or on any unexpected
 * mapper/runtime error; never throws (Req 8.7).
 */
async function extract(
  request: ProviderExtractRequest,
  ctx: ProviderContext,
): Promise<ProviderResult> {
  try {
    const transport = await tavilyExtract(request, ctx)
    if (!transport.ok) {
      return { ok: false, error: transport.error }
    }
    return mapTavilyExtractPayload(transport.payload, request)
  } catch (error: unknown) {
    return { ok: false, error: messageOf(error, 'Failed to extract with Tavily') }
  }
}

/**
 * The concrete Tavily `SearchProvider`. Declares both `search` and `extract`
 * capabilities and is backed by the `tavilyApiKey` secure-storage secret.
 */
export const tavilyProvider: SearchProvider = {
  id: 'tavily',
  credentialKey: 'tavilyApiKey',
  capabilities: { search: true, extract: true },
  search,
  extract,
}

// Register Tavily at module load so the registry resolves it as the active
// provider (Req 4.1). Importing this module is the only step required to wire
// Tavily into the pipeline.
registerProvider(tavilyProvider)

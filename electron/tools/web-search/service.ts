// ---------------------------------------------------------------------------
// Web search orchestrator (web-search-backend-rebuild)
//
// THIN, no-fallback coordination module. Owns the single public entry point
// `executeWebSearch` and dispatches EXACTLY ONE provider operation per
// invocation (`search` XOR `extract`), decided purely by the classified intent.
//
// It contains NO fallback logic and NO provider-specific knowledge:
//   normalize -> classify -> resolve provider -> resolve credential ->
//   dispatch one call -> wrap the outcome in a `ToolResult`.
//
// The whole body is wrapped in try/catch so the function NEVER throws and
// ALWAYS resolves to a `ToolResult` (Req 1.3). On any unexpected error it
// resolves to `{ success: false, error }` (Req 1.4).
// ---------------------------------------------------------------------------

import type { ToolResult } from '../types'
import { normalizeRequest } from './request'
import { classifyWebInput, reformulateQuery } from './intent'
import { resolveProvider } from './providers/registry'
// Side-effect import: registering the Tavily provider at module load so
// `resolveProvider()` can resolve it as the active provider (Req 4.1).
import './providers/tavily'
import { CredentialReadError, resolveProviderCredential } from './credentials'
import { logWebSearchFailure } from './logging'
import type {
  ProviderContext,
  ProviderExtractRequest,
  ProviderResult,
  ProviderSearchRequest,
  WebSearchArgs,
} from './types'

/** Extract a human-readable message from an unknown thrown value. */
function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/**
 * The single public entry point for the web-search tool.
 *
 * Always resolves to a `ToolResult`; never throws and never rejects (Req 1.3).
 * Dispatches at most one provider transport call per invocation, with no
 * fallback to any other backend, intent, query, or provider.
 */
export async function executeWebSearch(args: WebSearchArgs): Promise<ToolResult> {
  try {
    // 1. Validate + normalize untrusted input. A `ToolResult` here means a
    //    validation failure (discriminated via `'success' in result`).
    const normalized = normalizeRequest(args)
    if ('success' in normalized) {
      logWebSearchFailure({
        stage: 'validation',
        hasApiKey: false,
        error: normalized.error || 'Validation failed',
        query: typeof args?.query === 'string' ? args.query : undefined,
      })
      return normalized
    }

    // 2. Classify intent deterministically (pure, no I/O).
    const classified = classifyWebInput(normalized.query, normalized.urls)

    // 3. Resolve the active provider (Tavily). Defensive try/catch keeps the
    //    function total even if the registry cannot resolve a provider.
    const provider = resolveProvider()

    // 4. Resolve the provider credential. Distinguish "absent" (null) from
    //    "could not be read" (CredentialReadError).
    let apiKey: string | null
    try {
      apiKey = await resolveProviderCredential(provider.credentialKey)
    } catch (error: unknown) {
      if (error instanceof CredentialReadError) {
        const readError =
          'The Tavily API key could not be read from secure storage. Please re-enter it in Settings > Search APIs.'
        logWebSearchFailure({
          stage: 'credential',
          intent: classified.intent,
          hasApiKey: false,
          error: messageOf(error, readError),
          query: normalized.query,
        })
        return { success: false, error: readError }
      }
      // Unexpected error: rethrow into the outer catch so it is handled once.
      throw error
    }

    // 5. Missing/empty/whitespace credential: surface the configuration error
    //    and dispatch NO transport call. No silent substitution (Req 5.2/5.3).
    if (!apiKey) {
      return {
        success: false,
        error: 'Add a Tavily API key in Settings > Search APIs to use web search.',
      }
    }

    // 6. Build the runtime context. The orchestrator guarantees a non-empty key.
    const ctx: ProviderContext = { apiKey }

    // 7. Dispatch EXACTLY ONE provider call based on intent (search XOR extract).
    let result: ProviderResult
    if (classified.intent === 'query_search') {
      if (!provider.capabilities.search) {
        return { success: false, error: 'Active search provider does not support search.' }
      }

      const searchRequest: ProviderSearchRequest = {
        query: reformulateQuery(classified.queryWithoutUrls || classified.originalQuery),
        numResults: normalized.numResults,
        searchDepth: normalized.searchDepth,
        includeImages: normalized.includeImages,
        timeRange: normalized.timeRange,
        topic: normalized.topic,
      }
      result = await provider.search(searchRequest, ctx)
    } else {
      if (!provider.capabilities.extract) {
        return {
          success: false,
          error: 'Active search provider does not support URL extraction.',
        }
      }

      const extractRequest: ProviderExtractRequest = {
        urls: classified.urls,
        query: classified.queryWithoutUrls || undefined,
        includeImages: normalized.includeImages,
        intent: classified.intent,
      }
      result = await provider.extract(extractRequest, ctx)
    }

    // 8/9. Surface the single dispatched outcome. No fallback on failure.
    if (result.ok) {
      return { success: true, data: result.data }
    }

    logWebSearchFailure({
      stage: 'provider',
      intent: classified.intent,
      hasApiKey: true,
      error: result.error,
      query: normalized.query,
      apiKey,
    })
    return { success: false, error: result.error }
  } catch (error: unknown) {
    // 10. The function must never throw. Any unexpected error becomes a
    //     `success: false` ToolResult (Req 1.3, 1.4).
    const errorMessage = messageOf(error, 'Web search failed unexpectedly.')
    logWebSearchFailure({
      stage: 'unexpected',
      hasApiKey: false,
      error: errorMessage,
      query: typeof args?.query === 'string' ? args.query : undefined,
    })
    return { success: false, error: errorMessage }
  }
}

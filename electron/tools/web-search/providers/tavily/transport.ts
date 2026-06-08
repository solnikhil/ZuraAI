// ---------------------------------------------------------------------------
// Tavily transport (web-search-backend-rebuild)
//
// This module is PURE HTTP. It builds the Tavily request body, performs exactly
// one `fetch` per call with an `AbortController` timeout, and returns a
// structured `TavilyTransportResult` describing the raw outcome. It NEVER
// throws: network, abort/timeout, non-OK status, and parse errors are all
// captured into `{ ok: false, error }`.
//
// Separation of concerns:
// - Mapping the raw `payload` into `WebSearchData` is the mapper's job
//   (`mapper.ts`, task 7.3).
// - Wiring transport + mapper into a `ProviderResult` is the provider's job
//   (`index.ts`, task 7.6).
//
// URL normalization choice (extract): the canonical, distinct, first-occurrence
// URL list is produced upstream by the intent classifier and threaded through
// `ProviderExtractRequest.urls`. To keep this module free of intent-module
// coupling and purely HTTP, transport treats `request.urls` as already
// normalized and only defensively drops empty entries, de-duplicates, and caps
// the list to `SEARCH_MAX_EXTRACT_URLS` before POSTing. An empty resulting list
// is surfaced as a transport failure (no request is dispatched).
// ---------------------------------------------------------------------------

import {
  SEARCH_EXTRACT_FETCH_TIMEOUT_MS,
  SEARCH_FETCH_TIMEOUT_MS,
  SEARCH_MAX_EXTRACT_URLS,
} from '../../constants'
import type {
  ProviderContext,
  ProviderExtractRequest,
  ProviderSearchRequest,
} from '../../types'

/** Tavily REST endpoints. */
const TAVILY_SEARCH_URL = 'https://api.tavily.com/search'
const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract'

/** Maximum number of characters of a non-OK response body surfaced in errors. */
const ERROR_BODY_MAX_LENGTH = 300

/** Longest extraction query forwarded to Tavily Extract before truncation. */
const EXTRACT_QUERY_MAX_LENGTH = 400

/**
 * Structured outcome of a single Tavily transport call.
 *
 * - `{ ok: true, payload }` — the response status was OK and the JSON body was
 *   parsed. `payload` is the raw, unmapped JSON value (mapping happens in
 *   `mapper.ts`).
 * - `{ ok: false, error }` — a non-OK HTTP status (with truncated body), an
 *   abort/timeout (`timedOut: true`), or a network/parse error. The resolved
 *   API key is never included in `error`.
 */
export type TavilyTransportResult =
  | { ok: true; payload: unknown }
  | { ok: false; error: string; timedOut?: boolean }

/**
 * Perform a single `fetch` with an `AbortController`-backed timeout. The timer
 * is always cleared in `finally`.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

/** Truncate a response body for safe inclusion in an error message. */
function truncateBody(body: string): string {
  if (body.length <= ERROR_BODY_MAX_LENGTH) return body
  return `${body.slice(0, ERROR_BODY_MAX_LENGTH)}...`
}

/** Detect an abort/timeout error from a `fetch` rejection. */
function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return true
    return error.message.toLowerCase().includes('abort')
  }
  return false
}

/** Extract a human-readable message from an unknown thrown value. */
function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/**
 * POST one Tavily `/search` request and return the raw transport outcome.
 *
 * Preconditions: `ctx.apiKey` is a non-empty string; `request.query` is the
 * normalized, non-empty query.
 */
export async function tavilySearch(
  request: ProviderSearchRequest,
  ctx: ProviderContext,
): Promise<TavilyTransportResult> {
  const body: Record<string, unknown> = {
    api_key: ctx.apiKey,
    query: request.query,
    search_depth: request.searchDepth,
    max_results: request.numResults,
    include_answer: false,
    include_raw_content: false,
    include_images: request.includeImages,
  }

  if (request.searchDepth === 'advanced') {
    body.chunks_per_source = 3
  }
  if (request.timeRange) {
    body.time_range = request.timeRange
  }
  if (request.topic) {
    body.topic = request.topic
  }

  try {
    const response = await fetchWithTimeout(
      TAVILY_SEARCH_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      SEARCH_FETCH_TIMEOUT_MS,
    )

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      return {
        ok: false,
        error: `Tavily API error: ${response.status} - ${truncateBody(errText)}`,
      }
    }

    const payload = await response.json()
    return { ok: true, payload }
  } catch (error: unknown) {
    if (isAbortError(error)) {
      return {
        ok: false,
        error: 'Search request timed out. Please try again.',
        timedOut: true,
      }
    }
    return { ok: false, error: messageOf(error, 'Failed to search with Tavily') }
  }
}

/**
 * POST one Tavily `/extract` request and return the raw transport outcome.
 *
 * Preconditions: `ctx.apiKey` is a non-empty string; `request.urls` carries the
 * normalized URL list produced by the intent classifier.
 */
export async function tavilyExtract(
  request: ProviderExtractRequest,
  ctx: ProviderContext,
): Promise<TavilyTransportResult> {
  const normalizedUrls = [
    ...new Set(
      request.urls
        .map((url) => (typeof url === 'string' ? url.trim() : ''))
        .filter((url) => url.length > 0),
    ),
  ].slice(0, SEARCH_MAX_EXTRACT_URLS)

  if (normalizedUrls.length === 0) {
    return { ok: false, error: 'No valid URL was found to extract from.' }
  }

  const cleanedQuery = typeof request.query === 'string' ? request.query.trim() : ''
  const extractionQuery =
    cleanedQuery.length > EXTRACT_QUERY_MAX_LENGTH
      ? `${cleanedQuery.slice(0, EXTRACT_QUERY_MAX_LENGTH - 3)}...`
      : cleanedQuery
  const extractDepth = extractionQuery ? 'advanced' : 'basic'

  const body: Record<string, unknown> = {
    api_key: ctx.apiKey,
    urls: normalizedUrls,
    format: 'markdown',
    extract_depth: extractDepth,
    include_images: request.includeImages,
    include_favicon: true,
  }

  if (extractionQuery) {
    body.query = extractionQuery
    body.chunks_per_source = 3
  }

  try {
    const response = await fetchWithTimeout(
      TAVILY_EXTRACT_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      SEARCH_EXTRACT_FETCH_TIMEOUT_MS,
    )

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      return {
        ok: false,
        error: `Tavily Extract API error: ${response.status} - ${truncateBody(errText)}`,
      }
    }

    const payload = await response.json()
    return { ok: true, payload }
  } catch (error: unknown) {
    if (isAbortError(error)) {
      return {
        ok: false,
        error: 'URL extraction timed out. Please try again.',
        timedOut: true,
      }
    }
    return { ok: false, error: messageOf(error, 'Failed to extract with Tavily') }
  }
}

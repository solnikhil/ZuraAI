// ---------------------------------------------------------------------------
// Tavily payload mapper (web-search-backend-rebuild)
//
// Pure mapping layer for the Tavily provider. These functions consume an
// already-parsed JSON payload (`unknown`) returned by the transport layer
// (`providers/tavily/transport.ts`) plus the normalized provider request, and
// produce a provider-agnostic `ProviderResult`. All result/image shaping is
// delegated to `normalize.ts`; this module performs NO I/O.
//
// Design references: web-search-backend-rebuild/design.md (Component 6) and the
// orchestration pseudocode for Tavily search/extract mapping.
// Requirements: 7.2, 7.3, 8.2, 8.3, 8.4, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3
// ---------------------------------------------------------------------------

import {
  compactMap,
  extractTavilyImages,
  getFailureMessage,
  isRecord,
  parseTavilyImage,
  parseTavilyExtractResult,
  parseTavilySearchResult,
} from '../../normalize'
import type {
  ImageResult,
  ProviderExtractRequest,
  ProviderResult,
  ProviderSearchRequest,
} from '../../types'

/**
 * Map a Tavily `/search` payload into a `ProviderResult`.
 *
 * Pure: depends only on the already-parsed `payload` and the normalized
 * `request`. Returns `{ ok: false }` when zero results are parseable; otherwise
 * returns `{ ok: true }` with a `WebSearchData` value whose `source` is
 * `'tavily'` and whose counts reflect the entries remaining after invalid
 * entries are skipped.
 *
 * - Images are gated on `request.includeImages` (Req 10.1/10.2/10.3): when
 *   `false`, `data.images` is `[]` and `data.imageCount` is `0` regardless of
 *   the payload; when `true`, top-level `payload.images` entries are normalized
 *   and any without a non-empty url are dropped.
 * - `resultCount`/`imageCount` equal the surviving entry counts (Req 9.4/9.5).
 */
export function mapTavilySearchPayload(
  payload: unknown,
  request: ProviderSearchRequest
): ProviderResult {
  const record = isRecord(payload) ? payload : {}

  const rawResults = Array.isArray(record.results) ? record.results : []
  const results = compactMap(rawResults, parseTavilySearchResult)

  // Req 7.3 / 9 analog: zero parseable results is a descriptive failure, not a
  // fallback trigger.
  if (results.length === 0) {
    return { ok: false, error: 'Tavily returned no results.' }
  }

  // Req 10.1: gate images entirely on includeImages.
  let images: ImageResult[] = []
  if (request.includeImages) {
    const rawImages = Array.isArray(record.images) ? record.images : []
    // Req 10.2 / 10.3: normalize each image and drop entries without a url; an
    // empty result here simply yields an empty list.
    images = compactMap(rawImages, (image) => parseTavilyImage(image))
  }

  return {
    ok: true,
    data: {
      query: request.query,
      results,
      images,
      resultCount: results.length,
      imageCount: images.length,
      source: 'tavily',
      searchDepth: request.searchDepth,
    },
  }
}

/**
 * Map a Tavily `/extract` payload into a `ProviderResult`.
 *
 * Pure: depends only on the already-parsed `payload` and the normalized
 * `request`. Returns `{ ok: false }` when zero results are parseable (Req 8.3);
 * otherwise returns `{ ok: true }` with a `WebSearchData` value whose `source`
 * is `'tavily_extract'`.
 *
 * - On partial extract (at least one but not all requested URLs yielded
 *   content), `data.message` states the integer count of requested URLs that
 *   could not be extracted (Req 8.4). The count is taken from
 *   `payload.failed_results` length when present; otherwise it is inferred from
 *   `request.urls.length - results.length` when positive.
 * - Images are gated on `request.includeImages` (Req 10.x): extract pulls
 *   images nested within each raw result via `extractTavilyImages`.
 * - `resultCount`/`imageCount` equal the surviving entry counts (Req 9.4/9.5).
 */
export function mapTavilyExtractPayload(
  payload: unknown,
  request: ProviderExtractRequest
): ProviderResult {
  const record = isRecord(payload) ? payload : {}

  const rawResults = Array.isArray(record.results) ? record.results : []
  const results = compactMap(rawResults, parseTavilyExtractResult)

  const failedResults = Array.isArray(record.failed_results) ? record.failed_results : []

  // Req 8.3: zero extractable content is a descriptive failure (no fallback).
  if (results.length === 0) {
    return {
      ok: false,
      error: `Tavily Extract returned no extractable content.${getFailureMessage(failedResults)}`,
    }
  }

  // Req 10.x: gate images on includeImages; extract images are nested per result.
  const images: ImageResult[] = request.includeImages ? extractTavilyImages(rawResults) : []

  // Req 8.4: partial-extract count. Prefer the provider-reported failed_results
  // length; otherwise infer from the requested-vs-parsed difference.
  const requestedUrlCount = request.urls.length
  const failedCount =
    failedResults.length > 0
      ? failedResults.length
      : Math.max(0, requestedUrlCount - results.length)

  const partialFailureMessage =
    failedCount > 0 ? `${failedCount} URL(s) could not be extracted.` : undefined

  // Derive extractDepth consistently with the request shape: an attached query
  // means an advanced extract, otherwise a basic extract.
  const trimmedQuery = typeof request.query === 'string' ? request.query.trim() : ''
  const extractDepth = trimmedQuery.length > 0 ? 'advanced' : 'basic'

  return {
    ok: true,
    data: {
      query: trimmedQuery || request.urls[0],
      urls: request.urls,
      results,
      images,
      resultCount: results.length,
      imageCount: images.length,
      source: 'tavily_extract',
      extractDepth,
      intent: request.intent,
      ...(partialFailureMessage ? { message: partialFailureMessage } : {}),
    },
  }
}

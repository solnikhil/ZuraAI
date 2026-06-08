export interface WebSearchArgs {
  query: string
  num_results?: number
  search_depth?: 'ultra-fast' | 'fast' | 'basic' | 'advanced'
  time_range?: 'day' | 'week' | 'month' | 'year'
  topic?: 'general' | 'news' | 'finance'
  urls?: string[]
  include_images?: boolean
}

export interface SearchResult {
  title: string
  url: string
  snippet: string
  raw_content?: string
  favicon?: string
  source?: string
  displayed_link?: string
  date?: string
  score?: number
}

export interface ImageResult {
  url: string
  description?: string
  sourceUrl?: string
}

export interface JsonRecord {
  [key: string]: unknown
}

export interface TavilyExtractFailure {
  error?: string
}

export type WebInputIntent =
  | 'query_search'
  | 'url_extract'
  | 'url_extract_with_query'
  | 'site_exploration'

export interface ClassifiedWebInput {
  intent: WebInputIntent
  urls: string[]
  queryWithoutUrls: string
  originalQuery: string
}

export interface SearchExecutionOptions {
  query: string
  numResults: number
  searchDepth: 'ultra-fast' | 'fast' | 'basic' | 'advanced'
  includeImages: boolean
  timeRange?: 'day' | 'week' | 'month' | 'year'
  topic?: 'general' | 'news' | 'finance'
}

export interface TavilyExtractArgs {
  urls: string[]
  query?: string
  apiKey: string
  intent: WebInputIntent
  includeImages: boolean
}

// ---------------------------------------------------------------------------
// Provider-seam contracts (web-search-backend-rebuild)
//
// These types define the pluggable `SearchProvider` abstraction plus the
// shared, provider-agnostic request/response shapes used by the rebuilt
// Tavily-only pipeline. Adding a new provider must not require changes to the
// orchestrator, request normalizer, intent classifier, or result normalizer.
// ---------------------------------------------------------------------------

/**
 * Identifier for a registered search provider. The union grows as additional
 * providers are added; Tavily is the only provider today.
 */
export type SearchProviderId = 'tavily'

/**
 * Secure-storage key names re-used from `electron/secureStorage.ts`. A provider
 * declares which stored secret backs its credential.
 */
export type SecureStorageKey = 'tavilyApiKey'

/**
 * Declares which operations a provider can perform. The orchestrator surfaces a
 * clear "unsupported" error instead of falling back when a capability is absent.
 */
export interface ProviderCapabilities {
  readonly search: boolean
  readonly extract: boolean
}

/**
 * Runtime context passed to a provider operation. The orchestrator guarantees a
 * non-empty `apiKey` before dispatching any call.
 */
export interface ProviderContext {
  readonly apiKey: string
}

/**
 * Provider-agnostic search request shaped from a `NormalizedRequest`.
 */
export interface ProviderSearchRequest {
  readonly query: string
  readonly numResults: number
  readonly searchDepth: 'ultra-fast' | 'fast' | 'basic' | 'advanced'
  readonly includeImages: boolean
  readonly timeRange?: 'day' | 'week' | 'month' | 'year'
  readonly topic?: 'general' | 'news' | 'finance'
}

/**
 * Provider-agnostic URL-extraction request shaped from a `NormalizedRequest`
 * plus the classified intent.
 */
export interface ProviderExtractRequest {
  readonly urls: string[]
  readonly query?: string
  readonly includeImages: boolean
  readonly intent: WebInputIntent
}

/**
 * Renderer-facing success payload carried in `ToolResult.data`. Field names are
 * preserved for renderer compatibility.
 */
export interface WebSearchData {
  query: string
  results: SearchResult[]
  images: ImageResult[]
  resultCount: number
  imageCount: number
  source: string
  searchDepth?: string
  extractDepth?: string
  urls?: string[]
  intent?: WebInputIntent
  message?: string
}

/**
 * A normalized, provider-agnostic outcome. `ok: false` carries the real error;
 * no fallback is implied.
 */
export type ProviderResult =
  | { readonly ok: true; readonly data: WebSearchData }
  | { readonly ok: false; readonly error: string }

/**
 * Internal validated/coerced request produced by the request normalizer
 * (`request.ts`). All fields are guaranteed to satisfy the documented bounds.
 */
export interface NormalizedRequest {
  query: string
  numResults: number
  searchDepth: 'ultra-fast' | 'fast' | 'basic' | 'advanced'
  includeImages: boolean
  timeRange?: 'day' | 'week' | 'month' | 'year'
  topic?: 'general' | 'news' | 'finance'
  urls?: string[]
}

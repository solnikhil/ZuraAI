import { SEARCH_MAX_EXTRACT_URLS } from './constants'
import type { ClassifiedWebInput } from './types'

function sanitizeUrlToken(token: string): string {
  return token
    .trim()
    .replace(/^[\[\]{}()<>"'`]+/, '')
    .replace(/[\[\]{}()<>"'`,;:!?]+$/, '')
}

export function normalizeUrlCandidate(value: string): string | null {
  const trimmed = sanitizeUrlToken(value)
  if (!trimmed) return null

  // A token is treated as a URL ONLY when it already carries an absolute
  // http/https scheme (Requirement 3.2). Bare-domain tokens such as
  // "example.com" are intentionally NOT treated as URLs — they remain part of
  // the natural-language query so the input classifies as `query_search`.
  if (!/^https?:\/\//i.test(trimmed)) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname || parsed.hostname === 'localhost') return null
    return parsed.toString()
  } catch {
    return null
  }
}

function extractUrlsFromQuery(query: string, explicitUrls?: unknown): string[] {
  const candidates: string[] = []

  if (Array.isArray(explicitUrls)) {
    for (const value of explicitUrls) {
      if (typeof value === 'string') {
        const normalized = normalizeUrlCandidate(value)
        if (normalized) {
          candidates.push(normalized)
        }
      }
    }
  }

  for (const token of query.split(/\s+/g)) {
    if (!token) continue
    const normalized = normalizeUrlCandidate(token)
    if (normalized) {
      candidates.push(normalized)
    }
  }

  // De-duplicate by lowercased key while preserving first-occurrence order and
  // the original (first-seen) form of each URL (Requirement 3.4).
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const url of candidates) {
    const key = url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(url)
    if (deduped.length >= SEARCH_MAX_EXTRACT_URLS) break
  }

  return deduped
}

function removeUrlsFromQuery(query: string): string {
  const filteredTokens = query
    .split(/\s+/g)
    .filter(Boolean)
    .filter((token) => normalizeUrlCandidate(token) === null)

  return filteredTokens.join(' ').trim()
}

function isSiteExplorationIntent(text: string): boolean {
  if (!text) return false

  const patterns = [
    // Standalone site-exploration wording (Requirement 3.5).
    /\bdocs?\b/i,
    /\bdocumentation\b/i,
    /\bsites?\b/i,
    /\bbrowse\b/i,
    /\bexplore\b/i,
    /\bcrawl\b/i,
    // Existing compound phrasings.
    /\b(go through|scan|map)\b.*\b(site|docs|documentation)\b/i,
    /\b(find|locate|discover)\b.*\b(auth|api|reference|endpoint|documentation|docs)\b/i,
    /\b(site map|sitemap|api references?)\b/i,
  ]

  return patterns.some((re) => re.test(text))
}

export function classifyWebInput(query: string, explicitUrls?: unknown): ClassifiedWebInput {
  const originalQuery = query.trim()
  const urls = extractUrlsFromQuery(originalQuery, explicitUrls)
  const queryWithoutUrls = removeUrlsFromQuery(originalQuery)
  const hasUrls = urls.length > 0
  const hasNonUrlQuery = queryWithoutUrls.length > 0
  // Detect site-exploration wording from the natural-language (non-URL) portion
  // so URL paths such as "/docs" do not spuriously trigger it (Requirement 3.5).
  const siteExploration = isSiteExplorationIntent(queryWithoutUrls)

  if (hasUrls && siteExploration) {
    return {
      intent: 'site_exploration',
      urls,
      queryWithoutUrls,
      originalQuery,
    }
  }

  if (hasUrls && hasNonUrlQuery) {
    return {
      intent: 'url_extract_with_query',
      urls,
      queryWithoutUrls,
      originalQuery,
    }
  }

  if (hasUrls) {
    return {
      intent: 'url_extract',
      urls,
      queryWithoutUrls,
      originalQuery,
    }
  }

  return {
    intent: 'query_search',
    urls: [],
    queryWithoutUrls,
    originalQuery,
  }
}

export function reformulateQueryIfNeeded(query: string): string {
  const trimmed = query.trim()
  if (!trimmed) return trimmed

  const conversationalPrefixes = [
    /^can you (?:please )?(?:find|search|look up|tell me|get)\s+/i,
    /^could you (?:please )?(?:find|search|look up|tell me|get)\s+/i,
    /^would you (?:please )?(?:find|search|look up|tell me|get)\s+/i,
    /^i want to know (?:about )?/i,
    /^i need to (?:find|know|search for)\s+/i,
    /^please (?:find|search|look up|tell me)\s+/i,
    /^what (?:is|are) (?:the )?(?:latest|best|current)\s+/i,
    /^tell me (?:about )?/i,
    /^search for\s+/i,
    /^look up\s+/i,
    /^find (?:out )?(?:about )?/i,
  ]

  let result = trimmed
  for (const pattern of conversationalPrefixes) {
    result = result.replace(pattern, '').trim()
  }

  result = result.replace(/\?+$/, '').trim()

  if (result.length > 400) {
    result = `${result.slice(0, 397)}...`
  }

  return result || trimmed
}

/**
 * Canonical name for the query reformulation used by the rebuilt orchestrator.
 * Aliased to {@link reformulateQueryIfNeeded} so both names point to the same
 * implementation and existing/new callers stay in sync.
 */
export const reformulateQuery = reformulateQueryIfNeeded

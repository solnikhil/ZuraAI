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

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed)
      if (!parsed.hostname || parsed.hostname === 'localhost') return null
      return parsed.toString()
    }

    if (/\s/.test(trimmed)) return null
    if (!trimmed.includes('.')) return null
    if (trimmed.startsWith('.') || trimmed.endsWith('.')) return null

    const parsed = new URL(`https://${trimmed}`)
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
        candidates.push(value)
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

  const deduped = [...new Set(candidates.map((url) => url.toLowerCase()))]
    .slice(0, SEARCH_MAX_EXTRACT_URLS)
    .map((lower) => {
      const match = candidates.find((candidate) => candidate.toLowerCase() === lower)
      return match || lower
    })

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
    /\b(go through|scan|explore|crawl|map)\b.*\b(site|docs|documentation)\b/i,
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
  const siteExploration = isSiteExplorationIntent(originalQuery)

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

export function buildFallbackSearchQuery(classified: ClassifiedWebInput): string {
  if (classified.intent === 'query_search') {
    return classified.queryWithoutUrls || classified.originalQuery
  }

  const firstUrl = classified.urls[0] || ''
  const query = classified.queryWithoutUrls || classified.originalQuery
  if (!firstUrl) return query

  try {
    const hostname = new URL(firstUrl).hostname.replace(/^www\./, '')
    if (!query || query === firstUrl) {
      return firstUrl
    }
    return `${query} site:${hostname}`
  } catch {
    return query || firstUrl
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

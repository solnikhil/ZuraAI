export type WebToolMode = 'search' | 'extract'

function sanitizeUrlToken(token: string): string {
  return token
    .trim()
    .replace(/^(?:\[|\]|\{|\}|\(|\)|<|>|"|'|`)+/, '')
    .replace(/(?:\[|\]|\{|\}|\(|\)|<|>|"|'|`|,|;|:|!|\?)+$/, '')
}

function isLikelyUrlToken(token: string): boolean {
  const cleaned = sanitizeUrlToken(token)
  if (!cleaned) return false

  if (/^https?:\/\//i.test(cleaned)) return true
  if (/\s/.test(cleaned)) return false
  if (!cleaned.includes('.')) return false
  if (cleaned.startsWith('.') || cleaned.endsWith('.')) return false
  if (/^localhost(?::\d+)?$/i.test(cleaned)) return false

  return /^[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?$/i.test(cleaned)
}

function queryContainsUrl(query: string): boolean {
  return query.split(/\s+/g).some((token) => isLikelyUrlToken(token))
}

export function inferWebToolModeFromArgs(args?: Record<string, unknown>): WebToolMode {
  if (!args) return 'search'

  const explicitUrls = args.urls
  if (
    Array.isArray(explicitUrls) &&
    explicitUrls.some((url) => typeof url === 'string' && isLikelyUrlToken(url))
  ) {
    return 'extract'
  }

  const explicitUrl = args.url
  if (typeof explicitUrl === 'string' && isLikelyUrlToken(explicitUrl)) {
    return 'extract'
  }

  const query = args.query
  if (typeof query === 'string' && queryContainsUrl(query)) {
    return 'extract'
  }

  return 'search'
}

export function inferWebToolModeFromResultData(data: unknown): WebToolMode | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null
  }

  const obj = data as Record<string, unknown>
  const source = obj.source
  if (source === 'tavily_extract') {
    return 'extract'
  }
  if (source === 'tavily' || source === 'duckduckgo') {
    return 'search'
  }

  const intent = obj.intent
  if (
    intent === 'url_extract' ||
    intent === 'url_extract_with_query' ||
    intent === 'site_exploration'
  ) {
    return 'extract'
  }
  if (intent === 'query_search') {
    return 'search'
  }

  return null
}

export function getWebToolLabel(mode: WebToolMode): string {
  return mode === 'extract' ? 'Web Extract' : 'Web Search'
}

export function getWebImageSourceLabel(mode: WebToolMode | 'mixed'): string {
  if (mode === 'extract') return 'extract'
  if (mode === 'mixed') return 'web tools'
  return 'search'
}

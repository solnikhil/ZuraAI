export type TavilySearchDepth = 'ultra-fast' | 'fast' | 'basic' | 'advanced'
export type TavilySearchDepthPreference = 'auto' | TavilySearchDepth

const SEARCH_DEPTH_PREFERENCES = new Set<TavilySearchDepthPreference>([
  'auto',
  'ultra-fast',
  'fast',
  'basic',
  'advanced',
])

const SEARCH_DEPTH_VALUES = new Set<TavilySearchDepth>([
  'ultra-fast',
  'fast',
  'basic',
  'advanced',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function coerceSearchDepthPreference(value: unknown): TavilySearchDepthPreference {
  return typeof value === 'string' && SEARCH_DEPTH_PREFERENCES.has(value as TavilySearchDepthPreference)
    ? (value as TavilySearchDepthPreference)
    : 'auto'
}

export function getStoredSearchDepthPreference(): TavilySearchDepthPreference {
  try {
    const raw = localStorage.getItem('zura-settings')
    if (!raw) return 'auto'

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return 'auto'

    return coerceSearchDepthPreference(parsed.tavilySearchDepthPreference)
  } catch {
    return 'auto'
  }
}

export function resolveAutoSearchDepth(args: Record<string, unknown>): TavilySearchDepth {
  const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''
  const topic = args.topic
  const timeRange = args.time_range
  const wordCount = query ? query.split(/\s+/).length : 0

  const latencySensitiveIntent =
    topic === 'news' ||
    timeRange === 'day' ||
    /\b(latest|today|now|current|breaking|live|price|stock|market cap|weather|score|scores|result|results)\b/.test(
      query
    )
  if (latencySensitiveIntent) {
    return 'ultra-fast'
  }

  const deepResearchIntent =
    timeRange === 'year' ||
    /\b(compare|comparison|versus|vs\b|pros and cons|tradeoffs?|benchmark|benchmarks|deep dive|research|investigate|analysis|analyze|analyse|root cause|due diligence)\b/.test(
      query
    ) ||
    wordCount >= 14
  if (deepResearchIntent) {
    return 'advanced'
  }

  const detailSeekingIntent =
    timeRange === 'week' ||
    timeRange === 'month' ||
    /\b(summary|summarize|overview|guide|details|documentation|docs|pricing|features|security|release|roadmap|explain|how to)\b/.test(
      query
    ) ||
    wordCount >= 8
  if (detailSeekingIntent) {
    return 'basic'
  }

  return 'fast'
}

export function resolveWebSearchArgsForExecution(
  toolName: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  if (toolName !== 'web_search') return args

  const explicitDepth = args.search_depth
  if (typeof explicitDepth === 'string' && SEARCH_DEPTH_VALUES.has(explicitDepth as TavilySearchDepth)) {
    return args
  }

  const preference = getStoredSearchDepthPreference()
  const searchDepth = preference === 'auto' ? resolveAutoSearchDepth(args) : preference

  return {
    ...args,
    search_depth: searchDepth,
  }
}

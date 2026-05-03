import {
  STREAM_MAX_RESEARCH_ROUNDS,
  STREAM_RESEARCH_SAFETY_CAP,
} from '../../../../../providers'

export interface ResearchProgressPromptOptions {
  searchCount: number
  maxRounds: number
  forceWebSearch?: boolean
  safetyCap?: number
  practicalCap?: number
  basePrompt: string
}

export interface ResearchLoopContinuationOptions {
  searchCount: number
  maxRounds: number
  priorQueries?: string[]
  nextQueries?: string[]
  safetyCap?: number
  practicalCap?: number
}

export interface ResearchLoopDecision {
  shouldForceFinalSynthesis: boolean
  reason: 'budget' | 'duplicate-query' | 'duplicate-facet' | 'empty-batch' | null
}

const FORCE_WEB_SEARCH_PREFIX =
  'The user has requested a web search. Call web_search at least once before answering.\n\n'

const FOLLOW_UP_DECISION_GUIDANCE =
  `\n\n*** FOLLOW-UP SEARCH DECISION ***\n` +
  `After each search batch, briefly decide what is already answered by evidence, what important gap or conflict remains, and whether another search is actually needed.\n` +
  `If the missing evidence can be split into obvious independent facets, issue those distinct web_search calls together in the same assistant turn so they run as one parallel batch. Good batch cases include one query per requested year for multi-year data, one query per competitor or provider for comparisons, one query per region/category/product when the user asks for those slices, and one official/source-verification query when needed.\n` +
  `Keep each batch compact and within the remaining search budget. Avoid redundant searches and avoid speculative batches where the facets are not clear yet; change the angle when needed: overview, recent updates, source verification, official docs/specs, pricing, comparisons, examples, implementation details, or edge cases.`

type ResearchQueryFacet =
  | 'general'
  | 'overview'
  | 'recent'
  | 'verification'
  | 'docs'
  | 'pricing'
  | 'comparison'
  | 'examples'
  | 'implementation'

const FACET_KEYWORDS: Array<{ facet: ResearchQueryFacet; keywords: string[] }> = [
  { facet: 'comparison', keywords: ['vs', 'versus', 'compare', 'comparison', 'alternative', 'alternatives', 'competitor', 'competitors', 'difference'] },
  { facet: 'pricing', keywords: ['price', 'pricing', 'cost', 'costs', 'billing', 'plan', 'plans', 'subscription', 'subscriptions', 'enterprise'] },
  { facet: 'docs', keywords: ['docs', 'documentation', 'api', 'sdk', 'reference', 'spec', 'specification', 'guide', 'manual'] },
  { facet: 'recent', keywords: ['latest', 'recent', 'today', 'news', 'updates', 'new', 'release', 'released', 'launch', 'launched'] },
  { facet: 'verification', keywords: ['verify', 'verification', 'confirm', 'confirmed', 'fact', 'facts', 'official', 'source', 'sources', 'accuracy'] },
  { facet: 'examples', keywords: ['example', 'examples', 'sample', 'samples', 'tutorial', 'walkthrough', 'demo'] },
  { facet: 'implementation', keywords: ['implementation', 'implement', 'implementation', 'architecture', 'design', 'workflow', 'integration', 'setup', 'install', 'configuration'] },
  { facet: 'overview', keywords: ['overview', 'summary', 'what', 'list', 'landscape', 'providers', 'options', 'market'] },
]

const FACET_STOPWORDS = new Set(
  FACET_KEYWORDS.flatMap(({ keywords }) => keywords).concat([
    'search',
    'searches',
    'find',
    'looking',
    'about',
    'into',
    'with',
    'without',
    'from',
    'that',
    'this',
    'these',
    'those',
    'their',
    'there',
    'user',
    'users',
    'best',
    'top',
    'latest',
    'recent',
    'current',
    '2024',
    '2025',
    '2026',
    '2027',
  ])
)

export function getEffectiveSearchBudget(
  maxRounds: number,
  safetyCap: number = STREAM_RESEARCH_SAFETY_CAP,
  practicalCap: number = STREAM_MAX_RESEARCH_ROUNDS
): number {
  const normalizedSafetyCap = Math.max(1, Math.round(safetyCap))
  const normalizedPracticalCap = Math.max(1, Math.round(practicalCap))
  if (!Number.isFinite(maxRounds) || maxRounds <= 0) {
    return Math.min(normalizedPracticalCap, normalizedSafetyCap)
  }

  return Math.min(Math.max(1, Math.round(maxRounds)), normalizedSafetyCap)
}

export function hasReachedSearchBudget(
  searchCount: number,
  maxRounds: number,
  safetyCap: number = STREAM_RESEARCH_SAFETY_CAP,
  practicalCap: number = STREAM_MAX_RESEARCH_ROUNDS
): boolean {
  return searchCount >= getEffectiveSearchBudget(maxRounds, safetyCap, practicalCap)
}

function normalizeResearchQuery(query: string | null | undefined): string {
  return String(query || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeResearchQuery(query: string): string[] {
  return normalizeResearchQuery(query)
    .split(' ')
    .filter((token) => token.length > 2)
}

function extractExplicitYears(query: string): Set<string> {
  return new Set(tokenizeResearchQuery(query).filter((token) => /^\d{4}$/.test(token)))
}

function haveDifferentExplicitYears(left: string, right: string): boolean {
  const leftYears = extractExplicitYears(left)
  const rightYears = extractExplicitYears(right)
  if (leftYears.size === 0 || rightYears.size === 0) return false
  if (leftYears.size !== rightYears.size) return true

  for (const year of leftYears) {
    if (!rightYears.has(year)) return true
  }

  return false
}

function inferResearchQueryFacet(query: string): ResearchQueryFacet {
  const tokens = tokenizeResearchQuery(query)

  for (const { facet, keywords } of FACET_KEYWORDS) {
    if (keywords.some((keyword) => tokens.includes(keyword))) {
      return facet
    }
  }

  return 'general'
}

function getResearchCoreTokens(query: string): string[] {
  return tokenizeResearchQuery(query).filter((token) => {
    if (FACET_STOPWORDS.has(token)) return false
    if (/^\d{4}$/.test(token)) return false
    return true
  })
}

function areQueriesNearDuplicate(left: string, right: string): boolean {
  const normalizedLeft = normalizeResearchQuery(left)
  const normalizedRight = normalizeResearchQuery(right)

  if (!normalizedLeft || !normalizedRight) return false
  if (haveDifferentExplicitYears(normalizedLeft, normalizedRight)) return false
  if (normalizedLeft === normalizedRight) return true

  if (
    normalizedLeft.length >= 16 &&
    normalizedRight.length >= 16 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  ) {
    return true
  }

  const leftTokens = new Set(tokenizeResearchQuery(normalizedLeft))
  const rightTokens = new Set(tokenizeResearchQuery(normalizedRight))
  if (leftTokens.size < 3 || rightTokens.size < 3) return false

  let overlap = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1
    }
  }

  const denominator = Math.max(leftTokens.size, rightTokens.size)
  return denominator > 0 && overlap / denominator >= 0.75
}

function areQueriesFacetDuplicate(left: string, right: string): boolean {
  if (haveDifferentExplicitYears(left, right)) return false

  const leftFacet = inferResearchQueryFacet(left)
  const rightFacet = inferResearchQueryFacet(right)
  if (leftFacet === 'general' || rightFacet === 'general') return false
  if (leftFacet !== rightFacet) return false

  const leftCoreTokens = new Set(getResearchCoreTokens(left))
  const rightCoreTokens = new Set(getResearchCoreTokens(right))
  if (leftCoreTokens.size === 0 || rightCoreTokens.size === 0) return false

  let overlap = 0
  for (const token of leftCoreTokens) {
    if (rightCoreTokens.has(token)) {
      overlap += 1
    }
  }

  const smallerSetSize = Math.min(leftCoreTokens.size, rightCoreTokens.size)
  return smallerSetSize > 0 && overlap / smallerSetSize >= 0.6
}

export function classifyResearchQueryDuplicate(
  query: string,
  priorQueries: string[]
): 'duplicate-query' | 'duplicate-facet' | null {
  if (!query.trim() || priorQueries.length === 0) {
    return null
  }

  if (priorQueries.some((priorQuery) => areQueriesNearDuplicate(priorQuery, query))) {
    return 'duplicate-query'
  }

  if (priorQueries.some((priorQuery) => areQueriesFacetDuplicate(priorQuery, query))) {
    return 'duplicate-facet'
  }

  return null
}

export function evaluateResearchContinuation({
  searchCount,
  maxRounds,
  priorQueries = [],
  nextQueries = [],
  safetyCap = STREAM_RESEARCH_SAFETY_CAP,
  practicalCap = STREAM_MAX_RESEARCH_ROUNDS,
}: ResearchLoopContinuationOptions): ResearchLoopDecision {
  if (hasReachedSearchBudget(searchCount, maxRounds, safetyCap, practicalCap)) {
    return {
      shouldForceFinalSynthesis: true,
      reason: 'budget',
    }
  }

  const normalizedPriorQueries = priorQueries
    .map((query) => normalizeResearchQuery(query))
    .filter(Boolean)
  const normalizedNextQueries = nextQueries
    .map((query) => normalizeResearchQuery(query))
    .filter(Boolean)

  if (nextQueries.length > 0 && normalizedNextQueries.length === 0) {
    return {
      shouldForceFinalSynthesis: true,
      reason: 'empty-batch',
    }
  }

  if (
    normalizedPriorQueries.length > 0 &&
    normalizedNextQueries.length > 0 &&
    normalizedNextQueries.every((query) =>
      normalizedPriorQueries.some((priorQuery) => areQueriesNearDuplicate(priorQuery, query))
    )
  ) {
    return {
      shouldForceFinalSynthesis: true,
      reason: 'duplicate-query',
    }
  }

  if (
    priorQueries.length > 0 &&
    nextQueries.length > 0 &&
    nextQueries.every((query) =>
      priorQueries.some((priorQuery) => areQueriesFacetDuplicate(priorQuery, query))
    )
  ) {
    return {
      shouldForceFinalSynthesis: true,
      reason: 'duplicate-facet',
    }
  }

  return {
    shouldForceFinalSynthesis: false,
    reason: null,
  }
}

export function buildResearchProgressPrompt({
  searchCount,
  maxRounds,
  forceWebSearch = false,
  safetyCap = STREAM_RESEARCH_SAFETY_CAP,
  practicalCap = STREAM_MAX_RESEARCH_ROUNDS,
  basePrompt,
}: ResearchProgressPromptOptions): string {
  if (maxRounds < 0) {
    return ''
  }

  const prefix = forceWebSearch ? FORCE_WEB_SEARCH_PREFIX : ''
  const effectiveBudget = getEffectiveSearchBudget(maxRounds, safetyCap, practicalCap)
  const explicitBudget = maxRounds > 0 ? Math.min(maxRounds, effectiveBudget) : null
  const practicalBudget = maxRounds > 0 ? null : effectiveBudget

  if (searchCount >= effectiveBudget) {
    const limitLabel =
      explicitBudget !== null
        ? `all ${explicitBudget} allowed search(es)`
        : `the practical cap of ${effectiveBudget} search(es)`
    return `${prefix}\n\n*** WEB SEARCH BUDGET REACHED ***\nYou have completed ${limitLabel}. Do not call web_search again. Provide your final synthesized answer now using only the evidence already gathered.`
  }

  if (searchCount <= 0) {
    const budgetNote = explicitBudget
      ? `\n\nYou may use up to ${explicitBudget} search(es) for this request. There is no minimum required count; keep searching only while you still need evidence.`
      : practicalBudget
        ? `\n\nKeep the research loop tight. You may use up to ${practicalBudget} targeted search(es) before you must synthesize a final answer.`
        : ''
    return `\n\n${prefix}${basePrompt}${FOLLOW_UP_DECISION_GUIDANCE}${budgetNote}`
  }

  if (explicitBudget !== null) {
    const remaining = Math.max(0, explicitBudget - searchCount)
    if (remaining <= 0) {
      return `${prefix}\n\n*** WEB SEARCH BUDGET REACHED ***\nYou have completed all ${explicitBudget} allowed search(es). Do not call web_search again. Provide your final synthesized answer now using only the evidence already gathered.`
    }

    return `${prefix}\n\n*** WEB SEARCH PROGRESS ***\nYou have completed ${searchCount} of ${explicitBudget} allowed search(es). ${remaining} search(es) remain. Continue only if the current results are incomplete, conflicting, or still missing critical evidence for the user's request. If you continue, keep any next batch tight and focused on independent missing facets.${FOLLOW_UP_DECISION_GUIDANCE}`
  }

  const remainingPractical = Math.max(0, effectiveBudget - searchCount)
  const practicalWarning = remainingPractical <= 2
    ? ` You are close to the practical cap of ${effectiveBudget} searches, so only continue if another targeted search is necessary.`
    : ''

  return `${prefix}\n\n*** WEB SEARCH PROGRESS ***\nYou have completed ${searchCount} of ${effectiveBudget} targeted search(es) in this research loop. Use the returned evidence to decide whether another targeted search batch is still needed. Prefer synthesis once you have enough coverage, and do not keep reformulating similar searches without adding new evidence.${practicalWarning}${FOLLOW_UP_DECISION_GUIDANCE}`
}

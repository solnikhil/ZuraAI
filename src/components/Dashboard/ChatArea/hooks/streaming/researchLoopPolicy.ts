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
  reason: 'budget' | 'duplicate-query' | null
}

const FORCE_WEB_SEARCH_PREFIX =
  'The user has requested a web search. Call web_search at least once before answering.\n\n'

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

export function normalizeResearchQuery(query: string | null | undefined): string {
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

function areQueriesNearDuplicate(left: string, right: string): boolean {
  const normalizedLeft = normalizeResearchQuery(left)
  const normalizedRight = normalizeResearchQuery(right)

  if (!normalizedLeft || !normalizedRight) return false
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
    return `\n\n${prefix}${basePrompt}${budgetNote}`
  }

  if (explicitBudget !== null) {
    const remaining = Math.max(0, explicitBudget - searchCount)
    if (remaining <= 0) {
      return `${prefix}\n\n*** WEB SEARCH BUDGET REACHED ***\nYou have completed all ${explicitBudget} allowed search(es). Do not call web_search again. Provide your final synthesized answer now using only the evidence already gathered.`
    }

    return `${prefix}\n\n*** WEB SEARCH PROGRESS ***\nYou have completed ${searchCount} of ${explicitBudget} allowed search(es). ${remaining} search(es) remain. Continue only if the current results are incomplete, conflicting, or still missing critical evidence for the user's request.`
  }

  const remainingPractical = Math.max(0, effectiveBudget - searchCount)
  const practicalWarning = remainingPractical <= 2
    ? ` You are close to the practical cap of ${effectiveBudget} searches, so only continue if another targeted search is necessary.`
    : ''

  return `${prefix}\n\n*** WEB SEARCH PROGRESS ***\nYou have completed ${searchCount} of ${effectiveBudget} targeted search(es) in this research loop. Use the returned evidence to decide whether another targeted search is still needed. Prefer synthesis once you have enough coverage, and do not keep reformulating similar searches without adding new evidence.${practicalWarning}`
}

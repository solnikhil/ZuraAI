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
  reason: 'budget' | 'empty-batch' | null
}

const FORCE_WEB_SEARCH_PREFIX =
  'The user has requested a web search. Call web_search at least once before answering.\n\n'

const FOLLOW_UP_DECISION_GUIDANCE =
  `\n\n*** FOLLOW-UP SEARCH DECISION ***\n` +
  `After each search batch, briefly decide what is already answered by evidence, what important gap or conflict remains, and whether another search is actually needed.\n` +
  `Filter the returned results mentally before continuing: keep official, primary, current, and directly relevant sources; ignore stale, duplicate, off-topic, or weak summaries unless they are useful context.\n` +
  `Do not amplify an unverified entity or model name from third-party results into many follow-up searches. For provider/model release, availability, capability, or pricing claims, first try to verify against official vendor sources; if official evidence is not retrieved, report the claim as unverified instead of treating repeated third-party mentions as confirmation.\n` +
  `If the missing evidence can be split into obvious independent facets, issue those distinct web_search calls together in the same assistant turn so they run as one parallel batch. Good batch cases include one query per requested year for multi-year data, one query per competitor or provider for comparisons, one query per region/category/product when the user asks for those slices, and one official/source-verification query when needed.\n` +
  `Keep each batch compact and within the remaining search budget. Stop searching once the evidence is sufficient for the user's requested depth. Avoid speculative batches where the facets are not clear yet; change the angle when needed: overview, recent updates, source verification, official docs/specs, pricing, comparisons, examples, implementation details, or edge cases.`

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

export function evaluateResearchContinuation({
  searchCount,
  maxRounds,
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

  const normalizedNextQueries = nextQueries
    .map((query) => normalizeResearchQuery(query))
    .filter(Boolean)

  if (nextQueries.length > 0 && normalizedNextQueries.length === 0) {
    return {
      shouldForceFinalSynthesis: true,
      reason: 'empty-batch',
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

  return `${prefix}\n\n*** WEB SEARCH PROGRESS ***\nYou have completed ${searchCount} of ${effectiveBudget} targeted search(es) in this research loop. Use the returned evidence to decide whether another targeted search batch is still needed. Prefer synthesis once you have enough coverage.${practicalWarning}${FOLLOW_UP_DECISION_GUIDANCE}`
}

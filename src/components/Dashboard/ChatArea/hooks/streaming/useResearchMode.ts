/**
 * useResearchMode - Hook for managing web search mode state and logic
 *
 * Unified web search mode: model decides depth based on the user's question.
 */

import { useState, useCallback } from 'react'
import { isWebResearchEnabled, type SkillsSettings } from '../../../../../skills'

/**
 * Base system prompt for web search - planning and multi-turn guidance
 */
const WEB_SEARCH_BASE_PROMPT = `You have access to the web_search tool for real-time information. Use it when the user needs:
- Current events, news, or recent data
- Facts, figures, or statistics you cannot verify from context
- Verification of uncertain information

URL-FIRST ROUTING:
- If the user provides a specific URL, call web_search with that URL in the query. The system will route it to focused URL extraction.
- URL only (e.g. "https://foo.com/article") -> direct extraction.
- Query + URL (e.g. "summarize pricing https://foo.com/pricing") -> extraction reranked to the query.
- If there is no URL, use normal web search behavior.

Use concise, keyword-focused queries (e.g. "OpenAI GPT-5 release ${new Date().getFullYear()}" not "Can you find when OpenAI will release GPT-5?"). Each search should target a distinct angle: overview, recent news, specifics, or verification.

For broad discovery questions (e.g. "list all AI providers with free API", "what X offer Y"), use num_results=15-20 in your first search. If the first search results seem incomplete (e.g. missing major providers like Groq, Cerebras, OpenRouter, Together), do a follow-up search before synthesizing—do NOT answer with an incomplete list.

EXPLORE-FIRST: For research questions where you need to discover information, start with ONE broad exploratory search. Do NOT pre-plan multiple searches from your knowledge. After the first search returns results, use those results to decide what follow-up searches (if any) are needed. Let the search results guide your next steps.

MULTI-TURN SEARCHES: You can call web_search multiple times. After each search you receive results and get another turn—you may search again or provide your answer. There is no single-tool-call limit. If the first search is insufficient or the topic is ambiguous, call web_search again with a different query.

Decide how many searches you need based on the user's question. Simple questions may need one search; complex or ambiguous research may need several. Search as many times as needed, then provide your answer. If you already know the answer confidently, respond directly without searching.`

/**
 * Follow-up prompt when searchCount >= 1 - encourages additional searches when needed
 */
function getFollowUpResearchPrompt(searchCount: number): string {
  const hasMultipleSearches = searchCount >= 2
  return `\n\n*** WEB SEARCH PROGRESS ***
You have completed ${searchCount} search(es).${hasMultipleSearches ? `

IMPORTANT: You have sufficient search results. Provide your synthesized answer NOW. Do NOT search again—output the actual answer directly.` : `

You have search results above. For most questions, one search is enough—provide your answer now. Only search again if the results are clearly incomplete or missing critical information for the specific question asked.`}`
}

const FORCE_WEB_SEARCH_PREFIX = `The user has requested a web search. Call web_search at least once before answering.

`

/**
 * Research mode state
 */
export interface ResearchModeState {
  /** Whether research mode is active */
  isActive: boolean
  /** Current research round */
  currentRound: number
  /** Maximum number of search rounds (0 = uncapped) */
  maxRounds: number
  /** Number of searches completed */
  searchCount: number
  /** User explicitly requested web search - nudge model to search */
  forceWebSearch: boolean
}

/**
 * Research mode configuration based on settings
 */
export interface ResearchModeConfig {
  /** Maximum research rounds (0 = uncapped, model decides) */
  maxRounds: number
  /** Whether to force web search (user explicitly requested) */
  forceWebSearch: boolean
}

/**
 * Settings required for research mode
 */
export interface ResearchModeSettings {
  /** Skill state map */
  skills: SkillsSettings
  /** Model provider */
  modelProvider: string
  /** Enabled tools list */
  enabledTools?: string[]
}

/**
 * Options for the useResearchMode hook
 */
export interface UseResearchModeOptions {
  /** Whether tools can be used with current provider/model */
  canUseTools: boolean
  /** Custom web search prompt (appended when Web Research skill is enabled) */
  webSearchPrompt?: string
}

/**
 * Return type for the useResearchMode hook
 */
export interface UseResearchModeReturn {
  /** Current research mode state */
  researchState: ResearchModeState
  /** Start research mode with specified parameters */
  startResearchMode: (maxRounds: number, forceWebSearch?: boolean) => void
  /** Stop/reset research mode */
  stopResearchMode: () => void
  /** Increment search count */
  incrementSearchCount: (count?: number) => void
  /** Increment current round */
  incrementRound: () => void
  /** Get research context for system prompt */
  getResearchContext: (
    actualSearchCount?: number,
    maxRoundsOverride?: number
  ) => string
  /** Calculate research mode configuration from settings */
  calculateResearchConfig: (
    settings: ResearchModeSettings,
    userMessage: string
  ) => ResearchModeConfig
  /** Check if user explicitly requests web search */
  userRequestsWebSearch: (message: string) => boolean
  /** Get remaining searches (0 when uncapped) */
  getRemainingSearches: (searchCount?: number, maxRounds?: number) => number
  /** Check if research is complete (always false when uncapped) */
  isResearchComplete: (searchCount?: number, maxRounds?: number) => boolean
}

/**
 * Initial research mode state
 */
const INITIAL_STATE: ResearchModeState = {
  isActive: false,
  currentRound: 0,
  maxRounds: 0,
  searchCount: 0,
  forceWebSearch: false,
}

/**
 * Check if user explicitly requests web search in their message
 */
function checkUserRequestsWebSearch(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('use web search') ||
    normalized.includes('web search') ||
    normalized.includes('web_search') ||
    normalized.includes('search the web') ||
    normalized.includes('search online') ||
    normalized.includes('use websearch')
  )
}

/**
 * Hook for managing research mode state and logic
 */
export function useResearchMode({
  canUseTools,
  webSearchPrompt,
}: UseResearchModeOptions): UseResearchModeReturn {
  const [researchState, setResearchState] = useState<ResearchModeState>(INITIAL_STATE)

  const startResearchMode = useCallback((maxRounds: number, forceWebSearch: boolean = false) => {
    setResearchState({
      isActive: true,
      currentRound: 0,
      maxRounds,
      searchCount: 0,
      forceWebSearch,
    })
  }, [])

  const stopResearchMode = useCallback(() => {
    setResearchState(INITIAL_STATE)
  }, [])

  const incrementSearchCount = useCallback((count: number = 1) => {
    setResearchState(prev => ({
      ...prev,
      searchCount: prev.searchCount + count,
    }))
  }, [])

  const incrementRound = useCallback(() => {
    setResearchState(prev => ({
      ...prev,
      currentRound: prev.currentRound + 1,
    }))
  }, [])

  const getRemainingSearches = useCallback((
    searchCount?: number,
    maxRounds?: number
  ): number => {
    const count = searchCount ?? researchState.searchCount
    const max = maxRounds ?? researchState.maxRounds
    if (max <= 0) return 0 // Uncapped
    return Math.max(0, max - count)
  }, [researchState.searchCount, researchState.maxRounds])

  const isResearchComplete = useCallback((
    searchCount?: number,
    maxRounds?: number
  ): boolean => {
    const max = maxRounds ?? researchState.maxRounds
    if (max <= 0) return false // Uncapped - never "complete"
    return getRemainingSearches(searchCount, maxRounds) <= 0
  }, [getRemainingSearches, researchState.maxRounds])

  const userRequestsWebSearch = useCallback((message: string): boolean => {
    return checkUserRequestsWebSearch(message)
  }, [])

  const calculateResearchConfig = useCallback((
    settings: ResearchModeSettings,
    userMessage: string
  ): ResearchModeConfig => {
    const webResearchEnabled = isWebResearchEnabled(settings.skills)
    const enabledTools = settings.enabledTools?.length ? settings.enabledTools : ['web_search']
    const hasWebSearch = enabledTools.includes('web_search')
    const webSearchEnabledBySettings = webResearchEnabled && hasWebSearch

    const forceWebSearch =
      ['openrouter', 'groq', 'alibaba', 'ollama'].includes(settings.modelProvider) &&
      canUseTools &&
      webSearchEnabledBySettings &&
      checkUserRequestsWebSearch(userMessage)

    // maxRounds: 0 = uncapped (model decides depth)
    const maxRounds = webSearchEnabledBySettings && canUseTools ? 0 : -1

    return {
      maxRounds,
      forceWebSearch,
    }
  }, [canUseTools])

  const getResearchContext = useCallback((
    actualSearchCount?: number,
    maxRoundsOverride?: number
  ): string => {
    const maxRounds = maxRoundsOverride ?? researchState.maxRounds
    const isActive = maxRoundsOverride !== undefined ? maxRounds >= 0 : researchState.isActive

    if (!isActive || maxRounds < 0) {
      return ''
    }

    const prefix = researchState.forceWebSearch ? FORCE_WEB_SEARCH_PREFIX : ''
    const searchCount = actualSearchCount ?? researchState.searchCount

    if (searchCount >= 1) {
      return prefix + getFollowUpResearchPrompt(searchCount)
    }

    const basePrompt = webSearchPrompt ?? WEB_SEARCH_BASE_PROMPT
    return `\n\n${prefix}${basePrompt}`
  }, [researchState, webSearchPrompt])

  return {
    researchState,
    startResearchMode,
    stopResearchMode,
    incrementSearchCount,
    incrementRound,
    getResearchContext,
    calculateResearchConfig,
    userRequestsWebSearch,
    getRemainingSearches,
    isResearchComplete,
  }
}

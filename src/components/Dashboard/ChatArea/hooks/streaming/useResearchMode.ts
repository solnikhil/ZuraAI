/**
 * useResearchMode - Hook for managing web search mode state and logic
 *
 * Single unified web search mode: model decides how many searches to perform
 * based on the user's question. No caps, no deep/structured research modes.
 */

import { useState, useCallback } from 'react'

/**
 * Unified system prompt for web search - single prompt for all cases
 */
const WEB_SEARCH_SYSTEM_PROMPT = `You have access to the web_search tool for real-time information. Use it when the user needs:
- Current events, news, or recent data
- Facts, figures, or statistics you cannot verify from context
- Verification of uncertain information

Use concise, keyword-focused queries (e.g. "OpenAI GPT-5 release ${new Date().getFullYear()}" not "Can you find when OpenAI will release GPT-5?"). Each search should target a distinct angle: overview, recent news, specifics, or verification.

Decide how many searches you need based on the user's question. Simple questions may need one search; complex research may need several. Search as many times as needed, then provide your answer. If you already know the answer confidently, respond directly without searching.`

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
  /** If true, must complete exactly maxRounds searches (unused - always false) */
  mandatory: boolean
  /** User explicitly requested web search - nudge model to search */
  forceWebSearch: boolean
}

/**
 * Research mode configuration based on settings
 */
export interface ResearchModeConfig {
  /** Maximum research rounds (0 = uncapped, model decides) */
  maxRounds: number
  /** Whether research is mandatory (always false) */
  mandatory: boolean
  /** Whether to force web search (user explicitly requested) */
  forceWebSearch: boolean
}

/**
 * Settings required for research mode
 */
export interface ResearchModeSettings {
  /** Whether web search is enabled */
  webSearchEnabled: boolean
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
}

/**
 * Return type for the useResearchMode hook
 */
export interface UseResearchModeReturn {
  /** Current research mode state */
  researchState: ResearchModeState
  /** Start research mode with specified parameters */
  startResearchMode: (maxRounds: number, mandatory?: boolean, forceWebSearch?: boolean) => void
  /** Stop/reset research mode */
  stopResearchMode: () => void
  /** Increment search count */
  incrementSearchCount: (count?: number) => void
  /** Increment current round */
  incrementRound: () => void
  /** Get research context for system prompt */
  getResearchContext: (
    actualSearchCount?: number,
    maxRoundsOverride?: number,
    mandatoryOverride?: boolean
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
  mandatory: false,
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
}: UseResearchModeOptions): UseResearchModeReturn {
  const [researchState, setResearchState] = useState<ResearchModeState>(INITIAL_STATE)

  const startResearchMode = useCallback((maxRounds: number, mandatory: boolean = false, forceWebSearch: boolean = false) => {
    setResearchState({
      isActive: true,
      currentRound: 0,
      maxRounds,
      searchCount: 0,
      mandatory,
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
    const webSearchEnabledBySettings =
      (settings.enabledTools?.length ? settings.enabledTools.includes('web_search') : true) &&
      settings.webSearchEnabled

    const forceWebSearch =
      ['openrouter', 'groq', 'nvidia'].includes(settings.modelProvider) &&
      canUseTools &&
      webSearchEnabledBySettings &&
      checkUserRequestsWebSearch(userMessage)

    // maxRounds: 0 = uncapped (model decides depth)
    const maxRounds = webSearchEnabledBySettings && canUseTools ? 0 : -1

    return {
      maxRounds,
      mandatory: false,
      forceWebSearch,
    }
  }, [canUseTools])

  const getResearchContext = useCallback((
    _actualSearchCount?: number,
    maxRoundsOverride?: number,
    _mandatoryOverride?: boolean
  ): string => {
    const maxRounds = maxRoundsOverride ?? researchState.maxRounds
    const isActive = maxRoundsOverride !== undefined ? maxRounds >= 0 : researchState.isActive

    if (!isActive || maxRounds < 0) {
      return ''
    }

    const prefix = researchState.forceWebSearch ? FORCE_WEB_SEARCH_PREFIX : ''
    return `\n\n${prefix}${WEB_SEARCH_SYSTEM_PROMPT}`
  }, [researchState])

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

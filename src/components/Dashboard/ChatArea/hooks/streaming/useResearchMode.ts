/**
 * useResearchMode - Hook for managing research mode state and logic
 * 
 * Extracts research-specific state and logic from useToolCalling and useStreamingChat
 * to reduce complexity and improve maintainability.
 * 
 * Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
 * 
 * Research Mode Overview:
 * - Deep Research Mode (deepResearchEnabled ON): 25 rounds, forces multiple searches
 * - Normal Web Search Mode (webSearchEnabled ON): 20 rounds, planning required
 * - Neither toggle ON: No research mode
 */

import { useState, useCallback, useMemo } from 'react'

/**
 * Research mode state
 */
export interface ResearchModeState {
  /** Whether research mode is active */
  isActive: boolean
  /** Current research round */
  currentRound: number
  /** Maximum number of search rounds */
  maxRounds: number
  /** Number of searches completed */
  searchCount: number
  /** If true, must complete exactly maxRounds searches */
  mandatory: boolean
}

/**
 * Research mode configuration based on settings
 */
export interface ResearchModeConfig {
  /** Maximum research rounds */
  maxRounds: number
  /** Whether research is mandatory */
  mandatory: boolean
  /** Whether to force web search */
  forceWebSearch: boolean
}

/**
 * Settings required for research mode
 */
export interface ResearchModeSettings {
  /** Whether web search is enabled */
  webSearchEnabled: boolean
  /** Whether deep research is enabled */
  deepResearchEnabled: boolean
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
  startResearchMode: (maxRounds: number, mandatory?: boolean) => void
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
  /** Get remaining searches */
  getRemainingSearches: (searchCount?: number, maxRounds?: number) => number
  /** Check if research is complete */
  isResearchComplete: (searchCount?: number, maxRounds?: number) => boolean
}

/**
 * Initial research mode state
 */
const INITIAL_STATE: ResearchModeState = {
  isActive: false,
  currentRound: 0,
  maxRounds: 20,
  searchCount: 0,
  mandatory: false,
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

  /**
   * Start research mode with specified parameters
   * @param maxRounds - Maximum number of searches allowed
   * @param mandatory - If true, model MUST complete exactly maxRounds searches
   */
  const startResearchMode = useCallback((maxRounds: number, mandatory: boolean = false) => {
    setResearchState({
      isActive: true,
      currentRound: 0,
      maxRounds,
      searchCount: 0,
      mandatory,
    })
  }, [])

  /**
   * Stop/reset research mode
   */
  const stopResearchMode = useCallback(() => {
    setResearchState(INITIAL_STATE)
  }, [])

  /**
   * Increment search count
   */
  const incrementSearchCount = useCallback((count: number = 1) => {
    setResearchState(prev => ({
      ...prev,
      searchCount: prev.searchCount + count,
    }))
  }, [])

  /**
   * Increment current round
   */
  const incrementRound = useCallback(() => {
    setResearchState(prev => ({
      ...prev,
      currentRound: prev.currentRound + 1,
    }))
  }, [])

  /**
   * Get remaining searches
   */
  const getRemainingSearches = useCallback((
    searchCount?: number,
    maxRounds?: number
  ): number => {
    const count = searchCount ?? researchState.searchCount
    const max = maxRounds ?? researchState.maxRounds
    return Math.max(0, max - count)
  }, [researchState.searchCount, researchState.maxRounds])

  /**
   * Check if research is complete
   */
  const isResearchComplete = useCallback((
    searchCount?: number,
    maxRounds?: number
  ): boolean => {
    return getRemainingSearches(searchCount, maxRounds) <= 0
  }, [getRemainingSearches])

  /**
   * Check if user explicitly requests web search
   */
  const userRequestsWebSearch = useCallback((message: string): boolean => {
    return checkUserRequestsWebSearch(message)
  }, [])

  /**
   * Calculate research mode configuration from settings
   * 
   * Research mode setup:
   * - Deep research (deepResearchEnabled ON): 25 rounds, existing behavior
   * - Normal web search (only webSearchEnabled ON): 20 rounds, planning required
   * - Neither toggle ON: 0 rounds, no research mode started
   * 
   * Requirements: 2.1, 4.1, 5.1, 5.2, 5.3
   */
  const calculateResearchConfig = useCallback((
    settings: ResearchModeSettings,
    userMessage: string
  ): ResearchModeConfig => {
    // Check if web search is enabled by settings
    const webSearchEnabledBySettings = 
      (settings.enabledTools?.length ? settings.enabledTools.includes('web_search') : true) &&
      (settings.webSearchEnabled || settings.deepResearchEnabled)

    // Check if user explicitly requests web search (OpenRouter only)
    const forceWebSearch = 
      settings.modelProvider === 'openrouter' && 
      canUseTools && 
      webSearchEnabledBySettings && 
      checkUserRequestsWebSearch(userMessage)

    let maxRounds = 0
    let mandatory = false

    if (settings.deepResearchEnabled && canUseTools) {
      // Deep research mode: 25 searches, existing behavior
      maxRounds = 25
      mandatory = false
    } else if (settings.webSearchEnabled && canUseTools && !forceWebSearch) {
      // Normal web search mode: 20 searches, planning required
      maxRounds = 20
      mandatory = false
    }
    // If neither toggle is ON, maxRounds stays 0 and no research mode is started

    return {
      maxRounds,
      mandatory,
      forceWebSearch,
    }
  }, [canUseTools])

  /**
   * Get research context for system prompt (remaining searches, etc.)
   * @param actualSearchCount - Override searchCount (for immediate use after tool calls)
   * @param maxRoundsOverride - Override maxRounds from state (for immediate use)
   * @param mandatoryOverride - Override mandatory from state (for immediate use)
   */
  const getResearchContext = useCallback((
    actualSearchCount?: number,
    maxRoundsOverride?: number,
    mandatoryOverride?: boolean
  ): string => {
    // Use provided overrides or fall back to state
    const maxRounds = maxRoundsOverride ?? researchState.maxRounds
    const mandatory = mandatoryOverride ?? researchState.mandatory
    const isActive = maxRoundsOverride !== undefined ? maxRounds > 0 : researchState.isActive

    if (!isActive || maxRounds === 0) {
      return ''
    }

    // Use provided count or fall back to state (state may be stale)
    const searchCount = actualSearchCount ?? researchState.searchCount
    const remaining = maxRounds - searchCount

    // Limit reached state - instructs model to provide final answer
    // Works for both normal mode (20 searches) and deep research mode (25 searches)
    // Validates: Requirements 2.2, 2.3
    if (remaining <= 0) {
      return `\n\nYou have completed all ${maxRounds} available searches. You MUST now provide your final comprehensive answer based on all the information gathered.`
    }

    // MANDATORY mode - user explicitly requested deep research
    if (mandatory) {
      if (searchCount === 0) {
        return `\n\n*** MANDATORY DEEP RESEARCH - EXACTLY ${maxRounds} SEARCHES REQUIRED ***
The user has explicitly requested deep research. You MUST perform exactly ${maxRounds} web searches before providing your answer.

CRITICAL INSTRUCTION: You MUST call the web_search FUNCTION ${maxRounds} times. Do NOT just describe what you would search for - you MUST actually CALL the web_search function.

Your response format must be:
1. Immediately call web_search with your first query
2. After seeing results, call web_search again with a different query
3. Repeat until you have completed ${maxRounds} searches
4. Only then provide your final answer

Search 1: Broad overview of the topic
Search 2: Recent developments and updates
Search 3: Specific details, perspectives, or verification

DO NOT provide your answer before completing all ${maxRounds} searches.`
      }

      // After 1st search in mandatory mode
      if (searchCount === 1 && remaining > 0) {
        return `\n*** MANDATORY: CONTINUE RESEARCH - ${remaining} MORE SEARCHES REQUIRED ***
You have completed 1 of ${maxRounds} MANDATORY searches. You MUST complete ${remaining} more searches before answering.

CRITICAL: Your next response MUST be a web_search FUNCTION CALL with a different query. Do NOT provide text commentary - call the function directly.

Use web_search now with a new query about: recent developments, specific details, or different perspectives.`
      }

      // After 2nd search in 3-search mandatory mode
      if (searchCount === 2 && remaining > 0) {
        return `\n*** MANDATORY: FINAL SEARCH REQUIRED ***
You have completed 2 of ${maxRounds} MANDATORY searches. You MUST complete 1 more search before answering.

CRITICAL: Your next response MUST be a web_search FUNCTION CALL. Do NOT provide text commentary - call the function directly.

After this final search, provide your comprehensive answer. Use web_search now.`
      }

      // General continuation for mandatory mode
      return `\n*** MANDATORY: CONTINUE RESEARCH ***
${remaining} more searches required. Your response MUST be a web_search FUNCTION CALL, not text. Call web_search now.`
    }

    // ============================================================================
    // MODE DIFFERENTIATION
    // ============================================================================
    // The research context system supports two distinct modes:
    // 
    // 1. DEEP RESEARCH MODE (maxRounds >= 10, typically 25):
    //    - Triggered when deepResearchEnabled is ON
    //    - Forces multiple searches with mandatory continuation prompts
    //    - Requires minimum 6-10 searches before allowing final answer
    //    - Uses aggressive prompts to ensure comprehensive research
    //    - Validates: Requirements 4.1, 4.2, 4.3
    //
    // 2. NORMAL WEB SEARCH MODE (maxRounds > 0 && maxRounds < 25, typically 20):
    //    - Triggered when only webSearchEnabled is ON
    //    - Requires planning before executing searches
    //    - Allows model to decide when to stop (up to limit)
    //    - Uses guidance prompts rather than mandatory continuation
    //    - Validates: Requirements 2.1, 3.1, 3.2, 3.3
    //
    // The branching below ensures these modes remain completely separate.
    // Deep research prompts are preserved unchanged per Requirement 4.3.
    // ============================================================================
    
    // Regular research mode (non-mandatory) - model decides when to search
    const isDeepResearch = maxRounds >= 25  // Deep research has 25 rounds
    const isNormalSearch = maxRounds > 0 && maxRounds < 25  // Normal search has 20 rounds

    if (searchCount === 0) {
      // ----------------------------------------------------------------
      // DEEP RESEARCH MODE - Initial prompt (searchCount = 0)
      // This prompt is UNCHANGED per Requirement 4.3
      // Forces immediate web_search call with no text explanation
      // ----------------------------------------------------------------
      if (isDeepResearch) {
        return `\n\n*** DEEP RESEARCH MODE - MANDATORY MULTI-SEARCH ***
You MUST complete MULTIPLE SEARCHES before answering. You have up to 25 searches available.

CRITICAL RULE #1: Your FIRST response must be ONLY a web_search function call. NO text, NO explanation. Just the function call.

CRITICAL RULE #2: After the first search, you MUST continue searching different niches. DO NOT provide your final answer after just 1-2 searches.

CRITICAL RULE #3: Only provide your final answer after completing ALL niche searches.

MANDATORY MINIMUM SEARCHES: 6-10 searches on different aspects

Your first search should be broad. Then identify niches and search each one.

NOW: Call web_search with a broad query - NO TEXT, just the function.`
      }

      // Normal web search mode - requires planning before executing searches
      // Validates: Requirements 3.1, 3.2, 3.3
      if (isNormalSearch) {
        return `\n\n*** WEB SEARCH MODE - PLAN FIRST ***
You have access to web search with a maximum of ${maxRounds} searches.

BEFORE searching, you MUST:
1. Briefly state what information you need
2. List the specific searches you plan to make (up to ${maxRounds})
3. Explain why each search is necessary

After planning, proceed with your searches. Use them wisely - you have limited searches available.

If you already know the answer confidently without needing current information, you can respond directly without searching.`
      }

      return `\n\n*** WEB SEARCH AVAILABLE ***
You have access to web search (up to ${maxRounds} searches) to provide accurate, up-to-date information.

When you need information that may be:
- Recent or time-sensitive (news, current events, latest data)
- Not confidently verifiable from existing context alone
- Specific facts, figures, or statistics
- Verification of uncertain information

Use the web_search tool to find accurate information. You may search multiple times from different angles to build comprehensive understanding.

If you already know the answer confidently, you can respond directly.`
    }

    // After 1st search - FORCE continuation for deep research, allow choice for normal mode
    if (searchCount === 1) {
      // ----------------------------------------------------------------
      // DEEP RESEARCH MODE - After 1st search (searchCount = 1)
      // This prompt is UNCHANGED per Requirement 4.3
      // Forces continuation with mandatory language
      // ----------------------------------------------------------------
      if (isDeepResearch) {
        return `\n\n*** CONTINUE RESEARCH - MANDATORY ***
You have completed ONLY 1 search. You need 5-9 MORE searches.

DO NOT provide your answer yet. Your answer will be INCOMPLETE without more research.

Your next search must explore a different angle/niche. Call web_search NOW with a NEW query.

After this, continue searching until all niches are covered.`
      }

      // Normal web search mode - allow model to decide when to stop
      // Different from deep research which forces continuation
      // Validates: Requirements 2.2, 3.4
      if (isNormalSearch) {
        return `\n\n*** WEB SEARCH PROGRESS ***
You have completed 1 of ${maxRounds} available searches. ${remaining} searches remaining.

You may:
- Continue searching if you need more information, different perspectives, or verification
- Provide your answer now if you have gathered sufficient information

If continuing, use web_search with a different query to explore other aspects of the topic.`
      }

      return `\n\n*** RESEARCH PROGRESS ***
You have completed 1 of up to ${maxRounds} searches. You may continue searching if:
- You need more recent information
- You want different perspectives
- There are gaps in your knowledge
- You need to verify claims

Use web_search with different queries as needed, or provide your answer if you have sufficient information.`
    }

    // ----------------------------------------------------------------
    // DEEP RESEARCH MODE - Searches 2-5 (searchCount 2-5)
    // This prompt is UNCHANGED per Requirement 4.3
    // Forces continuation until minimum 6 searches reached
    // ----------------------------------------------------------------
    // Searches 2-5 - Still force continuation for deep research
    if (isDeepResearch && searchCount >= 2 && searchCount <= 5) {
      return `\n\n*** CONTINUE RESEARCH - MANDATORY ***
You have completed ${searchCount} search(es). You need MORE searches. Minimum 6 total required.

DO NOT provide your answer yet. Continue with a NEW niche query.

Call web_search NOW.`
    }

    // Normal mode searches 2+ - allow model to decide when to stop (up to limit)
    // Different from deep research which forces continuation
    // Validates: Requirements 2.2, 3.4
    if (isNormalSearch && searchCount >= 2 && searchCount < maxRounds) {
      // Check if this is the last available search
      if (remaining === 1) {
        return `\n\n*** WEB SEARCH PROGRESS - LAST SEARCH AVAILABLE ***
You have completed ${searchCount} of ${maxRounds} searches. You have 1 search remaining.

You may:
- Use your final search if you need one more piece of information
- Provide your answer now if you have gathered sufficient information

Choose wisely - this is your last available search.`
      }

      return `\n\n*** WEB SEARCH PROGRESS ***
You have completed ${searchCount} of ${maxRounds} available searches. ${remaining} searches remaining.

You may:
- Continue searching if you need more information or different perspectives
- Provide your answer now if you have gathered sufficient information

If continuing, use web_search with a different query to explore other aspects of the topic.`
    }

    // ----------------------------------------------------------------
    // DEEP RESEARCH MODE - Searches 6+ (searchCount 6-24)
    // This prompt is UNCHANGED per Requirement 4.3
    // Allows completion but encourages more comprehensive coverage
    // ----------------------------------------------------------------
    // Searches 6+ - Allow completion but encourage more
    if (isDeepResearch && searchCount >= 6 && searchCount < 25) {
      const remainingDeep = maxRounds - searchCount
      return `\n\n*** RESEARCH PROGRESS ***
Search ${searchCount} of ${maxRounds} completed. ${remainingDeep} searches remaining.

You MAY provide your answer now if you have thoroughly covered the topic, OR continue searching for more comprehensive coverage.

To continue: Call web_search with another niche query.
To provide answer: Follow the response format with Executive Summary, Analysis, Facts, Perspectives, Timeline, Conclusions, Sources.`
    }

    return `\n\n*** RESEARCH PROGRESS ***
Search ${searchCount} of up to ${maxRounds} completed. ${remaining} searches remaining.

Continue using web_search if you need more information, or provide your comprehensive answer if you have gathered sufficient information.`
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

/**
 * useResearchMode - Hook for managing web search mode state and logic
 *
 * Unified web search mode: the model decides depth based on the user's question.
 */

import { useState, useCallback } from 'react'
import { isWebResearchEnabled, type SkillsSettings } from '../../../../../skills'
import { providerSupportsTools } from '../../../../../providers'
import { buildResearchProgressPrompt } from './researchLoopPolicy'

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

For broad discovery questions (e.g. "list all AI providers with free API", "what X offer Y"), keep each call focused and lightweight. The tool returns at most 4 sources per call, so if the first search seems incomplete (e.g. missing major providers like Groq, Cerebras, OpenRouter, Together), do a follow-up search from a new angle before synthesizing. Do not answer with an incomplete list.

EXPLORE-FIRST: For research questions where you need to discover information, start with one broad exploratory search. Do not pre-plan multiple searches from prior knowledge. After the first search returns results, use those results to decide what follow-up searches are still needed.

MULTI-TURN SEARCHES: You can call web_search multiple times. After each search you receive results and get another turn. You may search again or provide your answer. There is no single-tool-call limit. If the first search is insufficient or the topic is ambiguous, call web_search again with a different query.

GAP ANALYSIS: After each search, decide what the results already answered, what important gap or conflict remains, and whether another search is necessary. If you continue, issue exactly one new targeted query for the missing facet.

QUERY DIVERSIFICATION: Change the angle when continuing. Useful follow-up facets include overview, recent updates, source verification, official docs/specs, pricing, comparisons, examples, implementation details, and edge cases. Do not repeat the same facet with minor rewording.

Decide how many searches you need based on the user's question. Simple questions may need one search; complex or ambiguous research may need 2-3 total searches from different angles. Search only while you can name the missing evidence you are trying to gather, then provide your answer. If you already know the answer confidently, respond directly without searching.`

export interface ResearchModeState {
  isActive: boolean
  currentRound: number
  maxRounds: number
  searchCount: number
  forceWebSearch: boolean
}

export interface ResearchModeConfig {
  maxRounds: number
  forceWebSearch: boolean
}

export interface ResearchModeSettings {
  skills: SkillsSettings
  modelProvider: string
  enabledTools?: string[]
}

export interface UseResearchModeOptions {
  canUseTools: boolean
  webSearchPrompt?: string
}

export interface UseResearchModeReturn {
  researchState: ResearchModeState
  startResearchMode: (maxRounds: number, forceWebSearch?: boolean) => void
  stopResearchMode: () => void
  incrementSearchCount: (count?: number) => void
  incrementRound: () => void
  getResearchContext: (actualSearchCount?: number, maxRoundsOverride?: number) => string
  calculateResearchConfig: (
    settings: ResearchModeSettings,
    userMessage: string
  ) => ResearchModeConfig
  userRequestsWebSearch: (message: string) => boolean
  getRemainingSearches: (searchCount?: number, maxRounds?: number) => number
  isResearchComplete: (searchCount?: number, maxRounds?: number) => boolean
}

const INITIAL_STATE: ResearchModeState = {
  isActive: false,
  currentRound: 0,
  maxRounds: 0,
  searchCount: 0,
  forceWebSearch: false,
}

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
    setResearchState((prev) => ({
      ...prev,
      searchCount: prev.searchCount + count,
    }))
  }, [])

  const incrementRound = useCallback(() => {
    setResearchState((prev) => ({
      ...prev,
      currentRound: prev.currentRound + 1,
    }))
  }, [])

  const getRemainingSearches = useCallback(
    (searchCount?: number, maxRounds?: number): number => {
      const count = searchCount ?? researchState.searchCount
      const max = maxRounds ?? researchState.maxRounds
      if (max <= 0) return 0
      return Math.max(0, max - count)
    },
    [researchState.searchCount, researchState.maxRounds]
  )

  const isResearchComplete = useCallback(
    (searchCount?: number, maxRounds?: number): boolean => {
      const max = maxRounds ?? researchState.maxRounds
      if (max <= 0) return false
      return getRemainingSearches(searchCount, maxRounds) <= 0
    },
    [getRemainingSearches, researchState.maxRounds]
  )

  const userRequestsWebSearch = useCallback((message: string): boolean => {
    return checkUserRequestsWebSearch(message)
  }, [])

  const calculateResearchConfig = useCallback(
    (settings: ResearchModeSettings, userMessage: string): ResearchModeConfig => {
      const webResearchEnabled = isWebResearchEnabled(settings.skills)
      const enabledTools = settings.enabledTools?.length ? settings.enabledTools : ['web_search']
      const hasWebSearch = enabledTools.includes('web_search')
      const webSearchEnabledBySettings = webResearchEnabled && hasWebSearch

      const forceWebSearch =
        providerSupportsTools(settings.modelProvider) &&
        canUseTools &&
        webSearchEnabledBySettings &&
        checkUserRequestsWebSearch(userMessage)

      const maxRounds = webSearchEnabledBySettings && canUseTools ? 0 : -1

      return {
        maxRounds,
        forceWebSearch,
      }
    },
    [canUseTools]
  )

  const getResearchContext = useCallback(
    (actualSearchCount?: number, maxRoundsOverride?: number): string => {
      const maxRounds = maxRoundsOverride ?? researchState.maxRounds
      const isActive =
        maxRoundsOverride !== undefined ? maxRounds >= 0 : researchState.isActive

      if (!isActive || maxRounds < 0) {
        return ''
      }

      return buildResearchProgressPrompt({
        searchCount: actualSearchCount ?? researchState.searchCount,
        maxRounds,
        forceWebSearch: researchState.forceWebSearch,
        basePrompt: webSearchPrompt ?? WEB_SEARCH_BASE_PROMPT,
      })
    },
    [researchState, webSearchPrompt]
  )

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

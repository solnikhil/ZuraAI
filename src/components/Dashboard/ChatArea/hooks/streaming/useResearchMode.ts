/**
 * useResearchMode - Hook for managing web search mode state and logic
 *
 * Unified web search mode: the model decides depth based on the user's question.
 */

import { useState, useCallback } from 'react'
import { isWebResearchEnabled, type SkillsSettings } from '../../../../../skills'
import { providerSupportsTools } from '../../../../../providers'
import { defaultWebSearchPrompt } from '../../../../../prompts/defaultWebSearchPrompt'
import { buildResearchProgressPrompt } from './researchLoopPolicy'

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
      const isActive = maxRoundsOverride !== undefined ? maxRounds >= 0 : researchState.isActive

      if (!isActive || maxRounds < 0) {
        return ''
      }

      return buildResearchProgressPrompt({
        searchCount: actualSearchCount ?? researchState.searchCount,
        maxRounds,
        forceWebSearch: researchState.forceWebSearch,
        basePrompt: webSearchPrompt ?? defaultWebSearchPrompt,
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

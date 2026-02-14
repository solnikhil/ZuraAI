/**
 * useStreamingToolCalls - Hook for handling tool execution and result handling during streaming
 * 
 * Extracts tool calling logic from useStreamingChat to reduce complexity.
 * This hook manages tool call accumulation, execution, and research loop handling.
 * 
 * Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
 */

import { useCallback } from 'react'
import { useToolCalling } from '../../../../../hooks/useToolCalling'
import { useResearchMode } from './useResearchMode'
import { useToast } from '../../../../shared/Toast'
import type { UpdateStreamingCallback, StreamingSettings } from './types'

/**
 * Tool call accumulator for tracking partial tool calls during streaming
 */
export interface ToolCallAccumulatorItem {
  id: string
  type: string
  function: {
    name: string
    arguments: string
  }
}

/**
 * Result from processing tool calls
 */
export interface ToolCallProcessingResult {
  hasTools: boolean
  toolResults: any[]
  formattedResults: any[]
  needsFollowUp: boolean
}

/**
 * Research status for UI updates
 */
export interface ResearchStatus {
  currentRound: number
  maxRounds: number
  currentSearch?: string
  isSearching: boolean
}

/**
 * Options for the useStreamingToolCalls hook
 */
export interface UseStreamingToolCallsOptions {
  settings: StreamingSettings
}

/**
 * Return type for the useStreamingToolCalls hook
 */
export interface UseStreamingToolCallsReturn {
  /** Whether tools can be used with current provider/model */
  canUseTools: boolean
  /** Get tools formatted for current provider */
  getToolsForRequest: () => any
  /** Process tool calls from AI response */
  handleToolCalls: (response: any) => Promise<ToolCallProcessingResult>
  /** Clear tool state */
  clearToolState: () => void
  /** Start research mode */
  startResearchMode: (maxRounds: number, mandatory?: boolean, forceWebSearch?: boolean) => void
  /** Get research context for system prompt */
  getResearchContext: (searchCount: number, maxRounds: number, mandatory: boolean) => string
  /** Tool call accumulator utilities */
  toolCallAccumulator: {
    /** Create a new accumulator */
    create: () => ToolCallAccumulatorState
    /** Accumulate tool calls from a streaming chunk */
    accumulate: (state: ToolCallAccumulatorState, deltaToolCalls: any[]) => void
    /** Check if accumulator has tool calls */
    hasToolCalls: (state: ToolCallAccumulatorState) => boolean
    /** Get accumulated tool calls */
    getToolCalls: (state: ToolCallAccumulatorState) => ToolCallAccumulatorItem[]
    /** Clear accumulator */
    clear: (state: ToolCallAccumulatorState) => void
  }
  /** Process accumulated tool calls and handle research loop */
  processToolCallsWithResearch: (options: ProcessToolCallsOptions) => Promise<ProcessToolCallsResult>
  /** Update research status on message */
  updateResearchStatus: (
    updateFn: UpdateStreamingCallback,
    sessionId: string,
    messageId: string,
    status: ResearchStatus | undefined
  ) => void
  /** Format tool results for saving */
  formatToolResultsForSave: (toolResults: any[]) => any[]
}

/**
 * State for tool call accumulator
 */
export interface ToolCallAccumulatorState {
  toolCalls: ToolCallAccumulatorItem[]
}

/**
 * Options for processing tool calls with research loop
 */
export interface ProcessToolCallsOptions {
  /** Accumulated tool calls */
  toolCalls: ToolCallAccumulatorItem[]
  /** Accumulated content so far */
  accumulatedContent: string
  /** Session ID */
  sessionId: string
  /** Message ID */
  messageId: string
  /** Maximum research rounds */
  researchMaxRounds: number
  /** Whether research is mandatory */
  researchMandatory: boolean
  /** Update streaming message callback */
  updateStreamingMessage: UpdateStreamingCallback
}

/**
 * Result from processing tool calls with research
 */
export interface ProcessToolCallsResult {
  /** Updated tool results */
  toolResults: any[] | null
  /** Total web search count */
  totalSearchCount: number
  /** Whether more tool calls are needed */
  needsMoreToolCalls: boolean
  /** Reconstructed assistant message for follow-up */
  lastAssistantMessage: any
  /** Formatted results for follow-up messages */
  formattedResults: any[]
}

/**
 * Hook for handling tool execution and result handling during streaming
 */
export function useStreamingToolCalls({
  settings: _settings,
}: UseStreamingToolCallsOptions): UseStreamingToolCallsReturn {
  const { showToast } = useToast()
  
  // Use the existing useToolCalling hook for core functionality
  const {
    canUseTools,
    getToolsForRequest,
    handleToolCalls: baseHandleToolCalls,
    clearToolState,
  } = useToolCalling()

  // Use useResearchMode for research-specific logic (unified web search prompt)
  const { startResearchMode, getResearchContext } = useResearchMode({ canUseTools })

  /**
   * Create a new tool call accumulator state
   */
  const createAccumulator = useCallback((): ToolCallAccumulatorState => {
    return { toolCalls: [] }
  }, [])

  /**
   * Accumulate tool calls from streaming chunks
   */
  const accumulateToolCalls = useCallback((
    state: ToolCallAccumulatorState,
    deltaToolCalls: any[]
  ): void => {
    if (!deltaToolCalls || !Array.isArray(deltaToolCalls)) return

    deltaToolCalls.forEach((tc: any) => {
      const index = tc.index ?? 0
      
      if (!state.toolCalls[index]) {
        state.toolCalls[index] = {
          id: tc.id || '',
          type: tc.type || 'function',
          function: { name: '', arguments: '' }
        }
      }
      
      if (tc.id && !state.toolCalls[index].id) {
        state.toolCalls[index].id = tc.id
      }
      if (tc.function?.name) {
        state.toolCalls[index].function.name += tc.function.name
      }
      if (tc.function?.arguments) {
        state.toolCalls[index].function.arguments += tc.function.arguments
      }
    })
  }, [])

  /**
   * Check if accumulator has valid tool calls
   */
  const hasToolCalls = useCallback((state: ToolCallAccumulatorState): boolean => {
    return state.toolCalls.some(tc => tc?.id && tc?.function?.name)
  }, [])

  /**
   * Get accumulated tool calls filtered for valid entries
   */
  const getToolCalls = useCallback((state: ToolCallAccumulatorState): ToolCallAccumulatorItem[] => {
    return state.toolCalls.filter(tc => tc?.id && tc?.function?.name)
  }, [])

  /**
   * Clear accumulator state
   */
  const clearAccumulator = useCallback((state: ToolCallAccumulatorState): void => {
    state.toolCalls = []
  }, [])

  /**
   * Handle tool calls with error handling and toast notifications
   */
  const handleToolCalls = useCallback(async (response: any): Promise<ToolCallProcessingResult> => {
    try {
      return await baseHandleToolCalls(response)
    } catch (toolError: any) {
      console.error('Tool calls processing error:', toolError)
      showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
      return {
        hasTools: false,
        toolResults: [],
        formattedResults: [],
        needsFollowUp: false
      }
    }
  }, [baseHandleToolCalls, showToast])

  /**
   * Update research status on a streaming message
   */
  const updateResearchStatus = useCallback((
    updateFn: UpdateStreamingCallback,
    sessionId: string,
    messageId: string,
    status: ResearchStatus | undefined
  ): void => {
    updateFn(sessionId, messageId, { researchStatus: status })
  }, [])

  /**
   * Format tool results for saving to message
   */
  const formatToolResultsForSave = useCallback((toolResults: any[]): any[] => {
    if (!toolResults || !Array.isArray(toolResults)) return []
    
    return toolResults.map((tr: any) => ({
      toolCall: {
        id: tr.toolCall.id,
        name: tr.toolCall.name,
        arguments: tr.toolCall.arguments
      },
      result: {
        success: tr.result.success,
        data: tr.result.data,
        error: tr.result.error,
        executionTime: tr.result.executionTime
      }
    }))
  }, [])

  /**
   * Process accumulated tool calls and handle initial tool execution
   * This is the first step before entering a research loop
   */
  const processToolCallsWithResearch = useCallback(async (
    options: ProcessToolCallsOptions
  ): Promise<ProcessToolCallsResult> => {
    const {
      toolCalls,
      accumulatedContent,
      sessionId,
      messageId,
      researchMaxRounds,
      researchMandatory: _researchMandatory,
      updateStreamingMessage,
    } = options

    // Reconstruct the assistant message with tool calls
    const reconstructedMessage = {
      role: 'assistant',
      content: accumulatedContent,
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        type: tc.type || 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments
        }
      }))
    }

    // Process tool calls
    const toolResult = await handleToolCalls({ choices: [{ message: reconstructedMessage }] })

    // Update research status for web searches
    const webSearchCalls = (toolResult.toolResults || []).filter(
      (tr: any) => tr.toolCall.name === 'web_search'
    )
    
    if (webSearchCalls.length > 0) {
      const firstSearchQuery = webSearchCalls[0]
      const searchQuery = typeof firstSearchQuery.toolCall.arguments === 'object'
        ? firstSearchQuery.toolCall.arguments?.query
        : firstSearchQuery.toolCall.arguments

      updateResearchStatus(updateStreamingMessage, sessionId, messageId, {
        currentRound: 1,
        maxRounds: researchMaxRounds,
        currentSearch: String(searchQuery || ''),
        isSearching: true
      })
    }

    // Format tool results for saving
    const savedToolResults = formatToolResultsForSave(toolResult.toolResults || [])

    // Calculate initial search count
    const totalSearchCount = toolResult.toolResults?.filter(
      (r: any) => r.toolCall.name === 'web_search'
    ).length || 0

    // Determine if more tool calls are needed (model decides - no cap)
    const needsMoreToolCalls = toolResult.needsFollowUp && toolResult.formattedResults.length > 0

    return {
      toolResults: savedToolResults.length > 0 ? savedToolResults : null,
      totalSearchCount,
      needsMoreToolCalls,
      lastAssistantMessage: reconstructedMessage,
      formattedResults: toolResult.formattedResults
    }
  }, [handleToolCalls, updateResearchStatus, formatToolResultsForSave])

  return {
    canUseTools,
    getToolsForRequest,
    handleToolCalls,
    clearToolState,
    startResearchMode,
    getResearchContext,
    toolCallAccumulator: {
      create: createAccumulator,
      accumulate: accumulateToolCalls,
      hasToolCalls,
      getToolCalls,
      clear: clearAccumulator,
    },
    processToolCallsWithResearch,
    updateResearchStatus,
    formatToolResultsForSave,
  }
}

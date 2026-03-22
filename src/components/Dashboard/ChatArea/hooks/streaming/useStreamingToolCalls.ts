/**
 * useStreamingToolCalls - Shared tool calling orchestration for streaming chat
 */

import { useCallback } from 'react'
import { useToolCalling, type ToolCallState } from '../../../../../hooks/useToolCalling'
import { useResearchMode } from './useResearchMode'
import { useToast } from '../../../../shared/Toast'
import type { ToolCallResult } from '../../../../../tools/toolManager'
import type { OpenRouterResponse } from '../../../../../tools/types'
import type { HandleToolCallsOptions, StreamingSettings } from './types'

export interface ToolCallProcessingResult {
  hasTools: boolean
  toolResults: ToolCallResult[]
  formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
  needsFollowUp: boolean
}

export interface UseStreamingToolCallsOptions {
  settings: StreamingSettings
}

export interface UseStreamingToolCallsReturn {
  canUseTools: boolean
  getToolsForRequest: ReturnType<typeof useToolCalling>['getToolsForRequest']
  handleToolCalls: (response: OpenRouterResponse, options?: HandleToolCallsOptions) => Promise<ToolCallProcessingResult>
  toolState: ToolCallState
  clearToolState: () => void
  startResearchMode: (maxRounds: number, forceWebSearch?: boolean) => void
  getResearchContext: (searchCount: number, maxRounds: number) => string
}

export function useStreamingToolCalls({ settings }: UseStreamingToolCallsOptions): UseStreamingToolCallsReturn {
  const { showToast } = useToast()

  const {
    canUseTools,
    getToolsForRequest,
    handleToolCalls: baseHandleToolCalls,
    toolState,
    clearToolState,
  } = useToolCalling()

  const { startResearchMode, getResearchContext } = useResearchMode({
    canUseTools,
    webSearchPrompt: settings.webSearchPrompt,
  })

  const handleToolCalls = useCallback(async (
    response: OpenRouterResponse,
    options?: HandleToolCallsOptions
  ): Promise<ToolCallProcessingResult> => {
    try {
      return await baseHandleToolCalls(
        response,
        options?.onToolStart,
        options?.onToolComplete
      )
    } catch (toolError: unknown) {
      const message = toolError instanceof Error ? toolError.message : 'Unknown error'
      console.error('Tool calls processing error:', toolError)
      showToast(`Tool execution error: ${message}`, 'error')
      return {
        hasTools: false,
        toolResults: [],
        formattedResults: [],
        needsFollowUp: false,
      }
    }
  }, [baseHandleToolCalls, showToast])

  return {
    canUseTools,
    getToolsForRequest,
    handleToolCalls,
    toolState,
    clearToolState,
    startResearchMode,
    getResearchContext,
  }
}

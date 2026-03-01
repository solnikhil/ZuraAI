/**
 * useGroqStreaming - Provider-specific streaming hook for Groq
 * 
 * Extracts Groq streaming logic from useStreamingChat to reduce complexity.
 * Supports tool calling and research mode.
 * 
 * Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
 */

import { useCallback } from 'react'
import { useStreamingActions } from '../../../../../contexts/StreamingContext'
import { streamGroqCompletion } from '../../../../../services/groq'
import type {
  StreamingResult,
  ToolCallingOptions,
  UpdateStreamingCallback,
  FlushCallback,
  ToolCallingHook,
  StreamingSettings,
} from './types'
import type { ThinkingBlock, ToolCallResult } from '../../../../../contexts/ChatHistoryContext'
import {
  UPDATE_INTERVAL,
  SMOOTH_UPDATE_INTERVAL,
  SAFETY_CAP,
  MAX_RESEARCH_ROUNDS,
  fillMissingUsage,
  accumulateDeltaToolCalls,
  reconstructToolCallMessage,
  buildResponseWithFallback,
  createResearchPlanCallbacks,
  processInitialToolResults,
  buildThinkingBlocksFromResults,
  mergeSavedToolResults,
  hasSearchResults,
  stripStandaloneHorizontalRule,
  computeStreamMetrics,
  buildFollowUpMessages,
  type DeltaToolCall,
} from './streamingUtils'

export interface UseGroqStreamingOptions {
  settings: StreamingSettings
  toolCalling: ToolCallingHook
  updateStreamingMessage: UpdateStreamingCallback
  flushThrottledUpdates: FlushCallback
  throttledUpdateStreamingMessage: UpdateStreamingCallback
}

export interface UseGroqStreamingReturn {
  streamGroq: (options: ToolCallingOptions) => Promise<StreamingResult>
}

/**
 * Hook for Groq-specific streaming logic with tool calling support
 */
export function useGroqStreaming({
  settings,
  toolCalling,
  updateStreamingMessage,
  flushThrottledUpdates,
  throttledUpdateStreamingMessage,
}: UseGroqStreamingOptions): UseGroqStreamingReturn {
  const { updateStreaming } = useStreamingActions()
  const updateInterval = settings.streamResponses ? SMOOTH_UPDATE_INTERVAL : UPDATE_INTERVAL

  const streamGroq = useCallback(async (
    options: ToolCallingOptions
  ): Promise<StreamingResult> => {
    const {
      sessionId,
      messageId,
      messages: optimizedHistory,
      startTime,
      researchMaxRounds,
      researchMandatory,
      signal,
    } = options

    const { canUseTools, getToolsForRequest, handleToolCalls, getResearchContext } = toolCalling
    const tools = canUseTools ? getToolsForRequest() : null
    const groqTools = tools && Array.isArray(tools) ? tools : undefined

    let accumulatedContent = ''
    let lastUpdateTime = Date.now()
    let finalUsage: Record<string, number> = {}
    let hasToolCallsFlag = false
    let toolCallsAccumulator: DeltaToolCall[] = []
    let finishReason: string | null = null
    let savedToolResults: ToolCallResult[] | undefined = undefined
    let firstTokenTime: number | null = null
    let localThinkingBlocks: ThinkingBlock[] = []

    const initialForceToolUse = researchMandatory && researchMaxRounds > 0
    const initialToolChoice = initialForceToolUse
      ? { type: 'function' as const, function: { name: 'web_search' } }
      : undefined

    // --- Initial stream ---
    for await (const chunk of streamGroqCompletion(
      settings.groqApiKey || '',
      settings.aiModel,
      optimizedHistory,
      { temperature: settings.temperature, tools: groqTools, toolChoice: initialToolChoice, signal }
    )) {
      const delta = chunk.choices?.[0]?.delta?.content || ''
      if (!firstTokenTime && delta) firstTokenTime = performance.now()
      accumulatedContent += delta

      if (chunk.choices?.[0]?.delta?.tool_calls) {
        hasToolCallsFlag = true
        accumulateDeltaToolCalls(toolCallsAccumulator, chunk.choices[0].delta.tool_calls)
      }

      if (chunk.choices?.[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason
        if (finishReason === 'tool_calls') hasToolCallsFlag = true
      }

      if (chunk.usage) finalUsage = chunk.usage

      const now = Date.now()
      if (now - lastUpdateTime >= updateInterval) {
        throttledUpdateStreamingMessage(sessionId, messageId, { content: accumulatedContent })
        lastUpdateTime = now
      }
    }

    // Flush + final content state
    flushThrottledUpdates()
    updateStreamingMessage(sessionId, messageId, { content: accumulatedContent })

    let usage = fillMissingUsage(
      { inputTokens: finalUsage.prompt_tokens || 0, outputTokens: finalUsage.completion_tokens || 0, totalTokens: finalUsage.total_tokens || 0 },
      accumulatedContent
    )

    // --- Handle tool calls with research loop ---
    if (canUseTools && hasToolCallsFlag && finishReason === 'tool_calls' && toolCallsAccumulator.filter(tc => tc?.id).length > 0) {
      const reconstructedMessage = reconstructToolCallMessage(accumulatedContent, toolCallsAccumulator)
      const responseWithFallback = buildResponseWithFallback(reconstructedMessage, optimizedHistory)
      const researchPlanCallbacks = createResearchPlanCallbacks(updateStreaming as (u: Record<string, unknown>) => void, throttledUpdateStreamingMessage, sessionId, messageId)

      let toolResult
      try {
        toolResult = await handleToolCalls(responseWithFallback, researchPlanCallbacks)
      } catch (toolError: unknown) {
        console.error('Tool calls processing error:', toolError)
        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
      }

      // Process initial tool results
      const processed = processInitialToolResults(toolResult.toolResults || [], localThinkingBlocks, researchMaxRounds)
      localThinkingBlocks = processed.updatedThinkingBlocks
      savedToolResults = processed.savedToolResults

      if (processed.hasSearchCalls) {
        updateStreamingMessage(sessionId, messageId, {
          researchStatus: { currentRound: 1, maxRounds: researchMaxRounds, currentSearch: processed.searchQuery, isSearching: true },
          thinkingBlocks: localThinkingBlocks,
        })
      }

      // Research loop
      if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
        let totalSearchCount = toolResult.toolResults?.filter((r: ToolCallResult) => r.toolCall.name === 'web_search').length || 0
        let hasMoreToolCalls = true
        let lastAssistantMessage = reconstructedMessage
        let researchRound = 1

        while (hasMoreToolCalls && researchRound < SAFETY_CAP) {
          const researchContextMsg = getResearchContext(totalSearchCount, researchMaxRounds, researchMandatory)
          const followUpMessages = buildFollowUpMessages(researchContextMsg, researchRound, totalSearchCount, optimizedHistory, lastAssistantMessage, toolResult.formattedResults)

          let followUpContent = ''
          let followUpToolCalls: DeltaToolCall[] = []
          let followUpUsage: Record<string, number> = {}

          for await (const chunk of streamGroqCompletion(
            settings.groqApiKey || '',
            settings.aiModel,
            followUpMessages,
            { temperature: settings.temperature, tools: groqTools, toolChoice: undefined, signal }
          )) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            followUpContent += delta

            if (chunk.choices?.[0]?.delta?.tool_calls) {
              accumulateDeltaToolCalls(followUpToolCalls, chunk.choices[0].delta.tool_calls)
            }

            if (chunk.usage) followUpUsage = chunk.usage

            const now = Date.now()
            if (now - lastUpdateTime >= updateInterval) {
              throttledUpdateStreamingMessage(sessionId, messageId, { content: accumulatedContent + followUpContent })
              lastUpdateTime = now
            }
          }

          accumulatedContent += followUpContent
          flushThrottledUpdates()
          updateStreamingMessage(sessionId, messageId, { content: accumulatedContent })

          usage = fillMissingUsage(
            {
              inputTokens: (usage.inputTokens || 0) + (followUpUsage.prompt_tokens || 0),
              outputTokens: (usage.outputTokens || 0) + (followUpUsage.completion_tokens || 0),
              totalTokens: (usage.totalTokens || 0) + (followUpUsage.total_tokens || 0),
            },
            accumulatedContent
          )

          const hasValidToolCalls = followUpToolCalls.length > 0 && followUpToolCalls.some(tc => tc?.function?.name)
          if (hasValidToolCalls) {
            const reconstructedFollowUp = reconstructToolCallMessage(followUpContent, followUpToolCalls)
            const followUpResponseWithFallback = buildResponseWithFallback(reconstructedFollowUp, optimizedHistory)

            let nextToolResult
            try {
              nextToolResult = await handleToolCalls(followUpResponseWithFallback, researchPlanCallbacks)
            } catch (e: unknown) {
              nextToolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
            }

            const newWebSearches = nextToolResult.toolResults?.filter((r: ToolCallResult) => r.toolCall.name === 'web_search').length || 0
            const newResearchPlanSteps = nextToolResult.toolResults?.filter((r: ToolCallResult) => r.toolCall.name === 'research_plan')
              .flatMap((r: ToolCallResult) => (r.toolCall.arguments as Record<string, unknown>)?.steps as unknown[] || []).length || 0
            totalSearchCount += newWebSearches + newResearchPlanSteps

            localThinkingBlocks = buildThinkingBlocksFromResults(nextToolResult.toolResults || [], localThinkingBlocks)
            savedToolResults = mergeSavedToolResults(savedToolResults, nextToolResult.toolResults || [])
            lastAssistantMessage = reconstructedFollowUp
            toolResult = nextToolResult
            researchRound++

            hasMoreToolCalls = researchRound >= MAX_RESEARCH_ROUNDS ? false : nextToolResult.needsFollowUp
          } else {
            hasMoreToolCalls = false
          }
        }
      }
    }

    // --- Final metrics ---
    const metrics = computeStreamMetrics(startTime, firstTokenTime, usage.outputTokens)
    usage = fillMissingUsage(usage, accumulatedContent)
    const tps = usage.outputTokens > 0 && metrics.latency > 0 ? (usage.outputTokens / (metrics.latency / 1000)) : undefined

    const finalContent = hasSearchResults(savedToolResults) ? stripStandaloneHorizontalRule(accumulatedContent) : accumulatedContent

    updateStreamingMessage(sessionId, messageId, {
      content: finalContent,
      model: `groq/${settings.aiModel}`,
      latency: metrics.latency,
      usage: { ...usage, tps, ttft: metrics.ttft },
      toolResults: savedToolResults,
      ...(localThinkingBlocks.length > 0 ? { thinkingBlocks: localThinkingBlocks } : {}),
    })

    return {
      content: finalContent,
      model: `groq/${settings.aiModel}`,
      toolResults: savedToolResults,
      thinkingBlocks: localThinkingBlocks.length > 0 ? localThinkingBlocks : undefined,
      usage: { ...usage, tps, ttft: metrics.ttft },
      latency: metrics.latency,
      finishReason: finishReason || undefined,
    }
  }, [settings, toolCalling, updateStreamingMessage, flushThrottledUpdates, throttledUpdateStreamingMessage, updateStreaming, updateInterval])

  return { streamGroq }
}

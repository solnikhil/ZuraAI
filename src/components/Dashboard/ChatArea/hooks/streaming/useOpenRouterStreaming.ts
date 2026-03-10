/**
 * useOpenRouterStreaming - Provider-specific streaming hook for OpenRouter
 *
 * Extracts OpenRouter streaming logic from useStreamingChat to reduce complexity.
 * Supports tool calling, research mode, reasoning/thinking, and cached tokens.
 *
 * Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
 */

import { useCallback } from 'react'
import { useStreamingActions } from '../../../../../contexts/StreamingContext'
import { streamOpenRouterCompletion } from '../../../../../services/openrouter'
import { getOpenRouterApiKey } from '../../../../../utils/openRouterKey'
import type { ThinkingBlock, ToolCallResult } from '../../../../../contexts/ChatHistoryContext'
import type {
  StreamingResult,
  OpenRouterStreamingOptions,
  UpdateStreamingCallback,
  FlushCallback,
  ToolCallingHook,
  StreamingSettings,
} from './types'
import {
  SAFETY_CAP,
  MAX_RESEARCH_ROUNDS,
  getStreamingUpdateInterval,
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
  extractResearchPlanData,
  type DeltaToolCall,
} from './streamingUtils'

export interface UseOpenRouterStreamingOptions {
  settings: StreamingSettings
  toolCalling: ToolCallingHook
  updateStreamingMessage: UpdateStreamingCallback
  flushThrottledUpdates: FlushCallback
  throttledUpdateStreamingMessage: UpdateStreamingCallback
}

export interface UseOpenRouterStreamingReturn {
  streamOpenRouter: (options: OpenRouterStreamingOptions) => Promise<StreamingResult>
}

// ---------------------------------------------------------------------------
// OpenRouter-specific helpers
// ---------------------------------------------------------------------------

/** Parse reasoning tokens from OpenRouter usage chunks */
function extractReasoningTokens(usage: Record<string, unknown>): number {
  return (
    (usage.completion_tokens_details as Record<string, number> | undefined)?.reasoning_tokens ||
    (usage as Record<string, number>).reasoning_tokens ||
    0
  )
}

/** Parse OpenRouter usage into our standard format (includes cached token support) */
function parseOpenRouterUsage(
  raw: Record<string, number>,
  thinkingTokens: number
): StreamingResult['usage'] & { inputTokens: number; outputTokens: number; totalTokens: number } {
  return {
    inputTokens: raw.prompt_tokens || 0,
    outputTokens: raw.completion_tokens || 0,
    totalTokens: raw.total_tokens || 0,
    thinkingTokens: thinkingTokens > 0 ? thinkingTokens : undefined,
    cachedInputTokens: raw.prompt_cache_tokens || undefined,
    cachedOutputTokens: raw.completion_cache_tokens || undefined,
  }
}

/** Accumulate usage from a research-loop follow-up into existing usage */
function mergeUsage(
  existing: ReturnType<typeof parseOpenRouterUsage>,
  followUp: Record<string, number>,
  totalThinkingTokens: number
): ReturnType<typeof parseOpenRouterUsage> {
  return {
    inputTokens: (existing.inputTokens || 0) + (followUp.prompt_tokens || 0),
    outputTokens: (existing.outputTokens || 0) + (followUp.completion_tokens || 0),
    totalTokens: (existing.totalTokens || 0) + (followUp.total_tokens || 0),
    thinkingTokens: totalThinkingTokens > 0 ? totalThinkingTokens : undefined,
    cachedInputTokens: ((existing.cachedInputTokens || 0) + (followUp.prompt_cache_tokens || 0)) || undefined,
    cachedOutputTokens: ((existing.cachedOutputTokens || 0) + (followUp.completion_cache_tokens || 0)) || undefined,
  }
}

/**
 * Compute initial tool choice based on available tools, research settings, and forceWebSearch.
 */
function computeInitialToolChoice(
  openRouterTools: DeltaToolCall[] | undefined,
  forceWebSearch: boolean
): 'auto' | 'none' | { type: 'function'; function: { name: string } } | undefined {
  if (!openRouterTools) return undefined

  const hasResearchPlan = openRouterTools.some(t => t?.function?.name === 'research_plan')

  if (hasResearchPlan) {
    return { type: 'function', function: { name: 'research_plan' } }
  }
  if (forceWebSearch) {
    return { type: 'function', function: { name: 'web_search' } }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook for OpenRouter-specific streaming logic with tool calling and reasoning support
 */
export function useOpenRouterStreaming({
  settings,
  toolCalling,
  updateStreamingMessage,
  flushThrottledUpdates,
  throttledUpdateStreamingMessage,
}: UseOpenRouterStreamingOptions): UseOpenRouterStreamingReturn {
  const { updateStreaming } = useStreamingActions()
  const updateInterval = getStreamingUpdateInterval()

  const streamOpenRouter = useCallback(async (
    options: OpenRouterStreamingOptions
  ): Promise<StreamingResult> => {
    const {
      sessionId,
      messageId,
      messages: openRouterMessages,
      startTime,
      researchMaxRounds,
      forceWebSearch,
      signal,
    } = options

    const { canUseTools, getToolsForRequest, handleToolCalls, getResearchContext } = toolCalling
    const tools = canUseTools ? getToolsForRequest() : null
    const openRouterTools = tools && Array.isArray(tools) && tools.length > 0 ? tools : undefined

    let accumulatedContent = ''
    let accumulatedReasoning = ''
    let lastUpdateTime = Date.now()
    let finalUsage: Record<string, unknown> = {}
    let totalThinkingTokens = 0
    let hasToolCallsFlag = false
    let toolCallsAccumulator: DeltaToolCall[] = []
    let finishReason: string | null = null
    let savedToolResults: ToolCallResult[] | undefined = undefined
    let localThinkingBlocks: ThinkingBlock[] = []
    let firstTokenTime: number | null = null

    // Reasoning/thinking time tracking (OpenRouter-specific)
    let thinkingStartTime: number | null = null
    let thinkingEndTime: number | null = null
    let thinkingDuration: number | undefined = undefined

    const initialToolChoice = computeInitialToolChoice(
      openRouterTools as DeltaToolCall[] | undefined,
      forceWebSearch
    )

    // --- Initial stream ---
    for await (const chunk of streamOpenRouterCompletion(
      getOpenRouterApiKey(settings.openRouterApiKey),
      settings.aiModel,
      openRouterMessages,
      { temperature: settings.temperature, tools: openRouterTools, toolChoice: initialToolChoice, signal }
    )) {
      const delta = chunk.choices?.[0]?.delta?.content || ''
      if (!firstTokenTime && delta) firstTokenTime = performance.now()

      // Reasoning (simple format)
      const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning || ''
      if (reasoningDelta) {
        if (!thinkingStartTime) thinkingStartTime = performance.now()
        accumulatedReasoning += reasoningDelta
        throttledUpdateStreamingMessage(sessionId, messageId, {
          content: accumulatedContent,
          thinking: accumulatedReasoning,
        })
      }

      // Reasoning (extended format, e.g. DeepSeek R1)
      const reasoningDetails = chunk.choices?.[0]?.delta?.reasoning_details
      if (reasoningDetails && reasoningDetails.length > 0) {
        if (!thinkingStartTime) thinkingStartTime = performance.now()
        for (const detail of reasoningDetails) {
          if (detail.type === 'text' && typeof detail.content === 'string') {
            accumulatedReasoning += detail.content
          }
        }
        throttledUpdateStreamingMessage(sessionId, messageId, {
          content: accumulatedContent,
          thinking: accumulatedReasoning,
        })
      }

      // Mark thinking as done when content starts after reasoning
      if (delta && accumulatedReasoning && !thinkingEndTime) {
        thinkingEndTime = performance.now()
        if (thinkingStartTime) thinkingDuration = thinkingEndTime - thinkingStartTime
      }

      if (delta) accumulatedContent += delta

      if (chunk.choices?.[0]?.delta?.tool_calls) {
        hasToolCallsFlag = true
        accumulateDeltaToolCalls(toolCallsAccumulator, chunk.choices[0].delta.tool_calls)
      }

      if (chunk.usage) {
        finalUsage = chunk.usage
        const rt = extractReasoningTokens(chunk.usage)
        if (rt > 0) totalThinkingTokens += rt
      }

      if (chunk.choices?.[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason
        if (finishReason === 'tool_calls') hasToolCallsFlag = true
      }

      const now = Date.now()
      if (now - lastUpdateTime >= updateInterval) {
        throttledUpdateStreamingMessage(sessionId, messageId, {
          content: accumulatedContent,
          thinking: accumulatedReasoning || undefined,
          thinkingDuration,
        })
        lastUpdateTime = now
      }
    }

    // Finalize thinking duration if stream ended while still reasoning
    if (accumulatedReasoning && !thinkingEndTime) {
      thinkingEndTime = performance.now()
      if (thinkingStartTime) thinkingDuration = thinkingEndTime - thinkingStartTime
    }

    // Flush + final content state
    flushThrottledUpdates()
    updateStreamingMessage(sessionId, messageId, {
      content: accumulatedContent,
      thinking: accumulatedReasoning || undefined,
      thinkingDuration,
    })

    let usage = parseOpenRouterUsage(finalUsage as Record<string, number>, totalThinkingTokens)

    // --- Handle tool calls with research loop ---
    if (canUseTools && hasToolCallsFlag && finishReason === 'tool_calls' && toolCallsAccumulator.filter(tc => tc?.id).length > 0) {
      const reconstructedMessage = reconstructToolCallMessage(accumulatedContent, toolCallsAccumulator)
      const responseWithFallback = buildResponseWithFallback(reconstructedMessage, openRouterMessages, accumulatedReasoning)
      const researchPlanCallbacks = createResearchPlanCallbacks(
        updateStreaming as (u: Record<string, unknown>) => void,
        throttledUpdateStreamingMessage,
        sessionId,
        messageId
      )

      let toolResult
      try {
        toolResult = await handleToolCalls(responseWithFallback, researchPlanCallbacks)
      } catch (toolError: unknown) {
        console.error('[Zura] Tool calls processing error:', toolError)
        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
      }

      // Process initial tool results
      const processed = processInitialToolResults(toolResult.toolResults || [], localThinkingBlocks)
      localThinkingBlocks = processed.updatedThinkingBlocks
      savedToolResults = processed.savedToolResults

      if (processed.hasSearchCalls) {
        const researchStatus = { currentRound: 1, maxRounds: researchMaxRounds, currentSearch: processed.searchQuery, isSearching: true }
        throttledUpdateStreamingMessage(sessionId, messageId, {
          researchStatus,
          ...(accumulatedReasoning ? { thinking: accumulatedReasoning } : {}),
          thinkingBlocks: localThinkingBlocks,
        })
        updateStreamingMessage(sessionId, messageId, { researchStatus, thinkingBlocks: localThinkingBlocks })
      }

      // Research loop
      if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
        let totalSearchCount = toolResult.toolResults?.filter((r: ToolCallResult) => r.toolCall.name === 'web_search').length || 0
        let hasMoreToolCalls = true
        let lastAssistantMessage = reconstructedMessage
        let researchRound = 1

        while (hasMoreToolCalls && researchRound < SAFETY_CAP) {
          const researchContextMsg = getResearchContext(totalSearchCount, researchMaxRounds)
          // Do NOT use tool_choice: "none" - many OpenRouter providers return 404
          const toolChoice: 'auto' | 'none' | undefined = undefined

          const followUpMessages = buildFollowUpMessages(
            researchContextMsg, researchRound, totalSearchCount,
            openRouterMessages, lastAssistantMessage, toolResult.formattedResults
          )

          let followUpContent = ''
          let followUpReasoning = ''
          let followUpToolCalls: DeltaToolCall[] = []
          let followUpUsage: Record<string, unknown> = {}

          const loopResearchStatus = { currentRound: researchRound, maxRounds: researchMaxRounds, isSearching: false }
          throttledUpdateStreamingMessage(sessionId, messageId, { researchStatus: loopResearchStatus })
          updateStreamingMessage(sessionId, messageId, { researchStatus: loopResearchStatus })

          // Brief delay before follow-up call to avoid triggering provider rate limits
          await new Promise(resolve => setTimeout(resolve, 1500))

          for await (const chunk of streamOpenRouterCompletion(
            getOpenRouterApiKey(settings.openRouterApiKey),
            settings.aiModel,
            followUpMessages,
            { temperature: settings.temperature, tools: openRouterTools, toolChoice, signal }
          )) {
            if ((chunk as unknown as Record<string, unknown>).error) {
              console.error('[Zura] Research loop stream error:', (chunk as unknown as Record<string, unknown>).error)
            }
            const delta = chunk.choices?.[0]?.delta?.content || ''
            followUpContent += delta

            // Reasoning in follow-up rounds
            const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning || ''
            if (reasoningDelta) {
              followUpReasoning += reasoningDelta
              const combinedThinking = accumulatedReasoning + (accumulatedReasoning ? '\n\n---\n\n' : '') + followUpReasoning
              throttledUpdateStreamingMessage(sessionId, messageId, {
                content: accumulatedContent + followUpContent,
                thinking: combinedThinking,
              })
            }

            if (chunk.choices?.[0]?.delta?.tool_calls) {
              accumulateDeltaToolCalls(followUpToolCalls, chunk.choices[0].delta.tool_calls)
            }

            if (chunk.usage) {
              followUpUsage = chunk.usage
              const rt = extractReasoningTokens(chunk.usage)
              if (rt > 0) totalThinkingTokens += rt
            }

            const now = Date.now()
            if (now - lastUpdateTime >= updateInterval) {
              const combinedThinking = accumulatedReasoning + (accumulatedReasoning ? '\n\n---\n\n' : '') + followUpReasoning
              throttledUpdateStreamingMessage(sessionId, messageId, {
                content: accumulatedContent + followUpContent,
                thinking: combinedThinking || undefined,
              })
              lastUpdateTime = now
            }
          }

          accumulatedContent += followUpContent
          if (followUpReasoning) {
            accumulatedReasoning += (accumulatedReasoning ? '\n\n---\n\n' : '') + followUpReasoning
          }
          flushThrottledUpdates()
          const contentUpdate = {
            content: accumulatedContent,
            ...(accumulatedReasoning ? { thinking: accumulatedReasoning } : {}),
          }
          throttledUpdateStreamingMessage(sessionId, messageId, contentUpdate)
          updateStreamingMessage(sessionId, messageId, contentUpdate)

          usage = mergeUsage(usage, followUpUsage as Record<string, number>, totalThinkingTokens)

          const hasValidToolCalls = followUpToolCalls.length > 0 && followUpToolCalls.some(tc => tc?.function?.name)
          if (hasValidToolCalls) {
            const reconstructedFollowUp = reconstructToolCallMessage(followUpContent, followUpToolCalls)
            const followUpResponseWithFallback = buildResponseWithFallback(
              reconstructedFollowUp, openRouterMessages,
              followUpReasoning || accumulatedReasoning
            )

            let nextToolResult
            try {
              nextToolResult = await handleToolCalls(followUpResponseWithFallback, researchPlanCallbacks)
            } catch (e: unknown) {
              console.error('[Zura] Research loop: handleToolCalls failed:', e instanceof Error ? e.message : e, 'Round:', researchRound)
              nextToolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
            }

            const newWebSearches = nextToolResult.toolResults?.filter((r: ToolCallResult) => r.toolCall.name === 'web_search').length || 0
            totalSearchCount += newWebSearches

            // Update thinking blocks for web search UI
            localThinkingBlocks = buildThinkingBlocksFromResults(nextToolResult.toolResults || [], localThinkingBlocks)
            for (const tr of nextToolResult.toolResults || []) {
              if (tr.toolCall.name === 'web_search') {
                const args = tr.toolCall.arguments
                const searchQuery = typeof args === 'object' ? (args as Record<string, unknown>)?.query : args
                const webSearchUpdate = {
                  thinking: accumulatedReasoning,
                  thinkingDuration,
                  researchStatus: { currentRound: researchRound, maxRounds: researchMaxRounds, currentSearch: String(searchQuery || ''), isSearching: true },
                  thinkingBlocks: localThinkingBlocks,
                }
                throttledUpdateStreamingMessage(sessionId, messageId, webSearchUpdate)
                updateStreamingMessage(sessionId, messageId, webSearchUpdate)
              }
            }

            // Mark searching done
            flushThrottledUpdates()
            const doneSearchingUpdate = {
              researchStatus: { currentRound: researchRound, maxRounds: researchMaxRounds, isSearching: false },
              ...(accumulatedReasoning ? { thinking: accumulatedReasoning } : {}),
            }
            throttledUpdateStreamingMessage(sessionId, messageId, doneSearchingUpdate)
            updateStreamingMessage(sessionId, messageId, doneSearchingUpdate)

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
    const tps = usage.outputTokens > 0 && metrics.latency > 0 ? (usage.outputTokens / (metrics.latency / 1000)) : undefined

    const finalContent = hasSearchResults(savedToolResults)
      ? stripStandaloneHorizontalRule(accumulatedContent)
      : accumulatedContent

    const researchPlanData = extractResearchPlanData(savedToolResults)

    updateStreamingMessage(sessionId, messageId, {
      content: finalContent,
      ...(accumulatedReasoning ? { thinking: accumulatedReasoning } : {}),
      ...(thinkingDuration !== undefined ? { thinkingDuration } : {}),
      ...(localThinkingBlocks.length > 0 ? { thinkingBlocks: localThinkingBlocks } : {}),
      ...researchPlanData,
      model: `openrouter/${settings.aiModel}`,
      latency: metrics.latency,
      usage: { ...usage, tps, ttft: metrics.ttft },
      finishReason: finishReason || undefined,
      toolResults: savedToolResults,
    })

    return {
      content: finalContent,
      model: `openrouter/${settings.aiModel}`,
      thinking: accumulatedReasoning || undefined,
      thinkingDuration,
      thinkingBlocks: localThinkingBlocks.length > 0 ? localThinkingBlocks : undefined,
      toolResults: savedToolResults,
      usage: { ...usage, tps, ttft: metrics.ttft },
      latency: metrics.latency,
      finishReason: finishReason || undefined,
    }
  }, [settings, toolCalling, updateStreamingMessage, flushThrottledUpdates, throttledUpdateStreamingMessage, updateStreaming, updateInterval])

  return { streamOpenRouter }
}

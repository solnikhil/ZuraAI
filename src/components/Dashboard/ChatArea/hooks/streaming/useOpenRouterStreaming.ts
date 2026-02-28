/**
 * useOpenRouterStreaming - Provider-specific streaming hook for OpenRouter
 * 
 * Extracts OpenRouter streaming logic from useStreamingChat to reduce complexity.
 * Supports tool calling, research mode, and reasoning/thinking.
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
import { stripStandaloneHorizontalRule } from './streamingUtils'

const UPDATE_INTERVAL = 120 // ms
const SMOOTH_UPDATE_INTERVAL = 40 // ms

interface DeltaToolCall {
  index?: number
  id?: string
  type?: string
  function?: { name?: string; arguments?: string }
}

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
  const updateInterval = settings.streamResponses ? SMOOTH_UPDATE_INTERVAL : UPDATE_INTERVAL

  const streamOpenRouter = useCallback(async (
    options: OpenRouterStreamingOptions
  ): Promise<StreamingResult> => {
    const {
      sessionId,
      messageId,
      messages: openRouterMessages,
      startTime,
      researchMaxRounds,
      researchMandatory,
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
    let hasToolCalls = false
    let toolCallsAccumulator: DeltaToolCall[] = []
    let finishReason: string | null = null
    let savedToolResults: ToolCallResult[] | undefined = undefined
    let localThinkingBlocks: ThinkingBlock[] = []
    let firstTokenTime: number | null = null

    // Track thinking time
    let thinkingStartTime: number | null = null
    let thinkingEndTime: number | null = null
    let thinkingDuration: number | undefined = undefined

    // Set tool choice to force tool use when needed
    const hasResearchPlanOnly = openRouterTools?.some((t: DeltaToolCall) => t?.function?.name === 'research_plan') &&
      !openRouterTools?.some((t: DeltaToolCall) => t?.function?.name === 'web_search')
    const initialForceToolUse = (((researchMandatory && researchMaxRounds > 0) || forceWebSearch) && !!openRouterTools)
    let initialToolChoice: 'auto' | 'none' | { type: 'function'; function: { name: string } } | undefined
    if (hasResearchPlanOnly) {
      initialToolChoice = { type: 'function', function: { name: 'research_plan' } }
    } else if (initialForceToolUse) {
      initialToolChoice = { type: 'function', function: { name: 'web_search' } }
    }

    for await (const chunk of streamOpenRouterCompletion(
      getOpenRouterApiKey(settings.openRouterApiKey),
      settings.aiModel,
      openRouterMessages,
      { temperature: settings.temperature, tools: openRouterTools, toolChoice: initialToolChoice, signal }
    )) {
      const delta = chunk.choices?.[0]?.delta?.content || ''
      if (!firstTokenTime && delta) {
        firstTokenTime = performance.now()
      }

      const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning || ''
      const reasoningDetails = chunk.choices?.[0]?.delta?.reasoning_details
      if (reasoningDelta) {
        if (!thinkingStartTime) thinkingStartTime = performance.now()
        accumulatedReasoning += reasoningDelta

        throttledUpdateStreamingMessage(sessionId, messageId, {
          content: accumulatedContent,
          thinking: accumulatedReasoning
        })
      }

      // Handle reasoning_details (extended format from models like DeepSeek R1)
      if (reasoningDetails && reasoningDetails.length > 0) {
        if (!thinkingStartTime) thinkingStartTime = performance.now()
        for (const detail of reasoningDetails) {
          if (detail.type === 'text' && typeof detail.content === 'string') {
            accumulatedReasoning += detail.content
          }
        }
        throttledUpdateStreamingMessage(sessionId, messageId, {
          content: accumulatedContent,
          thinking: accumulatedReasoning
        })
      }

      // If we have content and were thinking, mark thinking as done
      if (delta && accumulatedReasoning && !thinkingEndTime) {
        thinkingEndTime = performance.now()
        if (thinkingStartTime) {
          thinkingDuration = thinkingEndTime - thinkingStartTime
        }
      }

      if (delta) accumulatedContent += delta

      if (chunk.choices?.[0]?.delta?.tool_calls) {
        hasToolCalls = true
        const deltaToolCalls = chunk.choices[0].delta.tool_calls
              deltaToolCalls?.forEach((tc: DeltaToolCall) => {
          const index = tc.index ?? 0
          if (!toolCallsAccumulator[index]) {
            toolCallsAccumulator[index] = { id: tc.id || '', type: tc.type || 'function', function: { name: '', arguments: '' } }
          }
          if (tc.function?.name) toolCallsAccumulator[index].function!.name += tc.function.name
          if (tc.function?.arguments) toolCallsAccumulator[index].function!.arguments += tc.function.arguments
        })
      }

      if (chunk.usage) {
        finalUsage = chunk.usage
        const reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens || chunk.usage.reasoning_tokens || 0
        if (reasoningTokens > 0) totalThinkingTokens += reasoningTokens
      }

      if (chunk.choices?.[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason
        if (finishReason === 'tool_calls') hasToolCalls = true
      }

      const now = Date.now()
      if (now - lastUpdateTime >= updateInterval) {
        throttledUpdateStreamingMessage(sessionId, messageId, {
          content: accumulatedContent,
          thinking: accumulatedReasoning || undefined,
          thinkingDuration
        })
        lastUpdateTime = now
      }
    }

    // Finalize thinking duration if not set
    if (accumulatedReasoning && !thinkingEndTime) {
      thinkingEndTime = performance.now()
      if (thinkingStartTime) {
        thinkingDuration = thinkingEndTime - thinkingStartTime
      }
    }

    // Flush throttled updates and apply final content state
    flushThrottledUpdates()
    updateStreamingMessage(sessionId, messageId, {
      content: accumulatedContent,
      thinking: accumulatedReasoning || undefined,
      thinkingDuration
    })

    let usage: { inputTokens: number; outputTokens: number; totalTokens: number; thinkingTokens?: number; cachedInputTokens?: number; cachedOutputTokens?: number } = {
      inputTokens: (finalUsage as Record<string, number>).prompt_tokens || 0,
      outputTokens: (finalUsage as Record<string, number>).completion_tokens || 0,
      totalTokens: (finalUsage as Record<string, number>).total_tokens || 0,
      thinkingTokens: totalThinkingTokens > 0 ? totalThinkingTokens : undefined,
      cachedInputTokens: (finalUsage as Record<string, number>).prompt_cache_tokens || undefined,
      cachedOutputTokens: (finalUsage as Record<string, number>).completion_cache_tokens || undefined
    }

    // Handle tool calls with research loop
    if (canUseTools && hasToolCalls && finishReason === 'tool_calls' && toolCallsAccumulator.filter((tc: DeltaToolCall) => tc?.id).length > 0) {
      const reconstructedMessage = {
        role: 'assistant',
        content: accumulatedContent,
        tool_calls: toolCallsAccumulator.filter((tc: DeltaToolCall) => tc?.id).map((tc: DeltaToolCall) => ({
          id: tc.id || '', type: (tc.type || 'function') as 'function',
          function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' }
        }))
      }

      const lastUserMsg = [...openRouterMessages].reverse().find((m: Record<string, unknown>) => m?.role === 'user')
      const lastUserContent = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : null

      const responseWithFallback = {
        choices: [{ message: reconstructedMessage }],
        _fallbackContext: {
          lastUserMessage: lastUserContent ?? undefined,
          reasoning: accumulatedReasoning || undefined
        }
      }

      const researchPlanCallbacks = {
          onToolStart: (toolCall: { id: string; name: string; arguments: Record<string, unknown> }) => {
            if (toolCall?.name === 'research_plan') {
              const args = toolCall.arguments as { topic?: string; steps?: Array<{ stepNumber: number; query: string; rationale?: string }> }
              if (args?.topic && Array.isArray(args?.steps)) {
                const plan = { topic: args.topic, steps: args.steps }
                updateStreaming({ researchPlan: plan })
                throttledUpdateStreamingMessage(sessionId, messageId, { researchPlan: plan })
              }
            }
          },
          onResearchPlanProgress: (currentStep: number, totalSteps: number, query?: string) => {
            updateStreaming({ researchProgress: { currentStep, totalSteps, currentQuery: query } })
            throttledUpdateStreamingMessage(sessionId, messageId, {
              researchProgress: { currentStep, totalSteps, currentQuery: query }
            })
          }
        }

      let toolResult
      try {
        toolResult = await handleToolCalls(responseWithFallback, researchPlanCallbacks)
      } catch (toolError: unknown) {
        console.error('[Zura] Tool calls processing error:', toolError)
        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
      }

      // Update researchStatus for web searches or research_plan (use throttled for display, updateStreamingMessage for session)
      const webSearchCalls = (toolResult.toolResults || []).filter((tr: ToolCallResult) => tr.toolCall.name === 'web_search')
      const researchPlanCalls = (toolResult.toolResults || []).filter((tr: ToolCallResult) => tr.toolCall.name === 'research_plan')
      const hasSearchCalls = webSearchCalls.length > 0 || researchPlanCalls.length > 0

      if (hasSearchCalls) {
        const firstSearch = webSearchCalls[0] || researchPlanCalls[0]
        const searchQuery = firstSearch?.toolCall?.name === 'research_plan'
          ? ((firstSearch.toolCall.arguments as Record<string, unknown>)?.steps as Array<{ query?: string }> | undefined)?.[0]?.query ?? ''
          : (typeof firstSearch?.toolCall?.arguments === 'object'
            ? (firstSearch?.toolCall?.arguments as Record<string, unknown>)?.query
            : firstSearch?.toolCall?.arguments)

        // Add thinkingBlocks for each web search or research_plan step
        for (const tr of toolResult.toolResults || []) {
          if (tr.toolCall.name === 'web_search') {
            const args = tr.toolCall.arguments
            const q = typeof args === 'object' ? args?.query : args
            localThinkingBlocks.push({
              type: 'searching',
              query: String(q || ''),
              timestamp: Date.now(),
              toolInput: typeof args === 'object' ? args : { query: args },
              toolOutput: { success: tr.result.success, data: tr.result.data, error: tr.result.error, executionTime: tr.result.executionTime }
            })
          } else if (tr.toolCall.name === 'research_plan' && Array.isArray(tr.toolCall.arguments?.steps)) {
            for (const step of tr.toolCall.arguments.steps) {
              localThinkingBlocks.push({
                type: 'searching',
                query: String(step?.query || ''),
                timestamp: Date.now(),
                toolInput: { query: step?.query },
                toolOutput: { success: tr.result.success, data: tr.result.data, error: tr.result.error, executionTime: tr.result.executionTime }
              })
            }
          }
        }

        const researchStatusUpdate = {
          researchStatus: {
            currentRound: 1,
            maxRounds: researchMaxRounds,
            currentSearch: String(searchQuery || ''),
            isSearching: true
          }
        }
        throttledUpdateStreamingMessage(sessionId, messageId, {
          ...researchStatusUpdate,
          ...(accumulatedReasoning ? { thinking: accumulatedReasoning } : {}),
          thinkingBlocks: localThinkingBlocks
        })
        updateStreamingMessage(sessionId, messageId, { ...researchStatusUpdate, thinkingBlocks: localThinkingBlocks })
      }

      savedToolResults = toolResult?.toolResults?.map((tr: ToolCallResult) => ({
        toolCall: { id: tr.toolCall.id, name: tr.toolCall.name, arguments: tr.toolCall.arguments },
        result: { success: tr.result.success, data: tr.result.data, error: tr.result.error, executionTime: tr.result.executionTime }
      })) || undefined

      if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
        // Research loop
        let totalSearchCount = toolResult.toolResults?.filter((r: ToolCallResult) => r.toolCall.name === 'web_search').length || 0
        let hasMoreToolCalls = true
        let lastAssistantMessage = reconstructedMessage
        let researchRound = 1

        const SAFETY_CAP = 50
        const MAX_RESEARCH_ROUNDS = 6 // Cap to prevent infinite loop when model keeps calling web_search
        while (hasMoreToolCalls && researchRound < SAFETY_CAP) {
          const researchContextMsg = getResearchContext(totalSearchCount, researchMaxRounds, researchMandatory)
          // Do NOT use tool_choice: "none" - many OpenRouter providers return 404 "No endpoints found that support the provided 'tool_choice' value"
          let toolChoice: 'auto' | 'none' | undefined = undefined

          const followUpMessages: Array<{ role: string; content: string; tool_calls?: unknown[] }> = []
          if (researchContextMsg) followUpMessages.push({ role: 'system', content: researchContextMsg })
          if (researchRound >= 4) {
            followUpMessages.push({ role: 'system', content: `\n\n*** STOP SEARCHING *** You have ${totalSearchCount} search results. Your next response MUST be your final synthesized answer. Do NOT call web_search again. Provide your comparison now.\n\n` })
          }
          followUpMessages.push(...openRouterMessages, lastAssistantMessage, ...toolResult.formattedResults)

          let followUpContent = ''
          let followUpReasoning = ''
          let followUpToolCalls: DeltaToolCall[] = []
          let followUpUsage: Record<string, unknown> = {}
          let chunkCount = 0
          let chunksWithContent = 0
          let chunksWithToolCalls = 0

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
            chunkCount++
            if ((chunk as unknown as Record<string, unknown>).error) {
              console.error('[Zura] Research loop stream error:', (chunk as unknown as Record<string, unknown>).error)
            }
            const delta = chunk.choices?.[0]?.delta?.content || ''
            if (delta) chunksWithContent++
            followUpContent += delta

            const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning || ''
            if (reasoningDelta) {
              followUpReasoning += reasoningDelta
              const combinedThinking = accumulatedReasoning + (accumulatedReasoning ? '\n\n---\n\n' : '') + followUpReasoning
              throttledUpdateStreamingMessage(sessionId, messageId, {
                content: accumulatedContent + followUpContent,
                thinking: combinedThinking
              })
            }

            if (chunk.choices?.[0]?.delta?.tool_calls) {
              chunksWithToolCalls++
              const deltaToolCalls = chunk.choices[0].delta.tool_calls
        deltaToolCalls?.forEach((tc: DeltaToolCall) => {
                const index = tc.index ?? 0
                if (!followUpToolCalls[index]) {
                  followUpToolCalls[index] = { id: tc.id || '', type: tc.type || 'function', function: { name: '', arguments: '' } }
                }
                if (tc.function?.name) followUpToolCalls[index].function!.name += tc.function.name
                if (tc.function?.arguments) followUpToolCalls[index].function!.arguments += tc.function.arguments
              })
            }

            if (chunk.usage) {
              followUpUsage = chunk.usage
              const reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens || chunk.usage.reasoning_tokens || 0
              if (reasoningTokens > 0) totalThinkingTokens += reasoningTokens
            }

            const now = Date.now()
            if (now - lastUpdateTime >= updateInterval) {
              const combinedThinking = accumulatedReasoning + (accumulatedReasoning ? '\n\n---\n\n' : '') + followUpReasoning
              throttledUpdateStreamingMessage(sessionId, messageId, {
                content: accumulatedContent + followUpContent,
                thinking: combinedThinking || undefined
              })
              lastUpdateTime = now
            }
          }

          accumulatedContent += followUpContent
          if (followUpReasoning) accumulatedReasoning += (accumulatedReasoning ? '\n\n---\n\n' : '') + followUpReasoning
          flushThrottledUpdates()
          const contentUpdate = { content: accumulatedContent, ...(accumulatedReasoning ? { thinking: accumulatedReasoning } : {}) }
          throttledUpdateStreamingMessage(sessionId, messageId, contentUpdate)
          updateStreamingMessage(sessionId, messageId, contentUpdate)

          const fuUsage = followUpUsage as Record<string, number>
          usage = {
            inputTokens: (usage.inputTokens || 0) + (fuUsage.prompt_tokens || 0),
            outputTokens: (usage.outputTokens || 0) + (fuUsage.completion_tokens || 0),
            totalTokens: (usage.totalTokens || 0) + (fuUsage.total_tokens || 0),
            thinkingTokens: totalThinkingTokens > 0 ? totalThinkingTokens : undefined,
            cachedInputTokens: ((usage.cachedInputTokens || 0) + (fuUsage.prompt_cache_tokens || 0)) || undefined,
            cachedOutputTokens: ((usage.cachedOutputTokens || 0) + (fuUsage.completion_cache_tokens || 0)) || undefined
          }

          const hasValidToolCalls = followUpToolCalls.length > 0 && followUpToolCalls.some((tc: DeltaToolCall) => tc?.function?.name)
          if (hasValidToolCalls) {
            const reconstructedFollowUp = {
              role: 'assistant', content: followUpContent,
              tool_calls: followUpToolCalls.filter((tc: DeltaToolCall) => tc?.function?.name).map((tc: DeltaToolCall) => ({
                id: tc.id || '', type: (tc.type || 'function') as 'function',
                function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' }
              }))
            }

            const followUpResponseWithFallback = {
              choices: [{ message: reconstructedFollowUp }],
              _fallbackContext: {
                lastUserMessage: lastUserContent ?? undefined,
                reasoning: followUpReasoning || accumulatedReasoning || undefined
              }
            }

            let nextToolResult
            try {
              nextToolResult = await handleToolCalls(followUpResponseWithFallback, researchPlanCallbacks)
            } catch (e: unknown) {
              console.error('[Zura] Research loop: handleToolCalls failed:', e instanceof Error ? e.message : e, 'Round:', researchRound)
              nextToolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
            }

            const newWebSearches = nextToolResult.toolResults?.filter((r: ToolCallResult) => r.toolCall.name === 'web_search').length || 0
            totalSearchCount += newWebSearches

            // Add thinkingBlocks for Web Search UI (no raw --- in thinking; tool call shows in block)
            for (const tr of nextToolResult.toolResults || []) {
              if (tr.toolCall.name === 'web_search') {
                const args = tr.toolCall.arguments
                const searchQuery = typeof args === 'object' ? args?.query : args
                localThinkingBlocks.push({
                  type: 'searching',
                  query: String(searchQuery || ''),
                  timestamp: Date.now(),
                  toolInput: typeof args === 'object' ? args : { query: args },
                  toolOutput: { success: tr.result.success, data: tr.result.data, error: tr.result.error, executionTime: tr.result.executionTime }
                })
                const webSearchUpdate = {
                  thinking: accumulatedReasoning,
                  thinkingDuration: thinkingDuration,
                  researchStatus: { currentRound: researchRound, maxRounds: researchMaxRounds, currentSearch: String(searchQuery || ''), isSearching: true },
                  thinkingBlocks: localThinkingBlocks
                }
                throttledUpdateStreamingMessage(sessionId, messageId, webSearchUpdate)
                updateStreamingMessage(sessionId, messageId, webSearchUpdate)
              }
            }

            // Update researchStatus to stop searching - include full thinking for session sync
            flushThrottledUpdates()
            const doneSearchingStatus = { currentRound: researchRound, maxRounds: researchMaxRounds, isSearching: false }
            const doneSearchingUpdate = {
              researchStatus: doneSearchingStatus,
              ...(accumulatedReasoning ? { thinking: accumulatedReasoning } : {})
            }
            throttledUpdateStreamingMessage(sessionId, messageId, doneSearchingUpdate)
            updateStreamingMessage(sessionId, messageId, doneSearchingUpdate)

            const newSavedResults = nextToolResult.toolResults?.map((tr: ToolCallResult) => ({
              toolCall: { id: tr.toolCall.id, name: tr.toolCall.name, arguments: tr.toolCall.arguments },
              result: { success: tr.result.success, data: tr.result.data, error: tr.result.error, executionTime: tr.result.executionTime }
            })) || []

            savedToolResults = savedToolResults ? [...savedToolResults, ...newSavedResults] : newSavedResults
            lastAssistantMessage = reconstructedFollowUp
            toolResult = nextToolResult
            researchRound++

            if (researchRound >= MAX_RESEARCH_ROUNDS) {
              hasMoreToolCalls = false
            } else {
              hasMoreToolCalls = nextToolResult.needsFollowUp
            }
          } else {
            hasMoreToolCalls = false
          }
        }
      }
    }

    const endTime = performance.now()
    const latency = Math.round(endTime - startTime)
    const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : undefined
    const tps = usage.outputTokens > 0 && latency > 0 ? (usage.outputTokens / (latency / 1000)) : undefined

    // When web search or research_plan was used, strip standalone --- so user sees Web Search block instead
    const hasWebSearch = (savedToolResults || []).some((r: ToolCallResult) =>
      r?.toolCall?.name === 'web_search' || r?.toolCall?.name === 'research_plan'
    )
    const finalContent = hasWebSearch ? stripStandaloneHorizontalRule(accumulatedContent) : accumulatedContent

    // Persist research plan and progress for research_plan tool results
    const researchPlanResult = (savedToolResults || []).find((r: ToolCallResult) => r?.toolCall?.name === 'research_plan')
    const rpArgs = researchPlanResult?.toolCall?.arguments as { topic?: string; steps?: Array<{ stepNumber: number; query: string; rationale?: string }> } | undefined
    const researchPlanData = rpArgs?.topic && Array.isArray(rpArgs?.steps)
      ? {
          researchPlan: {
            topic: rpArgs.topic,
            steps: rpArgs.steps
          },
          researchProgress: {
            currentStep: rpArgs.steps.length,
            totalSteps: rpArgs.steps.length
          }
        }
      : {}

    updateStreamingMessage(sessionId, messageId, {
      content: finalContent,
      ...(accumulatedReasoning ? { thinking: accumulatedReasoning } : {}),
      ...(thinkingDuration !== undefined ? { thinkingDuration } : {}),
      ...(localThinkingBlocks.length > 0 ? { thinkingBlocks: localThinkingBlocks } : {}),
      ...researchPlanData,
      model: `openrouter/${settings.aiModel}`,
      latency,
      usage: { ...usage, tps, ttft },
      finishReason: finishReason || undefined,
      toolResults: savedToolResults
    })

    return {
      content: finalContent,
      model: `openrouter/${settings.aiModel}`,
      thinking: accumulatedReasoning || undefined,
      thinkingDuration,
      thinkingBlocks: localThinkingBlocks.length > 0 ? localThinkingBlocks : undefined,
      toolResults: savedToolResults,
      usage: { ...usage, tps, ttft },
      latency,
      finishReason: finishReason || undefined,
    }
  }, [settings, toolCalling, updateStreamingMessage, flushThrottledUpdates, throttledUpdateStreamingMessage, updateStreaming, updateInterval])

  return { streamOpenRouter }
}

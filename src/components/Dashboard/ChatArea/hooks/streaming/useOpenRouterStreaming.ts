/**
 * useOpenRouterStreaming - Provider-specific streaming hook for OpenRouter
 * 
 * Extracts OpenRouter streaming logic from useStreamingChat to reduce complexity.
 * Supports tool calling, research mode, and reasoning/thinking.
 * 
 * Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
 */

import { useCallback } from 'react'
import { streamOpenRouterCompletion } from '../../../../../services/openrouter'
import { getOpenRouterApiKey } from '../../../../../utils/openRouterKey'
import type { ThinkingBlock } from '../../../../../contexts/ChatHistoryContext'
import type {
  StreamingResult,
  OpenRouterStreamingOptions,
  UpdateStreamingCallback,
  FlushCallback,
  ToolCallingHook,
  StreamingSettings,
} from './types'

const UPDATE_INTERVAL = 120 // ms
const SMOOTH_UPDATE_INTERVAL = 40 // ms

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
    let finalUsage: any = {}
    let totalThinkingTokens = 0
    let hasToolCalls = false
    let toolCallsAccumulator: any[] = []
    let finishReason: string | null = null
    let savedToolResults: any = null
    let localThinkingBlocks: ThinkingBlock[] = []
    let firstTokenTime: number | null = null

    // Track thinking time
    let thinkingStartTime: number | null = null
    let thinkingEndTime: number | null = null
    let thinkingDuration: number | undefined = undefined

    // For OpenRouter, avoid accidentally pinning max_tokens to 1000 from legacy settings.
    const requestedMaxTokens = (() => {
      const base = (typeof settings.maxTokens === 'number' && Number.isFinite(settings.maxTokens) && settings.maxTokens > 0)
        ? settings.maxTokens
        : 8000
      if (researchMaxRounds > 0) return 8000
      if (/:free\b/.test(String(settings.aiModel || '')) && base <= 1000) return 8000
      return base
    })()

    // Set tool choice for mandatory research mode to force web_search
    const initialForceToolUse = (((researchMandatory && researchMaxRounds > 0) || forceWebSearch) && !!openRouterTools)
    let initialToolChoice: 'auto' | 'none' | { type: 'function'; function: { name: string } } | undefined
    if (initialForceToolUse) {
      initialToolChoice = { type: 'function', function: { name: 'web_search' } }
    }

    for await (const chunk of streamOpenRouterCompletion(
      getOpenRouterApiKey(settings.openRouterApiKey),
      settings.aiModel,
      openRouterMessages,
      { temperature: settings.temperature, maxTokens: requestedMaxTokens, tools: openRouterTools, toolChoice: initialToolChoice, signal }
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
        deltaToolCalls?.forEach((tc: any) => {
          const index = tc.index ?? 0
          if (!toolCallsAccumulator[index]) {
            toolCallsAccumulator[index] = { id: tc.id || '', type: tc.type || 'function', function: { name: '', arguments: '' } }
          }
          if (tc.function?.name) toolCallsAccumulator[index].function.name += tc.function.name
          if (tc.function?.arguments) toolCallsAccumulator[index].function.arguments += tc.function.arguments
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

    let usage: any = {
      inputTokens: finalUsage.prompt_tokens || 0,
      outputTokens: finalUsage.completion_tokens || 0,
      totalTokens: finalUsage.total_tokens || 0,
      thinkingTokens: totalThinkingTokens > 0 ? totalThinkingTokens : undefined,
      cachedInputTokens: finalUsage.prompt_cache_tokens || undefined,
      cachedOutputTokens: finalUsage.completion_cache_tokens || undefined
    }

    // Handle tool calls with research loop
    if (canUseTools && hasToolCalls && finishReason === 'tool_calls' && toolCallsAccumulator.filter(tc => tc?.id).length > 0) {
      const reconstructedMessage = {
        role: 'assistant',
        content: accumulatedContent,
        tool_calls: toolCallsAccumulator.filter(tc => tc.id).map(tc => ({
          id: tc.id, type: tc.type || 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments }
        }))
      }

      let toolResult
      try {
        toolResult = await handleToolCalls({ choices: [{ message: reconstructedMessage }] })
      } catch (toolError: any) {
        console.error('Tool calls processing error:', toolError)
        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
      }

      // Update researchStatus for web searches
      const webSearchCalls = (toolResult.toolResults || []).filter((tr: any) => tr.toolCall.name === 'web_search')
      if (webSearchCalls.length > 0) {
        const firstSearchQuery = webSearchCalls[0]
        const searchQuery = typeof firstSearchQuery.toolCall.arguments === 'object'
          ? firstSearchQuery.toolCall.arguments?.query
          : firstSearchQuery.toolCall.arguments

        updateStreamingMessage(sessionId, messageId, {
          researchStatus: {
            currentRound: 1,
            maxRounds: researchMaxRounds,
            currentSearch: String(searchQuery || ''),
            isSearching: true
          }
        })
      }

      savedToolResults = toolResult?.toolResults?.map((tr: any) => ({
        toolCall: { id: tr.toolCall.id, name: tr.toolCall.name, arguments: tr.toolCall.arguments },
        result: { success: tr.result.success, data: tr.result.data, error: tr.result.error, executionTime: tr.result.executionTime }
      })) || null

      if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
        // Research loop
        let totalSearchCount = toolResult.toolResults?.filter((r: any) => r.toolCall.name === 'web_search').length || 0
        let hasMoreToolCalls = true
        let lastAssistantMessage = reconstructedMessage
        let researchRound = 1

        while (hasMoreToolCalls && researchRound < 10) {
          const researchContextMsg = getResearchContext(totalSearchCount, researchMaxRounds, researchMandatory)
          const remainingSearches = researchMaxRounds - totalSearchCount
          const forceToolUse = researchMandatory && remainingSearches > 0
          let toolChoice: any = forceToolUse ? { type: 'function', function: { name: 'web_search' } } : undefined

          const followUpMessages: any[] = []
          if (researchContextMsg) followUpMessages.push({ role: 'system', content: researchContextMsg })
          followUpMessages.push(...openRouterMessages, lastAssistantMessage, ...toolResult.formattedResults)

          let followUpContent = ''
          let followUpReasoning = ''
          let followUpToolCalls: any[] = []
          let followUpUsage: any = {}

          updateStreamingMessage(sessionId, messageId, {
            researchStatus: { currentRound: researchRound, maxRounds: researchMaxRounds, isSearching: false }
          })

          for await (const chunk of streamOpenRouterCompletion(
            getOpenRouterApiKey(settings.openRouterApiKey),
            settings.aiModel,
            followUpMessages,
            { temperature: settings.temperature, maxTokens: requestedMaxTokens, tools: openRouterTools, toolChoice, signal }
          )) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            followUpContent += delta

            const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning || ''
            if (reasoningDelta) {
              followUpReasoning += reasoningDelta
              throttledUpdateStreamingMessage(sessionId, messageId, {
                content: accumulatedContent + followUpContent,
                thinking: followUpReasoning
              })
            }

            if (chunk.choices?.[0]?.delta?.tool_calls) {
              const deltaToolCalls = chunk.choices[0].delta.tool_calls
              deltaToolCalls?.forEach((tc: any) => {
                const index = tc.index ?? 0
                if (!followUpToolCalls[index]) {
                  followUpToolCalls[index] = { id: tc.id || '', type: tc.type || 'function', function: { name: '', arguments: '' } }
                }
                if (tc.function?.name) followUpToolCalls[index].function.name += tc.function.name
                if (tc.function?.arguments) followUpToolCalls[index].function.arguments += tc.function.arguments
              })
            }

            if (chunk.usage) {
              followUpUsage = chunk.usage
              const reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens || chunk.usage.reasoning_tokens || 0
              if (reasoningTokens > 0) totalThinkingTokens += reasoningTokens
            }

            const now = Date.now()
            if (now - lastUpdateTime >= updateInterval) {
              throttledUpdateStreamingMessage(sessionId, messageId, {
                content: accumulatedContent + followUpContent,
                thinking: followUpReasoning || undefined
              })
              lastUpdateTime = now
            }
          }

          accumulatedContent += followUpContent
          if (followUpReasoning) accumulatedReasoning = followUpReasoning
          flushThrottledUpdates()
          updateStreamingMessage(sessionId, messageId, { content: accumulatedContent })

          usage = {
            inputTokens: (usage.inputTokens || 0) + (followUpUsage.prompt_tokens || 0),
            outputTokens: (usage.outputTokens || 0) + (followUpUsage.completion_tokens || 0),
            totalTokens: (usage.totalTokens || 0) + (followUpUsage.total_tokens || 0),
            thinkingTokens: totalThinkingTokens > 0 ? totalThinkingTokens : undefined,
            cachedInputTokens: ((usage.cachedInputTokens || 0) + (followUpUsage.prompt_cache_tokens || 0)) || undefined,
            cachedOutputTokens: ((usage.cachedOutputTokens || 0) + (followUpUsage.completion_cache_tokens || 0)) || undefined
          }

          if (followUpToolCalls.length > 0 && followUpToolCalls.some(tc => tc.function.name)) {
            const reconstructedFollowUp = {
              role: 'assistant', content: followUpContent,
              tool_calls: followUpToolCalls.filter(tc => tc.function.name).map(tc => ({
                id: tc.id, type: tc.type || 'function',
                function: { name: tc.function.name, arguments: tc.function.arguments }
              }))
            }

            let nextToolResult
            try {
              nextToolResult = await handleToolCalls({ choices: [{ message: reconstructedFollowUp }] })
            } catch (e: any) {
              nextToolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
            }

            const newWebSearches = nextToolResult.toolResults?.filter((r: any) => r.toolCall.name === 'web_search').length || 0
            totalSearchCount += newWebSearches

            // Update thinking blocks and researchStatus
            for (const tr of nextToolResult.toolResults || []) {
              if (tr.toolCall.name === 'web_search') {
                const searchQuery = typeof tr.toolCall.arguments === 'object' ? tr.toolCall.arguments?.query : tr.toolCall.arguments
                if (accumulatedReasoning?.trim()) {
                  localThinkingBlocks.push({ type: 'thinking', content: accumulatedReasoning, duration: 0, timestamp: Date.now() })
                }
                updateStreamingMessage(sessionId, messageId, {
                  thinking: '', thinkingDuration: undefined, thinkingBlocks: [...localThinkingBlocks],
                  researchStatus: { currentRound: researchRound, maxRounds: researchMaxRounds, currentSearch: String(searchQuery || ''), isSearching: true }
                })
                accumulatedReasoning = ''
              }
            }

            // Update researchStatus to stop searching
            updateStreamingMessage(sessionId, messageId, {
              researchStatus: { currentRound: researchRound, maxRounds: researchMaxRounds, isSearching: false }
            })

            const newSavedResults = nextToolResult.toolResults?.map((tr: any) => ({
              toolCall: { id: tr.toolCall.id, name: tr.toolCall.name, arguments: tr.toolCall.arguments },
              result: { success: tr.result.success, data: tr.result.data, error: tr.result.error, executionTime: tr.result.executionTime }
            })) || []

            savedToolResults = savedToolResults ? [...savedToolResults, ...newSavedResults] : newSavedResults
            lastAssistantMessage = reconstructedFollowUp
            toolResult = nextToolResult
            researchRound++

            const remainingAfter = researchMaxRounds - totalSearchCount
            hasMoreToolCalls = remainingAfter > 0 && (researchMandatory || nextToolResult.needsFollowUp)
          } else {
            hasMoreToolCalls = false
          }
        }

        // Final answer request for mandatory research
        if (researchMandatory && totalSearchCount >= researchMaxRounds) {
          const finalAnswerMessages: any[] = [
            { role: 'system', content: `\n\n*** ALL RESEARCH COMPLETE ***\nYou have completed all ${totalSearchCount} required web searches.\n\nYou MUST now provide your FINAL COMPREHENSIVE ANSWER based on all the information gathered.\n\nDo NOT make any more tool calls.\nSynthesize all the search results into a coherent, well-structured response that directly answers the user's question.\nInclude relevant details from the searches and cite sources where appropriate.` },
            ...openRouterMessages, lastAssistantMessage, ...toolResult.formattedResults
          ]

          let finalAnswerContent = ''
          let finalAnswerReasoning = ''
          let finalAnswerUsage: any = {}

          for await (const chunk of streamOpenRouterCompletion(
            getOpenRouterApiKey(settings.openRouterApiKey),
            settings.aiModel,
            finalAnswerMessages,
            { temperature: settings.temperature, maxTokens: requestedMaxTokens, tools: openRouterTools, signal }
          )) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            finalAnswerContent += delta

            const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning || ''
            if (reasoningDelta) {
              finalAnswerReasoning += reasoningDelta
              const updatedThinking = accumulatedReasoning + (accumulatedReasoning ? '\n\n---\n\n' : '') + finalAnswerReasoning
              throttledUpdateStreamingMessage(sessionId, messageId, {
                content: accumulatedContent + finalAnswerContent,
                thinking: updatedThinking
              })
            }

            if (chunk.usage) {
              finalAnswerUsage = chunk.usage
              const reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens || chunk.usage.reasoning_tokens || 0
              if (reasoningTokens > 0) totalThinkingTokens += reasoningTokens
            }

            const now = Date.now()
            if (now - lastUpdateTime >= updateInterval) {
              const fullThinking = accumulatedReasoning + (finalAnswerReasoning ? '\n\n---\n\n' + finalAnswerReasoning : '')
              throttledUpdateStreamingMessage(sessionId, messageId, {
                content: accumulatedContent + finalAnswerContent,
                thinking: fullThinking || undefined
              })
              lastUpdateTime = now
            }
          }

          accumulatedContent += finalAnswerContent
          if (finalAnswerReasoning) {
            accumulatedReasoning += (accumulatedReasoning ? '\n\n---\n\n' : '') + finalAnswerReasoning
          }

          flushThrottledUpdates()
          updateStreamingMessage(sessionId, messageId, {
            content: accumulatedContent,
            thinking: accumulatedReasoning || undefined,
            researchStatus: undefined
          })

          usage = {
            inputTokens: (usage.inputTokens || 0) + (finalAnswerUsage.prompt_tokens || 0),
            outputTokens: (usage.outputTokens || 0) + (finalAnswerUsage.completion_tokens || 0),
            totalTokens: (usage.totalTokens || 0) + (finalAnswerUsage.total_tokens || 0),
            thinkingTokens: totalThinkingTokens > 0 ? totalThinkingTokens : undefined,
            cachedInputTokens: ((usage.cachedInputTokens || 0) + (finalAnswerUsage.prompt_cache_tokens || 0)) || undefined,
            cachedOutputTokens: ((usage.cachedOutputTokens || 0) + (finalAnswerUsage.completion_cache_tokens || 0)) || undefined
          }
        }
      }
    }

    const endTime = performance.now()
    const latency = Math.round(endTime - startTime)
    const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : undefined
    const tps = usage.outputTokens > 0 && latency > 0 ? (usage.outputTokens / (latency / 1000)) : undefined

    updateStreamingMessage(sessionId, messageId, {
      content: accumulatedContent,
      thinking: accumulatedReasoning || undefined,
      model: `openrouter/${settings.aiModel}`,
      latency,
      usage: { ...usage, tps, ttft },
      finishReason: finishReason || undefined,
      requestedMaxTokens,
      toolResults: savedToolResults
    })

    return {
      content: accumulatedContent,
      model: `openrouter/${settings.aiModel}`,
      thinking: accumulatedReasoning || undefined,
      thinkingDuration,
      thinkingBlocks: localThinkingBlocks.length > 0 ? localThinkingBlocks : undefined,
      toolResults: savedToolResults,
      usage: { ...usage, tps, ttft },
      latency,
      finishReason: finishReason || undefined,
    }
  }, [settings, toolCalling, updateStreamingMessage, flushThrottledUpdates, throttledUpdateStreamingMessage, updateInterval])

  return { streamOpenRouter }
}

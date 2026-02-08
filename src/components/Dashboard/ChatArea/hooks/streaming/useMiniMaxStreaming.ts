/**
 * useMiniMaxStreaming - Provider-specific streaming hook for MiniMax
 * 
 * Extracts MiniMax streaming logic from useStreamingChat to reduce complexity.
 * Supports tool calling, research mode, and reasoning/thinking.
 * 
 * Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
 */

import { useCallback } from 'react'
import {
  streamMiniMaxCompletion,
  extractReasoningFromChunk,
  ToolCallAccumulator,
  ReasoningAccumulator,
  isToolCallsFinishReason,
  extractUsageMetrics,
  accumulateUsageMetrics,
  calculateTPS
} from '../../../../../services/minimax'
import type { ThinkingBlock } from '../../../../../contexts/ChatHistoryContext'
import type {
  StreamingResult,
  ToolCallingOptions,
  UpdateStreamingCallback,
  FlushCallback,
  ToolCallingHook,
  StreamingSettings,
} from './types'

const UPDATE_INTERVAL = 120 // ms
const SMOOTH_UPDATE_INTERVAL = 40 // ms

export interface UseMiniMaxStreamingOptions {
  settings: StreamingSettings
  toolCalling: ToolCallingHook
  updateStreamingMessage: UpdateStreamingCallback
  flushThrottledUpdates: FlushCallback
  throttledUpdateStreamingMessage: UpdateStreamingCallback
}

export interface UseMiniMaxStreamingReturn {
  streamMiniMax: (options: ToolCallingOptions) => Promise<StreamingResult>
}

/**
 * Hook for MiniMax-specific streaming logic with tool calling and reasoning support
 */
export function useMiniMaxStreaming({
  settings,
  toolCalling,
  updateStreamingMessage,
  flushThrottledUpdates,
  throttledUpdateStreamingMessage,
}: UseMiniMaxStreamingOptions): UseMiniMaxStreamingReturn {
  const updateInterval = settings.streamResponses ? SMOOTH_UPDATE_INTERVAL : UPDATE_INTERVAL

  const streamMiniMax = useCallback(async (
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
    const minimaxTools = tools && Array.isArray(tools) ? tools : undefined

    let accumulatedContent = ''
    let lastUpdateTime = Date.now()
    let finalUsage: any = {}
    let hasToolCalls = false
    let finishReason: string | null = null
    let savedToolResults: any = null
    let localThinkingBlocks: ThinkingBlock[] = []
    let firstTokenTime: number | null = null

    // Tool call accumulator for tracking partial tool calls
    const toolCallAccumulator = new ToolCallAccumulator()
    // Reasoning accumulator for tracking thinking content
    const reasoningAccumulator = new ReasoningAccumulator()

    // Track thinking time
    let thinkingStartTime: number | null = null
    let thinkingEndTime: number | null = null
    let thinkingDuration: number | undefined = undefined

    const initialForceToolUse = researchMandatory && researchMaxRounds > 0
    let initialToolChoice: 'auto' | 'none' | { type: 'function'; function: { name: string } } | undefined
    if (initialForceToolUse) {
      initialToolChoice = { type: 'function', function: { name: 'web_search' } }
    }

    try {
      for await (const chunk of streamMiniMaxCompletion(
        settings.minimaxApiKey || '',
        settings.aiModel,
        optimizedHistory,
        {
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          tools: minimaxTools,
          toolChoice: initialToolChoice,
          signal
        }
      )) {
        // Extract content delta
        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (!firstTokenTime && delta) {
          firstTokenTime = performance.now()
        }
        accumulatedContent += delta

        // Extract reasoning from MiniMax-specific reasoning_details
        const reasoningDetails = extractReasoningFromChunk(chunk)
        if (reasoningDetails && reasoningDetails.length > 0) {
          if (!thinkingStartTime) thinkingStartTime = performance.now()
          reasoningAccumulator.accumulate(reasoningDetails)

          throttledUpdateStreamingMessage(sessionId, messageId, {
            content: accumulatedContent,
            thinking: reasoningAccumulator.getReasoning()
          })
        }

        // If we have content and were thinking, mark thinking as done
        if (delta && reasoningAccumulator.hasReasoning() && !thinkingEndTime) {
          thinkingEndTime = performance.now()
          if (thinkingStartTime) {
            thinkingDuration = thinkingEndTime - thinkingStartTime
          }
        }

        // Accumulate tool calls
        if (chunk.choices?.[0]?.delta?.tool_calls) {
          hasToolCalls = true
          toolCallAccumulator.accumulate(chunk.choices[0].delta.tool_calls)
        }

        // Check finish reason
        if (chunk.choices?.[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason
          if (isToolCallsFinishReason(finishReason)) hasToolCalls = true
        }

        // Extract usage metrics
        if (chunk.usage) {
          finalUsage = chunk.usage
        }

        // Throttled UI updates
        const now = Date.now()
        if (now - lastUpdateTime >= updateInterval) {
          throttledUpdateStreamingMessage(sessionId, messageId, {
            content: accumulatedContent,
            thinking: reasoningAccumulator.hasReasoning() ? reasoningAccumulator.getReasoning() : undefined,
            thinkingDuration
          })
          lastUpdateTime = now
        }
      }
    } catch (streamError: any) {
      console.error('MiniMax streaming error:', streamError)
      throw streamError
    }

    // Finalize thinking duration if not set
    if (reasoningAccumulator.hasReasoning() && !thinkingEndTime) {
      thinkingEndTime = performance.now()
      if (thinkingStartTime) {
        thinkingDuration = thinkingEndTime - thinkingStartTime
      }
    }

    // Flush throttled updates and apply final content state
    flushThrottledUpdates()
    updateStreamingMessage(sessionId, messageId, {
      content: accumulatedContent,
      thinking: reasoningAccumulator.hasReasoning() ? reasoningAccumulator.getReasoning() : undefined,
      thinkingDuration
    })

    // Map MiniMax usage to standard format using utility function
    const extractedUsage = extractUsageMetrics(finalUsage) || {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    }
    // Map reasoningTokens to thinkingTokens for UI consistency
    let usage: any = {
      ...extractedUsage,
      thinkingTokens: extractedUsage.reasoningTokens
    }
    delete usage.reasoningTokens

    // Handle tool calls with research loop
    if (canUseTools && hasToolCalls && isToolCallsFinishReason(finishReason) && toolCallAccumulator.hasToolCalls()) {
      const accumulatedToolCalls = toolCallAccumulator.getToolCalls()
      const reconstructedMessage = {
        role: 'assistant',
        content: accumulatedContent,
        tool_calls: accumulatedToolCalls
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

        while (hasMoreToolCalls && researchRound < researchMaxRounds) {
          const researchContextMsg = getResearchContext(totalSearchCount, researchMaxRounds, researchMandatory)
          const remainingSearches = researchMaxRounds - totalSearchCount
          const forceToolUse = researchMandatory && remainingSearches > 0

          let toolChoice: any = forceToolUse ? { type: 'function', function: { name: 'web_search' } } : undefined

          const followUpMessages: any[] = []
          if (researchContextMsg) {
            followUpMessages.push({ role: 'system', content: researchContextMsg })
          }
          followUpMessages.push(...optimizedHistory, lastAssistantMessage, ...toolResult.formattedResults)

          let followUpContent = ''
          let followUpUsage: any = {}
          const followUpToolAccumulator = new ToolCallAccumulator()
          const followUpReasoningAccumulator = new ReasoningAccumulator()

          updateStreamingMessage(sessionId, messageId, {
            researchStatus: { currentRound: researchRound, maxRounds: researchMaxRounds, isSearching: false }
          })

          for await (const chunk of streamMiniMaxCompletion(
            settings.minimaxApiKey || '',
            settings.aiModel,
            followUpMessages,
            { temperature: settings.temperature, maxTokens: settings.maxTokens, tools: minimaxTools, toolChoice, signal }
          )) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            followUpContent += delta

            // Extract reasoning
            const reasoningDetails = extractReasoningFromChunk(chunk)
            if (reasoningDetails && reasoningDetails.length > 0) {
              followUpReasoningAccumulator.accumulate(reasoningDetails)
              throttledUpdateStreamingMessage(sessionId, messageId, {
                content: accumulatedContent + followUpContent,
                thinking: followUpReasoningAccumulator.getReasoning()
              })
            }

            // Accumulate tool calls
            if (chunk.choices?.[0]?.delta?.tool_calls) {
              followUpToolAccumulator.accumulate(chunk.choices[0].delta.tool_calls)
            }

            if (chunk.usage) followUpUsage = chunk.usage

            const now = Date.now()
            if (now - lastUpdateTime >= updateInterval) {
              throttledUpdateStreamingMessage(sessionId, messageId, {
                content: accumulatedContent + followUpContent,
                thinking: followUpReasoningAccumulator.hasReasoning() ? followUpReasoningAccumulator.getReasoning() : undefined
              })
              lastUpdateTime = now
            }
          }

          accumulatedContent += followUpContent
          flushThrottledUpdates()
          updateStreamingMessage(sessionId, messageId, { content: accumulatedContent })

          // Accumulate usage metrics from follow-up request
          const followUpExtracted = extractUsageMetrics(followUpUsage)
          const accumulated = accumulateUsageMetrics(
            { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens, reasoningTokens: (usage as any).thinkingTokens },
            followUpExtracted
          )
          usage = {
            inputTokens: accumulated.inputTokens,
            outputTokens: accumulated.outputTokens,
            totalTokens: accumulated.totalTokens,
            thinkingTokens: accumulated.reasoningTokens
          }

          if (followUpToolAccumulator.hasToolCalls()) {
            const followUpToolCalls = followUpToolAccumulator.getToolCalls()
            const reconstructedFollowUp = {
              role: 'assistant',
              content: followUpContent,
              tool_calls: followUpToolCalls
            }

            let nextToolResult
            try {
              nextToolResult = await handleToolCalls({ choices: [{ message: reconstructedFollowUp }] })
            } catch (e: any) {
              nextToolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
            }

            const newWebSearches = nextToolResult.toolResults?.filter((r: any) => r.toolCall.name === 'web_search').length || 0
            totalSearchCount += newWebSearches

            // Update thinking blocks for new searches
            for (const tr of nextToolResult.toolResults || []) {
              if (tr.toolCall.name === 'web_search') {
                const searchQuery = typeof tr.toolCall.arguments === 'object' ? tr.toolCall.arguments?.query : tr.toolCall.arguments
                const currentFollowUpReasoning = followUpReasoningAccumulator.getReasoning()
                if (currentFollowUpReasoning?.trim()) {
                  localThinkingBlocks.push({ type: 'thinking', content: currentFollowUpReasoning, duration: 0, timestamp: Date.now() })
                }
                updateStreamingMessage(sessionId, messageId, {
                  thinking: '', thinkingDuration: undefined, thinkingBlocks: [...localThinkingBlocks],
                  researchStatus: { currentRound: researchRound, maxRounds: researchMaxRounds, currentSearch: String(searchQuery || ''), isSearching: true }
                })
                followUpReasoningAccumulator.clear()
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
            ...optimizedHistory, lastAssistantMessage, ...toolResult.formattedResults
          ]

          let finalAnswerContent = ''
          let finalAnswerUsage: any = {}
          const finalReasoningAccumulator = new ReasoningAccumulator()

          for await (const chunk of streamMiniMaxCompletion(
            settings.minimaxApiKey || '',
            settings.aiModel,
            finalAnswerMessages,
            { temperature: settings.temperature, maxTokens: settings.maxTokens, tools: minimaxTools, signal }
          )) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            finalAnswerContent += delta

            const reasoningDetails = extractReasoningFromChunk(chunk)
            if (reasoningDetails && reasoningDetails.length > 0) {
              finalReasoningAccumulator.accumulate(reasoningDetails)
              const currentReasoning = reasoningAccumulator.getReasoning()
              const finalReasoning = finalReasoningAccumulator.getReasoning()
              const updatedThinking = currentReasoning + (currentReasoning ? '\n\n---\n\n' : '') + finalReasoning
              throttledUpdateStreamingMessage(sessionId, messageId, {
                content: accumulatedContent + finalAnswerContent,
                thinking: updatedThinking
              })
            }

            if (chunk.usage) {
              finalAnswerUsage = chunk.usage
            }

            const now = Date.now()
            if (now - lastUpdateTime >= updateInterval) {
              const currentReasoning = reasoningAccumulator.getReasoning()
              const finalReasoning = finalReasoningAccumulator.getReasoning()
              const fullThinking = currentReasoning + (finalReasoning ? '\n\n---\n\n' + finalReasoning : '')
              throttledUpdateStreamingMessage(sessionId, messageId, {
                content: accumulatedContent + finalAnswerContent,
                thinking: fullThinking || undefined
              })
              lastUpdateTime = now
            }
          }

          accumulatedContent += finalAnswerContent

          flushThrottledUpdates()
          updateStreamingMessage(sessionId, messageId, {
            content: accumulatedContent,
            thinking: reasoningAccumulator.hasReasoning() ? reasoningAccumulator.getReasoning() : undefined,
            researchStatus: undefined
          })

          // Accumulate usage metrics from final answer request
          const finalAnswerExtracted = extractUsageMetrics(finalAnswerUsage)
          const finalAccumulated = accumulateUsageMetrics(
            { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens, reasoningTokens: (usage as any).thinkingTokens },
            finalAnswerExtracted
          )
          usage = {
            inputTokens: finalAccumulated.inputTokens,
            outputTokens: finalAccumulated.outputTokens,
            totalTokens: finalAccumulated.totalTokens,
            thinkingTokens: finalAccumulated.reasoningTokens
          }
        }
      }
    }

    const endTime = performance.now()
    const latency = Math.round(endTime - startTime)
    const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : undefined
    // Calculate TPS using utility function
    const tps = calculateTPS(usage.outputTokens, latency)

    updateStreamingMessage(sessionId, messageId, {
      content: accumulatedContent,
      thinking: reasoningAccumulator.hasReasoning() ? reasoningAccumulator.getReasoning() : undefined,
      model: `minimax/${settings.aiModel}`,
      latency,
      usage: { ...usage, tps, ttft },
      toolResults: savedToolResults
    })

    return {
      content: accumulatedContent,
      model: `minimax/${settings.aiModel}`,
      thinking: reasoningAccumulator.hasReasoning() ? reasoningAccumulator.getReasoning() : undefined,
      thinkingDuration,
      thinkingBlocks: localThinkingBlocks.length > 0 ? localThinkingBlocks : undefined,
      toolResults: savedToolResults,
      usage: { ...usage, tps, ttft },
      latency,
      finishReason: finishReason || undefined,
    }
  }, [settings, toolCalling, updateStreamingMessage, flushThrottledUpdates, throttledUpdateStreamingMessage, updateInterval])

  return { streamMiniMax }
}

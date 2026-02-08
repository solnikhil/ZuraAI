/**
 * useGroqStreaming - Provider-specific streaming hook for Groq
 * 
 * Extracts Groq streaming logic from useStreamingChat to reduce complexity.
 * Supports tool calling and research mode.
 * 
 * Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
 */

import { useCallback } from 'react'
import { streamGroqCompletion } from '../../../../../services/groq'
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
    let accumulatedReasoning = ''
    let lastUpdateTime = Date.now()
    let finalUsage: any = {}
    let hasToolCalls = false
    let toolCallsAccumulator: any[] = []
    let finishReason: string | null = null
    let savedToolResults: any = null
    let localThinkingBlocks: ThinkingBlock[] = []
    let firstTokenTime: number | null = null

    const initialForceToolUse = researchMandatory && researchMaxRounds > 0
    let initialToolChoice: 'auto' | 'none' | { type: 'function'; function: { name: string } } | undefined
    if (initialForceToolUse) {
      initialToolChoice = { type: 'function', function: { name: 'web_search' } }
    }

    for await (const chunk of streamGroqCompletion(
      settings.groqApiKey || '',
      settings.aiModel,
      optimizedHistory,
      {
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        tools: groqTools,
        toolChoice: initialToolChoice,
        signal
      }
    )) {
      const delta = chunk.choices?.[0]?.delta?.content || ''
      if (!firstTokenTime && delta) {
        firstTokenTime = performance.now()
      }
      accumulatedContent += delta

      if (chunk.choices?.[0]?.delta?.tool_calls) {
        hasToolCalls = true
        const deltaToolCalls = chunk.choices[0].delta.tool_calls
        deltaToolCalls?.forEach((tc: any) => {
          const index = tc.index ?? 0
          if (!toolCallsAccumulator[index]) {
            toolCallsAccumulator[index] = {
              id: tc.id || '',
              type: tc.type || 'function',
              function: { name: '', arguments: '' }
            }
          }
          if (tc.function?.name) toolCallsAccumulator[index].function.name += tc.function.name
          if (tc.function?.arguments) toolCallsAccumulator[index].function.arguments += tc.function.arguments
        })
      }

      if (chunk.choices?.[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason
        if (finishReason === 'tool_calls') hasToolCalls = true
      }

      if (chunk.usage) finalUsage = chunk.usage

      const now = Date.now()
      if (now - lastUpdateTime >= updateInterval) {
        throttledUpdateStreamingMessage(sessionId, messageId, {
          content: accumulatedContent,
          thinking: accumulatedReasoning || undefined
        })
        lastUpdateTime = now
      }
    }

    // Flush throttled updates and apply final content state
    flushThrottledUpdates()
    updateStreamingMessage(sessionId, messageId, {
      content: accumulatedContent,
      thinking: accumulatedReasoning || undefined
    })

    let usage = {
      inputTokens: finalUsage.prompt_tokens || 0,
      outputTokens: finalUsage.completion_tokens || 0,
      totalTokens: finalUsage.total_tokens || 0
    }

    // Handle tool calls with research loop
    if (canUseTools && hasToolCalls && finishReason === 'tool_calls' && toolCallsAccumulator.filter(tc => tc?.id).length > 0) {
      const reconstructedMessage = {
        role: 'assistant',
        content: accumulatedContent,
        tool_calls: toolCallsAccumulator.filter(tc => tc.id).map(tc => ({
          id: tc.id,
          type: tc.type || 'function',
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
          let followUpToolCalls: any[] = []
          let followUpUsage: any = {}

          for await (const chunk of streamGroqCompletion(
            settings.groqApiKey || '',
            settings.aiModel,
            followUpMessages,
            { temperature: settings.temperature, max_tokens: settings.maxTokens, tools: groqTools, toolChoice, signal }
          )) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            followUpContent += delta

            if (chunk.choices?.[0]?.delta?.tool_calls) {
              const deltaToolCalls = chunk.choices[0].delta.tool_calls
              deltaToolCalls?.forEach((tc: any, idx: number) => {
                if (!followUpToolCalls[tc.index ?? idx]) {
                  followUpToolCalls[tc.index ?? idx] = { id: tc.id || '', type: tc.type || 'function', function: { name: '', arguments: '' } }
                }
                if (tc.function?.name) followUpToolCalls[tc.index ?? idx].function.name += tc.function.name
                if (tc.function?.arguments) followUpToolCalls[tc.index ?? idx].function.arguments += tc.function.arguments
              })
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

          usage = {
            inputTokens: (usage.inputTokens || 0) + (followUpUsage.prompt_tokens || 0),
            outputTokens: (usage.outputTokens || 0) + (followUpUsage.completion_tokens || 0),
            totalTokens: (usage.totalTokens || 0) + (followUpUsage.total_tokens || 0)
          }

          if (followUpToolCalls.length > 0 && followUpToolCalls.some(tc => tc.function.name)) {
            const reconstructedFollowUp = {
              role: 'assistant',
              content: followUpContent,
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
      }
    }

    const endTime = performance.now()
    const latency = Math.round(endTime - startTime)
    const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : undefined
    const tps = usage.outputTokens > 0 && latency > 0 ? (usage.outputTokens / (latency / 1000)) : undefined

    updateStreamingMessage(sessionId, messageId, {
      content: accumulatedContent,
      model: `groq/${settings.aiModel}`,
      latency,
      usage: { ...usage, tps, ttft },
      toolResults: savedToolResults
    })

    return {
      content: accumulatedContent,
      model: `groq/${settings.aiModel}`,
      toolResults: savedToolResults,
      usage: { ...usage, tps, ttft },
      latency,
      finishReason: finishReason || undefined,
    }
  }, [settings, toolCalling, updateStreamingMessage, flushThrottledUpdates, throttledUpdateStreamingMessage, updateInterval])

  return { streamGroq }
}

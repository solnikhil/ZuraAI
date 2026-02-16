/**
 * useAlibabaStreaming - Provider-specific streaming hook for Alibaba Cloud (DashScope)
 *
 * Extracts Alibaba streaming logic from useStreamingChat to reduce complexity.
 * Supports tool calling and research mode.
 * Uses OpenAI-compatible API at dashscope-intl.aliyuncs.com/compatible-mode/v1
 */

import { useCallback } from 'react'
import { useStreamingActions } from '../../../../../contexts/StreamingContext'
import { streamAlibabaCompletion } from '../../../../../services/alibaba'
import type {
  StreamingResult,
  ToolCallingOptions,
  UpdateStreamingCallback,
  FlushCallback,
  ToolCallingHook,
  StreamingSettings,
} from './types'
import type { ThinkingBlock } from '../../../../../contexts/ChatHistoryContext'
import { stripStandaloneHorizontalRule } from './streamingUtils'

const UPDATE_INTERVAL = 120 // ms
const SMOOTH_UPDATE_INTERVAL = 40 // ms

/** ~4 chars per token heuristic when API doesn't return usage */
function estimateOutputTokens(content: string): number {
  if (!content || content.length === 0) return 0
  return Math.ceil(content.length / 4)
}

/** Fill missing usage with estimates when API returns no usage data */
function fillMissingUsage(
  usage: { inputTokens: number; outputTokens: number; totalTokens: number },
  content: string
): { inputTokens: number; outputTokens: number; totalTokens: number } {
  let { inputTokens, outputTokens, totalTokens } = usage
  // Derive input from total - output when API returns total but not input
  if (inputTokens === 0 && totalTokens > 0 && outputTokens > 0) {
    inputTokens = Math.max(0, totalTokens - outputTokens)
  }
  if (outputTokens > 0 && totalTokens > 0 && inputTokens > 0) return { inputTokens, outputTokens, totalTokens }
  const estimatedOutput = outputTokens > 0 ? outputTokens : estimateOutputTokens(content)
  if (estimatedOutput === 0) return { inputTokens, outputTokens, totalTokens }
  return {
    inputTokens,
    outputTokens: estimatedOutput,
    totalTokens: totalTokens > 0 ? totalTokens : inputTokens + estimatedOutput
  }
}

export interface UseAlibabaStreamingOptions {
  settings: StreamingSettings
  toolCalling: ToolCallingHook
  updateStreamingMessage: UpdateStreamingCallback
  flushThrottledUpdates: FlushCallback
  throttledUpdateStreamingMessage: UpdateStreamingCallback
}

export interface UseAlibabaStreamingReturn {
  streamAlibaba: (options: ToolCallingOptions) => Promise<StreamingResult>
}

/**
 * Hook for Alibaba-specific streaming logic with tool calling support
 */
export function useAlibabaStreaming({
  settings,
  toolCalling,
  updateStreamingMessage,
  flushThrottledUpdates,
  throttledUpdateStreamingMessage,
}: UseAlibabaStreamingOptions): UseAlibabaStreamingReturn {
  const { updateStreaming } = useStreamingActions()
  const updateInterval = settings.streamResponses ? SMOOTH_UPDATE_INTERVAL : UPDATE_INTERVAL

  const streamAlibaba = useCallback(async (
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
    const alibabaTools = tools && Array.isArray(tools) ? tools : undefined

    let accumulatedContent = ''
    let accumulatedReasoning = ''
    let lastUpdateTime = Date.now()
    let finalUsage: any = {}
    let hasToolCalls = false
    let toolCallsAccumulator: any[] = []
    let finishReason: string | null = null
    let savedToolResults: any = null
    let firstTokenTime: number | null = null
    let localThinkingBlocks: ThinkingBlock[] = []

    const initialForceToolUse = researchMandatory && researchMaxRounds > 0
    let initialToolChoice: 'auto' | 'none' | { type: 'function'; function: { name: string } } | undefined
    if (initialForceToolUse) {
      initialToolChoice = { type: 'function', function: { name: 'web_search' } }
    }

    for await (const chunk of streamAlibabaCompletion(
      settings.alibabaApiKey || '',
      settings.aiModel,
      optimizedHistory,
      {
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        tools: alibabaTools,
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

    let usage = fillMissingUsage(
      {
        inputTokens: finalUsage.prompt_tokens ?? finalUsage.input_tokens ?? 0,
        outputTokens: finalUsage.completion_tokens ?? finalUsage.output_tokens ?? 0,
        totalTokens: finalUsage.total_tokens ?? 0
      },
      accumulatedContent
    )

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

      const lastUserMsg = [...optimizedHistory].reverse().find((m: any) => m?.role === 'user')
      const lastUserContent = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : null

      const responseWithFallback = {
        choices: [{ message: reconstructedMessage }],
        _fallbackContext: {
          lastUserMessage: lastUserContent ?? undefined,
          reasoning: accumulatedReasoning || undefined
        }
      }

      const researchPlanCallbacks = {
          onToolStart: (toolCall: any) => {
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
      } catch (toolError: any) {
        console.error('Tool calls processing error:', toolError)
        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
      }

      // Update researchStatus for web searches or research_plan and add thinkingBlocks
      const webSearchCalls = (toolResult.toolResults || []).filter((tr: any) => tr.toolCall.name === 'web_search')
      const researchPlanCalls = (toolResult.toolResults || []).filter((tr: any) => tr.toolCall.name === 'research_plan')
      const hasSearchCalls = webSearchCalls.length > 0 || researchPlanCalls.length > 0
      if (hasSearchCalls) {
        const firstSearch = webSearchCalls[0] || researchPlanCalls[0]
        const searchQuery = firstSearch?.toolCall?.name === 'research_plan'
          ? (firstSearch.toolCall.arguments?.steps?.[0]?.query ?? '')
          : (typeof firstSearch?.toolCall?.arguments === 'object'
            ? firstSearch?.toolCall?.arguments?.query
            : firstSearch?.toolCall?.arguments)

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

        updateStreamingMessage(sessionId, messageId, {
          researchStatus: {
            currentRound: 1,
            maxRounds: researchMaxRounds,
            currentSearch: String(searchQuery || ''),
            isSearching: true
          },
          thinkingBlocks: localThinkingBlocks
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

        const SAFETY_CAP = 50
        const MAX_RESEARCH_ROUNDS = 6
        while (hasMoreToolCalls && researchRound < SAFETY_CAP) {
          const researchContextMsg = getResearchContext(totalSearchCount, researchMaxRounds, researchMandatory)
          let toolChoice: any = undefined

          const followUpMessages: any[] = []
          if (researchContextMsg) {
            followUpMessages.push({ role: 'system', content: researchContextMsg })
          }
          if (researchRound >= 4) {
            followUpMessages.push({ role: 'system', content: `\n\n*** STOP SEARCHING *** You have ${totalSearchCount} search results. Your next response MUST be your final synthesized answer. Do NOT call web_search again. Provide your comparison now.\n\n` })
          }
          followUpMessages.push(...optimizedHistory, lastAssistantMessage, ...toolResult.formattedResults)

          let followUpContent = ''
          let followUpToolCalls: any[] = []
          let followUpUsage: any = {}

          for await (const chunk of streamAlibabaCompletion(
            settings.alibabaApiKey || '',
            settings.aiModel,
            followUpMessages,
            { temperature: settings.temperature, max_tokens: settings.maxTokens, tools: alibabaTools, toolChoice, signal }
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

          usage = fillMissingUsage(
            {
              inputTokens: (usage.inputTokens || 0) + (followUpUsage.prompt_tokens ?? followUpUsage.input_tokens ?? 0),
              outputTokens: (usage.outputTokens || 0) + (followUpUsage.completion_tokens ?? followUpUsage.output_tokens ?? 0),
              totalTokens: (usage.totalTokens || 0) + (followUpUsage.total_tokens ?? 0)
            },
            accumulatedContent
          )

          if (followUpToolCalls.length > 0 && followUpToolCalls.some((tc: any) => tc?.function?.name)) {
            const reconstructedFollowUp = {
              role: 'assistant',
              content: followUpContent,
              tool_calls: followUpToolCalls.filter((tc: any) => tc?.function?.name).map((tc: any) => ({
                id: tc.id, type: tc.type || 'function',
                function: { name: tc.function.name, arguments: tc.function.arguments }
              }))
            }

            const followUpResponseWithFallback = {
              choices: [{ message: reconstructedFollowUp }],
              _fallbackContext: {
                lastUserMessage: lastUserContent ?? undefined,
                reasoning: accumulatedReasoning || undefined
              }
            }

            let nextToolResult
            try {
              nextToolResult = await handleToolCalls(followUpResponseWithFallback, researchPlanCallbacks)
            } catch (e: any) {
              nextToolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
            }

            const newWebSearches = nextToolResult.toolResults?.filter((r: any) => r.toolCall.name === 'web_search').length || 0
            const newResearchPlanSteps = nextToolResult.toolResults?.filter((r: any) => r.toolCall.name === 'research_plan')
              .flatMap((r: any) => r.toolCall.arguments?.steps || []).length || 0
            totalSearchCount += newWebSearches + newResearchPlanSteps

            for (const tr of nextToolResult.toolResults || []) {
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

            const newSavedResults = nextToolResult.toolResults?.map((tr: any) => ({
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
    usage = fillMissingUsage(usage, accumulatedContent)
    const tps = usage.outputTokens > 0 && latency > 0 ? (usage.outputTokens / (latency / 1000)) : undefined

    const hasWebSearch = (savedToolResults || []).some((r: any) =>
      r?.toolCall?.name === 'web_search' || r?.toolCall?.name === 'research_plan'
    )
    const finalContent = hasWebSearch ? stripStandaloneHorizontalRule(accumulatedContent) : accumulatedContent

    updateStreamingMessage(sessionId, messageId, {
      content: finalContent,
      model: `alibaba/${settings.aiModel}`,
      latency,
      usage: { ...usage, tps, ttft },
      toolResults: savedToolResults,
      ...(localThinkingBlocks.length > 0 ? { thinkingBlocks: localThinkingBlocks } : {})
    })

    return {
      content: finalContent,
      model: `alibaba/${settings.aiModel}`,
      toolResults: savedToolResults,
      thinkingBlocks: localThinkingBlocks.length > 0 ? localThinkingBlocks : undefined,
      usage: { ...usage, tps, ttft },
      latency,
      finishReason: finishReason || undefined,
    }
  }, [settings, toolCalling, updateStreamingMessage, flushThrottledUpdates, throttledUpdateStreamingMessage, updateStreaming, updateInterval])

  return { streamAlibaba }
}

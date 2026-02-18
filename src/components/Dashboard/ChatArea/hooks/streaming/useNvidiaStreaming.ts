/**
 * useNvidiaStreaming - Provider-specific streaming hook for NVIDIA AI API
 *
 * Extracts NVIDIA streaming logic from useStreamingChat to reduce complexity.
 * Supports tool calling and research mode.
 *
 * Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
 */

import { useCallback } from 'react'
import { useStreamingActions } from '../../../../../contexts/StreamingContext'
import { streamNvidiaCompletion } from '../../../../../services/nvidia'
import type {
  StreamingResult,
  ToolCallingOptions,
  UpdateStreamingCallback,
  FlushCallback,
  ToolCallingHook,
  StreamingSettings,
} from './types'
import type { ThinkingBlock, ToolCallResult } from '../../../../../contexts/ChatHistoryContext'
import { stripStandaloneHorizontalRule } from './streamingUtils'

const UPDATE_INTERVAL = 120 // ms
const SMOOTH_UPDATE_INTERVAL = 40 // ms

interface DeltaToolCall {
  index?: number
  id?: string
  type?: string
  function?: { name?: string; arguments?: string }
}

/** ~4 chars per token heuristic when NVIDIA doesn't return usage */
function estimateOutputTokens(content: string): number {
  if (!content || content.length === 0) return 0
  return Math.ceil(content.length / 4)
}

/** Fill missing usage with estimates when API returns no usage data */
function fillMissingUsage(
  usage: { inputTokens: number; outputTokens: number; totalTokens: number },
  content: string
): { inputTokens: number; outputTokens: number; totalTokens: number } {
  if (usage.outputTokens > 0 && usage.totalTokens > 0) return usage
  const estimatedOutput = usage.outputTokens > 0 ? usage.outputTokens : estimateOutputTokens(content)
  if (estimatedOutput === 0) return usage
  return {
    inputTokens: usage.inputTokens,
    outputTokens: estimatedOutput,
    totalTokens: usage.totalTokens > 0 ? usage.totalTokens : usage.inputTokens + estimatedOutput
  }
}

export interface UseNvidiaStreamingOptions {
  settings: StreamingSettings
  toolCalling: ToolCallingHook
  updateStreamingMessage: UpdateStreamingCallback
  flushThrottledUpdates: FlushCallback
  throttledUpdateStreamingMessage: UpdateStreamingCallback
}

export interface UseNvidiaStreamingReturn {
  streamNvidia: (options: ToolCallingOptions) => Promise<StreamingResult>
}

/**
 * Hook for NVIDIA-specific streaming logic with tool calling support
 */
export function useNvidiaStreaming({
  settings,
  toolCalling,
  updateStreamingMessage,
  flushThrottledUpdates,
  throttledUpdateStreamingMessage,
}: UseNvidiaStreamingOptions): UseNvidiaStreamingReturn {
  const { updateStreaming } = useStreamingActions()
  const updateInterval = settings.streamResponses ? SMOOTH_UPDATE_INTERVAL : UPDATE_INTERVAL

  const streamNvidia = useCallback(async (
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
    const nvidiaTools = tools && Array.isArray(tools) ? tools : undefined

    let accumulatedContent = ''
    let accumulatedReasoning = ''
    let lastUpdateTime = Date.now()
    let finalUsage: Record<string, number> = {}
    let hasToolCalls = false
    let toolCallsAccumulator: DeltaToolCall[] = []
    let finishReason: string | null = null
    let savedToolResults: ToolCallResult[] | undefined = undefined
    let firstTokenTime: number | null = null
    let localThinkingBlocks: ThinkingBlock[] = []

    const initialForceToolUse = researchMandatory && researchMaxRounds > 0
    let initialToolChoice: 'auto' | 'none' | { type: 'function'; function: { name: string } } | undefined
    if (initialForceToolUse) {
      initialToolChoice = { type: 'function', function: { name: 'web_search' } }
    }

    for await (const chunk of streamNvidiaCompletion(
      settings.nvidiaApiKey || '',
      settings.aiModel,
      optimizedHistory,
      {
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        tools: nvidiaTools,
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
        deltaToolCalls?.forEach((tc: DeltaToolCall) => {
          const index = tc.index ?? 0
          if (!toolCallsAccumulator[index]) {
            toolCallsAccumulator[index] = {
              id: tc.id || '',
              type: tc.type || 'function',
              function: { name: '', arguments: '' }
            }
          }
          if (tc.function?.name) toolCallsAccumulator[index].function!.name += tc.function.name
          if (tc.function?.arguments) toolCallsAccumulator[index].function!.arguments += tc.function.arguments
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
        inputTokens: finalUsage.prompt_tokens || 0,
        outputTokens: finalUsage.completion_tokens || 0,
        totalTokens: finalUsage.total_tokens || 0
      },
      accumulatedContent
    )

    // Handle tool calls with research loop
    if (canUseTools && hasToolCalls && finishReason === 'tool_calls' && toolCallsAccumulator.filter(tc => tc?.id).length > 0) {
      const reconstructedMessage = {
        role: 'assistant',
        content: accumulatedContent,
        tool_calls: toolCallsAccumulator.filter(tc => tc.id).map(tc => ({
          id: tc.id || '',
          type: (tc.type || 'function') as 'function',
          function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' }
        }))
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
        toolResult = await handleToolCalls({ choices: [{ message: reconstructedMessage as import('../../../../../tools/types').OpenRouterMessage }] }, researchPlanCallbacks)
      } catch (toolError: unknown) {
        console.error('Tool calls processing error:', toolError)
        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
      }

      // Update researchStatus for web searches or research_plan and add thinkingBlocks
      const webSearchCalls = (toolResult.toolResults || []).filter((tr: ToolCallResult) => tr.toolCall.name === 'web_search')
      const researchPlanCalls = (toolResult.toolResults || []).filter((tr: ToolCallResult) => tr.toolCall.name === 'research_plan')
      const hasSearchCalls = webSearchCalls.length > 0 || researchPlanCalls.length > 0
      if (hasSearchCalls) {
        const firstSearch = webSearchCalls[0] || researchPlanCalls[0]
        const searchQuery = firstSearch?.toolCall?.name === 'research_plan'
          ? ((firstSearch.toolCall.arguments as Record<string, unknown>)?.steps as Array<{ query?: string }> | undefined)?.[0]?.query ?? ''
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
        const MAX_RESEARCH_ROUNDS = 6
        while (hasMoreToolCalls && researchRound < SAFETY_CAP) {
          const researchContextMsg = getResearchContext(totalSearchCount, researchMaxRounds, researchMandatory)
          let toolChoice: string | undefined = undefined

          const followUpMessages: Array<{ role: string; content: string; tool_calls?: unknown[] }> = []
          if (researchContextMsg) {
            followUpMessages.push({ role: 'system', content: researchContextMsg })
          }
          if (researchRound >= 4) {
            followUpMessages.push({ role: 'system', content: `\n\n*** STOP SEARCHING *** You have ${totalSearchCount} search results. Your next response MUST be your final synthesized answer. Do NOT call web_search again. Provide your comparison now.\n\n` })
          }
          followUpMessages.push(...optimizedHistory, lastAssistantMessage, ...toolResult.formattedResults)

          let followUpContent = ''
          let followUpToolCalls: DeltaToolCall[] = []
          let followUpUsage: Record<string, number> = {}

          for await (const chunk of streamNvidiaCompletion(
            settings.nvidiaApiKey || '',
            settings.aiModel,
            followUpMessages,
            { temperature: settings.temperature, max_tokens: settings.maxTokens, tools: nvidiaTools, toolChoice, signal }
          )) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            followUpContent += delta

            if (chunk.choices?.[0]?.delta?.tool_calls) {
              const deltaToolCalls = chunk.choices[0].delta.tool_calls
              deltaToolCalls?.forEach((tc: DeltaToolCall, idx: number) => {
                if (!followUpToolCalls[tc.index ?? idx]) {
                  followUpToolCalls[tc.index ?? idx] = { id: tc.id || '', type: tc.type || 'function', function: { name: '', arguments: '' } }
                }
                if (tc.function?.name) followUpToolCalls[tc.index ?? idx].function!.name += tc.function.name
                if (tc.function?.arguments) followUpToolCalls[tc.index ?? idx].function!.arguments += tc.function.arguments
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
              inputTokens: (usage.inputTokens || 0) + (followUpUsage.prompt_tokens || 0),
              outputTokens: (usage.outputTokens || 0) + (followUpUsage.completion_tokens || 0),
              totalTokens: (usage.totalTokens || 0) + (followUpUsage.total_tokens || 0)
            },
            accumulatedContent
          )

          if (followUpToolCalls.length > 0 && followUpToolCalls.some((tc: DeltaToolCall) => tc?.function?.name)) {
            const reconstructedFollowUp = {
              role: 'assistant',
              content: followUpContent,
              tool_calls: followUpToolCalls.filter((tc: DeltaToolCall) => tc?.function?.name).map((tc: DeltaToolCall) => ({
                id: tc.id || '', type: (tc.type || 'function') as 'function',
                function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' }
              }))
            }

            let nextToolResult
            try {
              nextToolResult = await handleToolCalls({ choices: [{ message: reconstructedFollowUp as import('../../../../../tools/types').OpenRouterMessage }] }, researchPlanCallbacks)
            } catch (e: unknown) {
              nextToolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
            }

            const newWebSearches = nextToolResult.toolResults?.filter((r: ToolCallResult) => r.toolCall.name === 'web_search').length || 0
            const newResearchPlanSteps = nextToolResult.toolResults?.filter((r: ToolCallResult) => r.toolCall.name === 'research_plan')
              .flatMap((r: ToolCallResult) => (r.toolCall.arguments as Record<string, unknown>)?.steps as unknown[] || []).length || 0
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
    usage = fillMissingUsage(usage, accumulatedContent)
    const tps = usage.outputTokens > 0 && latency > 0 ? (usage.outputTokens / (latency / 1000)) : undefined

    const hasWebSearch = (savedToolResults || []).some((r: ToolCallResult) =>
      r?.toolCall?.name === 'web_search' || r?.toolCall?.name === 'research_plan'
    )
    const finalContent = hasWebSearch ? stripStandaloneHorizontalRule(accumulatedContent) : accumulatedContent

    updateStreamingMessage(sessionId, messageId, {
      content: finalContent,
      model: `nvidia/${settings.aiModel}`,
      latency,
      usage: { ...usage, tps, ttft },
      toolResults: savedToolResults,
      ...(localThinkingBlocks.length > 0 ? { thinkingBlocks: localThinkingBlocks } : {})
    })

    return {
      content: finalContent,
      model: `nvidia/${settings.aiModel}`,
      toolResults: savedToolResults,
      thinkingBlocks: localThinkingBlocks.length > 0 ? localThinkingBlocks : undefined,
      usage: { ...usage, tps, ttft },
      latency,
      finishReason: finishReason || undefined,
    }
  }, [settings, toolCalling, updateStreamingMessage, flushThrottledUpdates, throttledUpdateStreamingMessage, updateStreaming, updateInterval])

  return { streamNvidia }
}

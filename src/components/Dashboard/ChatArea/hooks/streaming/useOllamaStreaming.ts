/**
 * useOllamaStreaming - Provider-specific streaming hook for Ollama
 * 
 * Extracts Ollama streaming logic from useStreamingChat to reduce complexity.
 * 
 * Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
 */

import { useCallback } from 'react'
import { streamOllamaCompletion } from '../../../../../services/ollama'
import type { ToolCallResult } from '../../../../../contexts/ChatHistoryContext'
import type { OpenRouterMessage } from '../../../../../tools/types'
import type {
  StreamingResult,
  ToolCallingOptions,
  UpdateStreamingCallback,
  FlushCallback,
  ToolCallingHook,
  StreamingSettings,
} from './types'
import { getStreamingUpdateInterval } from './streamingUtils'

export interface UseOllamaStreamingOptions {
  settings: StreamingSettings
  toolCalling: ToolCallingHook
  updateStreamingMessage: UpdateStreamingCallback
  flushThrottledUpdates: FlushCallback
  throttledUpdateStreamingMessage: UpdateStreamingCallback
}

export interface UseOllamaStreamingReturn {
  streamOllama: (options: ToolCallingOptions) => Promise<StreamingResult>
}

/**
 * Hook for Ollama-specific streaming logic
 */
export function useOllamaStreaming({
  settings,
  toolCalling,
  updateStreamingMessage,
  flushThrottledUpdates,
  throttledUpdateStreamingMessage,
}: UseOllamaStreamingOptions): UseOllamaStreamingReturn {
  const updateInterval = getStreamingUpdateInterval()

  const streamOllama = useCallback(async (
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
    const ollamaTools = tools && Array.isArray(tools) ? tools : undefined

    let accumulatedContent = ''
    let accumulatedReasoning = ''
    let lastUpdateTime = Date.now()
    let finalUsage: { inputTokens: number; outputTokens: number; totalTokens: number } = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    let hasToolCalls = false
    let finalMessage: Record<string, unknown> | null = null
    let isDone = false
    let savedToolResults: ToolCallResult[] | undefined = undefined
    let firstTokenTime: number | null = null
    let thinkingStartTime: number | null = null
    let thinkingEndTime: number | null = null
    let thinkingDuration: number | undefined = undefined

    try {
      for await (const chunk of streamOllamaCompletion(
        settings.ollamaUrl || 'http://localhost:11434',
        settings.aiModel,
        optimizedHistory,
        { temperature: settings.temperature, think: true, tools: ollamaTools, signal }
      )) {
        if (!firstTokenTime && (chunk.message?.content || chunk.message?.thinking)) {
          firstTokenTime = performance.now()
        }

        const thinkingDelta = chunk.message?.thinking || ''
        if (thinkingDelta) {
          if (!thinkingStartTime) thinkingStartTime = performance.now()
          accumulatedReasoning += thinkingDelta
        }

        if (chunk.message?.content) {
          accumulatedContent += chunk.message.content
          if (accumulatedReasoning && !thinkingEndTime) {
            thinkingEndTime = performance.now()
            if (thinkingStartTime) {
              thinkingDuration = thinkingEndTime - thinkingStartTime
            }
          }
        }

        if (chunk.message) {
          finalMessage = chunk.message
          if ((chunk.message as unknown as { tool_calls?: unknown[] })?.tool_calls?.length) {
            hasToolCalls = true
          }
        }

        if (chunk.done) {
          isDone = true
          finalUsage = {
            inputTokens: chunk.prompt_eval_count || 0,
            outputTokens: chunk.eval_count || 0,
            totalTokens: (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0)
          }
        }

        const now = Date.now()
        if (now - lastUpdateTime >= updateInterval && !isDone) {
          throttledUpdateStreamingMessage(sessionId, messageId, {
            content: accumulatedContent,
            thinking: accumulatedReasoning || undefined,
            thinkingDuration
          })
          lastUpdateTime = now
        }
      }

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
    } catch (streamError: unknown) {
      console.error('Ollama streaming failed, trying non-streaming:', streamError)

      // Fallback to non-streaming
      const nonStreamingResponse = await fetch(`${settings.ollamaUrl || 'http://localhost:11434'}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.aiModel,
          messages: optimizedHistory,
          stream: false,
          think: true,
          tools: ollamaTools,
          tool_choice: ollamaTools ? 'auto' : undefined,
          options: { temperature: settings.temperature }
        })
      })

      if (nonStreamingResponse.ok) {
        const data = await nonStreamingResponse.json()
        accumulatedContent = data.message?.content || ''
        accumulatedReasoning = data.message?.thinking || ''
        finalUsage = {
          inputTokens: data.prompt_eval_count || 0,
          outputTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
        }
        if (data.message?.tool_calls?.length > 0) {
          hasToolCalls = true
          finalMessage = data.message
        }
        updateStreamingMessage(sessionId, messageId, {
          content: accumulatedContent,
          thinking: accumulatedReasoning || undefined
        })
      } else {
        throw new Error(`Ollama API Error: ${nonStreamingResponse.statusText}`)
      }
    }

    updateStreamingMessage(sessionId, messageId, {
      content: accumulatedContent,
      thinking: accumulatedReasoning || undefined,
      thinkingDuration
    })

    if (!accumulatedContent) {
      // If still no content, return empty
      const endTime = performance.now()
      const latency = Math.round(endTime - startTime)
      const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : undefined
      const outputTokens = finalUsage.outputTokens || 0
      const tps = outputTokens > 0 && latency > 0 ? (outputTokens / (latency / 1000)) : undefined

      updateStreamingMessage(sessionId, messageId, {
        content: '',
        model: `ollama/${settings.aiModel}`,
        latency,
        usage: { ...finalUsage, tps, ttft }
      })
      return { content: '', model: `ollama/${settings.aiModel}` }
    }

    // Handle tool calls
    if (canUseTools && hasToolCalls && finalMessage && (finalMessage as unknown as { tool_calls?: unknown[] })?.tool_calls?.length) {
      let toolResult
      try {
        toolResult = await handleToolCalls({ choices: [{ message: finalMessage as unknown as OpenRouterMessage }] })
      } catch (toolError: unknown) {
        console.error('Tool calls processing error:', toolError)
        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
      }

      if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
        // Stream follow-up response
        let followUpContent = ''
        let followUpReasoning = ''
        let followUpLastUpdate = Date.now()
        let followUpUsage: { inputTokens: number; outputTokens: number; totalTokens: number } = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

        const webSearchCount = toolResult.toolResults?.filter((r: ToolCallResult) => r.toolCall.name === 'web_search').length || 0
        const researchContextMsg = getResearchContext(webSearchCount, researchMaxRounds, researchMandatory)

        const followUpMessages: Array<Record<string, unknown>> = [
          ...optimizedHistory,
          ...(finalMessage ? [finalMessage] : []),
          ...toolResult.formattedResults
        ]

        if (researchContextMsg) {
          followUpMessages.push({ role: 'user', content: researchContextMsg })
        }

        for await (const chunk of streamOllamaCompletion(
          settings.ollamaUrl || 'http://localhost:11434',
          settings.aiModel,
          followUpMessages,
          { temperature: settings.temperature, think: true, tools: ollamaTools, signal }
        )) {
          const thinkingDelta = chunk.message?.thinking || ''
          if (thinkingDelta) followUpReasoning += thinkingDelta
          if (chunk.message?.content) {
            followUpContent += chunk.message.content
          }
          if (chunk.done) {
            followUpUsage = {
              inputTokens: chunk.prompt_eval_count || 0,
              outputTokens: chunk.eval_count || 0,
              totalTokens: (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0)
            }
          }

          const now = Date.now()
          if (now - followUpLastUpdate >= updateInterval && !chunk.done) {
            throttledUpdateStreamingMessage(sessionId, messageId, {
              content: accumulatedContent + followUpContent,
              thinking: (accumulatedReasoning + followUpReasoning) || undefined
            })
            followUpLastUpdate = now
          }
        }

        accumulatedContent += followUpContent
        accumulatedReasoning += followUpReasoning
        flushThrottledUpdates()
        updateStreamingMessage(sessionId, messageId, {
          content: accumulatedContent,
          thinking: accumulatedReasoning || undefined
        })

        finalUsage = {
          inputTokens: (finalUsage.inputTokens || 0) + (followUpUsage.inputTokens || 0),
          outputTokens: (finalUsage.outputTokens || 0) + (followUpUsage.outputTokens || 0),
          totalTokens: (finalUsage.totalTokens || 0) + (followUpUsage.totalTokens || 0)
        }
      }

      savedToolResults = toolResult?.toolResults?.map((tr: ToolCallResult) => ({
        toolCall: { id: tr.toolCall.id, name: tr.toolCall.name, arguments: tr.toolCall.arguments },
        result: { success: tr.result?.success ?? false, data: tr.result?.data, error: tr.result?.error, executionTime: tr.result?.executionTime }
      })) || undefined
    }

    const endTime = performance.now()
    const latency = Math.round(endTime - startTime)
    const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : undefined
    const outputTokens = finalUsage.outputTokens || 0
    const tps = outputTokens > 0 && latency > 0 ? (outputTokens / (latency / 1000)) : undefined

    updateStreamingMessage(sessionId, messageId, {
      content: accumulatedContent,
      model: `ollama/${settings.aiModel}`,
      latency,
      usage: { ...finalUsage, tps, ttft },
      toolResults: savedToolResults,
      thinking: accumulatedReasoning || undefined,
      thinkingDuration
    })

    return {
      content: accumulatedContent,
      model: `ollama/${settings.aiModel}`,
      toolResults: savedToolResults,
      usage: { ...finalUsage, tps, ttft },
      latency,
      thinking: accumulatedReasoning || undefined,
      thinkingDuration
    }
  }, [settings, toolCalling, updateStreamingMessage, flushThrottledUpdates, throttledUpdateStreamingMessage, updateInterval])

  return { streamOllama }
}

/**
 * usePerplexityStreaming - Provider-specific streaming hook for Perplexity
 * 
 * Extracts Perplexity streaming logic from useStreamingChat to reduce complexity.
 * Note: Perplexity has native web search, so no tool calling support.
 * 
 * Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
 */

import { useCallback } from 'react'
import { streamPerplexityCompletion, cleanSonarResponse } from '../../../../../services/perplexity'
import type {
  StreamingResult,
  ProviderStreamingOptions,
  UpdateStreamingCallback,
  FlushCallback,
  StreamingSettings,
} from './types'
import { getStreamingUpdateInterval } from './streamingUtils'

export interface UsePerplexityStreamingOptions {
  settings: StreamingSettings
  updateStreamingMessage: UpdateStreamingCallback
  flushThrottledUpdates: FlushCallback
  throttledUpdateStreamingMessage: UpdateStreamingCallback
}

export interface UsePerplexityStreamingReturn {
  streamPerplexity: (options: ProviderStreamingOptions) => Promise<StreamingResult>
}

/**
 * Hook for Perplexity-specific streaming logic
 */
export function usePerplexityStreaming({
  settings,
  updateStreamingMessage,
  flushThrottledUpdates,
  throttledUpdateStreamingMessage,
}: UsePerplexityStreamingOptions): UsePerplexityStreamingReturn {
  const updateInterval = getStreamingUpdateInterval()

  const streamPerplexity = useCallback(async (
    options: ProviderStreamingOptions
  ): Promise<StreamingResult> => {
    const {
      sessionId,
      messageId,
      messages: optimizedHistory,
      startTime,
      signal,
    } = options

    let accumulatedContent = ''
    let lastUpdateTime = Date.now()
    let finalUsage: any = {}
    let firstTokenTime: number | null = null

    for await (const chunk of streamPerplexityCompletion(
      settings.perplexityApiKey || '',
      settings.aiModel,
      optimizedHistory,
      { temperature: settings.temperature, signal }
    )) {
      const delta = chunk.choices?.[0]?.delta?.content || ''
      if (!firstTokenTime && delta) {
        firstTokenTime = performance.now()
      }
      accumulatedContent += delta

      if (chunk.usage) {
        finalUsage = chunk.usage
      }

      const now = Date.now()
      if (now - lastUpdateTime >= updateInterval) {
        throttledUpdateStreamingMessage(sessionId, messageId, { content: accumulatedContent })
        lastUpdateTime = now
      }
    }

    const cleanedContent = cleanSonarResponse(accumulatedContent)
    // Flush throttled updates and apply final content state
    flushThrottledUpdates()
    updateStreamingMessage(sessionId, messageId, { content: cleanedContent })

    const usage = {
      inputTokens: finalUsage.prompt_tokens || 0,
      outputTokens: finalUsage.completion_tokens || 0,
      totalTokens: finalUsage.total_tokens || 0
    }

    const endTime = performance.now()
    const latency = Math.round(endTime - startTime)
    const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : undefined
    const tps = usage.outputTokens > 0 && latency > 0 ? (usage.outputTokens / (latency / 1000)) : undefined

    updateStreamingMessage(sessionId, messageId, {
      content: cleanedContent,
      model: `perplexity/${settings.aiModel}`,
      latency,
      usage: { ...usage, tps, ttft }
    })

    return {
      content: cleanedContent,
      model: `perplexity/${settings.aiModel}`,
      usage: { ...usage, tps, ttft },
      latency,
    }
  }, [settings, updateStreamingMessage, flushThrottledUpdates, throttledUpdateStreamingMessage, updateInterval])

  return { streamPerplexity }
}

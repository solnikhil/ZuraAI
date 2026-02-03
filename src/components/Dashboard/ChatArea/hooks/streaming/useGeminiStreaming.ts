/**
 * useGeminiStreaming - Provider-specific streaming hook for Google Gemini
 * 
 * Extracts Gemini streaming logic from useStreamingChat to reduce complexity.
 * 
 * Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
 */

import { useCallback } from 'react'
import { streamGeminiCompletion } from '../../../../../services/gemini'
import type {
  StreamingResult,
  ProviderStreamingOptions,
  UpdateStreamingCallback,
  FlushCallback,
  StreamingSettings,
} from './types'

const UPDATE_INTERVAL = 120 // ms
const SMOOTH_UPDATE_INTERVAL = 40 // ms

export interface UseGeminiStreamingOptions {
  settings: StreamingSettings
  updateStreamingMessage: UpdateStreamingCallback
  flushThrottledUpdates: FlushCallback
  throttledUpdateStreamingMessage: UpdateStreamingCallback
}

export interface UseGeminiStreamingReturn {
  streamGemini: (options: ProviderStreamingOptions) => Promise<StreamingResult>
}

/**
 * Hook for Gemini-specific streaming logic
 */
export function useGeminiStreaming({
  settings,
  updateStreamingMessage,
  flushThrottledUpdates,
  throttledUpdateStreamingMessage,
}: UseGeminiStreamingOptions): UseGeminiStreamingReturn {
  const updateInterval = settings.streamResponses ? SMOOTH_UPDATE_INTERVAL : UPDATE_INTERVAL

  const streamGemini = useCallback(async (
    options: ProviderStreamingOptions
  ): Promise<StreamingResult> => {
    const {
      sessionId,
      messageId,
      messages: geminiMessages,
      startTime,
      signal,
    } = options

    let accumulatedContent = ''
    let lastUpdateTime = Date.now()
    let finalUsage: any = {}
    let chunkCount = 0
    let firstTokenTime: number | null = null

    for await (const chunk of streamGeminiCompletion(
      settings.geminiApiKey || '',
      settings.aiModel,
      geminiMessages,
      { temperature: settings.temperature, maxOutputTokens: settings.maxTokens, signal }
    )) {
      chunkCount++
      if (!chunk) continue

      const chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (!firstTokenTime && chunkText) {
        firstTokenTime = performance.now()
      }
      if (chunkText) accumulatedContent = chunkText

      if (chunk.usageMetadata) finalUsage = chunk.usageMetadata

      const now = Date.now()
      if (now - lastUpdateTime >= updateInterval) {
        throttledUpdateStreamingMessage(sessionId, messageId, { content: accumulatedContent })
        lastUpdateTime = now
      }
    }

    // Flush throttled updates and apply final content state
    flushThrottledUpdates()
    updateStreamingMessage(sessionId, messageId, { content: accumulatedContent })

    if (!accumulatedContent) {
      if (!settings.geminiApiKey?.trim()) {
        accumulatedContent = 'Gemini API key is not set. Please add it in Settings > API Keys.'
      } else if (chunkCount === 0) {
        accumulatedContent = 'No response from Gemini. Check API key and model.'
      }
      if (accumulatedContent) {
        updateStreamingMessage(sessionId, messageId, { content: accumulatedContent })
      }
    }

    const usage = {
      inputTokens: finalUsage.promptTokenCount || 0,
      outputTokens: finalUsage.candidatesTokenCount || 0,
      totalTokens: finalUsage.totalTokenCount || 0
    }

    const endTime = performance.now()
    const latency = Math.round(endTime - startTime)
    const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : undefined
    const tps = usage.outputTokens > 0 && latency > 0 ? (usage.outputTokens / (latency / 1000)) : undefined

    updateStreamingMessage(sessionId, messageId, {
      content: accumulatedContent,
      model: `gemini/${settings.aiModel}`,
      latency,
      usage: { ...usage, tps, ttft }
    })

    return {
      content: accumulatedContent,
      model: `gemini/${settings.aiModel}`,
      usage: { ...usage, tps, ttft },
      latency,
    }
  }, [settings, updateStreamingMessage, flushThrottledUpdates, throttledUpdateStreamingMessage, updateInterval])

  return { streamGemini }
}

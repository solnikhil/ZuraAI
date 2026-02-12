/**
 * useGeminiStreaming - Provider-specific streaming hook for Google Gemini
 *
 * Extracts Gemini streaming logic from useStreamingChat to reduce complexity.
 * Supports tool calling and research mode.
 *
 * Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
 */

import { useCallback } from 'react'
import { streamGeminiCompletion } from '../../../../../services/gemini'
import type { GeminiTools } from '../../../../../tools/adapters/gemini'
import { buildMessagesWithToolResults } from '../../../../../tools/toolManager'
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

export interface UseGeminiStreamingOptions {
  settings: StreamingSettings
  toolCalling: ToolCallingHook
  updateStreamingMessage: UpdateStreamingCallback
  flushThrottledUpdates: FlushCallback
  throttledUpdateStreamingMessage: UpdateStreamingCallback
}

export interface UseGeminiStreamingReturn {
  streamGemini: (options: ToolCallingOptions) => Promise<StreamingResult>
}

/**
 * Hook for Gemini-specific streaming logic with tool calling support
 */
export function useGeminiStreaming({
  settings,
  toolCalling,
  updateStreamingMessage,
  flushThrottledUpdates,
  throttledUpdateStreamingMessage,
}: UseGeminiStreamingOptions): UseGeminiStreamingReturn {
  const updateInterval = settings.streamResponses ? SMOOTH_UPDATE_INTERVAL : UPDATE_INTERVAL

  const streamGemini = useCallback(async (
    options: ToolCallingOptions
  ): Promise<StreamingResult> => {
    const {
      sessionId,
      messageId,
      messages: geminiMessages,
      startTime,
      researchMaxRounds,
      researchMandatory,
      signal,
    } = options

    const { canUseTools, getToolsForRequest, handleToolCalls, getResearchContext } = toolCalling
    const tools = canUseTools ? getToolsForRequest() : null
    const geminiTools: GeminiTools | undefined = tools && typeof tools === 'object' && 'function_declarations' in tools ? (tools as GeminiTools) : undefined

    let accumulatedContent = ''
    let lastUpdateTime = Date.now()
    let finalUsage: any = {}
    let chunkCount = 0
    let firstTokenTime: number | null = null
    let hasToolCalls = false
    const functionCallParts: Array<{ functionCall: { name: string; args: Record<string, unknown> } }> = []
    let finishReason: string | null = null
    let savedToolResults: any = null

    const requestedMaxTokens = (typeof settings.maxTokens === 'number' && Number.isFinite(settings.maxTokens) && settings.maxTokens > 0)
      ? settings.maxTokens
      : 8000

    for await (const chunk of streamGeminiCompletion(
      settings.geminiApiKey || '',
      settings.aiModel,
      geminiMessages,
      { temperature: settings.temperature, maxOutputTokens: requestedMaxTokens, tools: geminiTools, signal }
    )) {
      chunkCount++
      if (!chunk) continue

      const parts = chunk.candidates?.[0]?.content?.parts || []
      const fcParts = parts.filter((p: any) => p?.functionCall?.name)
      if (fcParts.length > 0) {
        hasToolCalls = true
        functionCallParts.length = 0
        fcParts.forEach((p: any) => {
          functionCallParts.push({ functionCall: { name: p.functionCall.name, args: p.functionCall.args || {} } })
        })
      }

      const chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (!firstTokenTime && chunkText) {
        firstTokenTime = performance.now()
      }
      if (chunkText) accumulatedContent = chunkText

      if (chunk.usageMetadata) finalUsage = chunk.usageMetadata
      if (chunk.candidates?.[0]?.finishReason) finishReason = chunk.candidates[0].finishReason

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

    let usage = {
      inputTokens: finalUsage.promptTokenCount || 0,
      outputTokens: finalUsage.candidatesTokenCount || 0,
      totalTokens: finalUsage.totalTokenCount || 0
    }

    // Handle tool calls with research loop
    const hasValidToolCalls = canUseTools && hasToolCalls && functionCallParts.length > 0
    if (hasValidToolCalls) {
      const geminiResponse = {
        candidates: [{ content: { parts: functionCallParts } }]
      }

      let toolResult
      try {
        toolResult = await handleToolCalls(geminiResponse)
      } catch (toolError: any) {
        console.error('Tool calls processing error:', toolError)
        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
      }

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
        let totalSearchCount = toolResult.toolResults?.filter((r: any) => r.toolCall.name === 'web_search').length || 0
        let hasMoreToolCalls = true
        let modelTurnParts = [...functionCallParts]
        let toolResultFormatted = toolResult.formattedResults
        let researchRound = 1
        let accumulatedMessages: any[] = buildMessagesWithToolResults(
          geminiMessages,
          { role: 'model', parts: modelTurnParts } as any,
          toolResultFormatted,
          'gemini'
        )

        while (hasMoreToolCalls && researchRound < researchMaxRounds) {
          const researchContextMsg = getResearchContext(totalSearchCount, researchMaxRounds, researchMandatory)

          const followUpMessages: any[] = []
          if (researchContextMsg) {
            followUpMessages.push({ role: 'user', parts: [{ text: researchContextMsg }] })
          }
          followUpMessages.push(...accumulatedMessages)

          let followUpContent = ''
          const followUpFunctionCallParts: Array<{ functionCall: { name: string; args: Record<string, unknown> } }> = []
          let followUpUsage: any = {}

          updateStreamingMessage(sessionId, messageId, {
            researchStatus: { currentRound: researchRound, maxRounds: researchMaxRounds, isSearching: false }
          })

          for await (const chunk of streamGeminiCompletion(
            settings.geminiApiKey || '',
            settings.aiModel,
            followUpMessages,
            { temperature: settings.temperature, maxOutputTokens: requestedMaxTokens, tools: geminiTools, signal }
          )) {
            const parts = chunk.candidates?.[0]?.content?.parts || []
            for (const part of parts) {
              if (part && (part as any).functionCall) {
                const fc = (part as any).functionCall
                if (fc.name && fc.args) {
                  followUpFunctionCallParts.push({ functionCall: { name: fc.name, args: fc.args || {} } })
                }
              }
            }

            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || ''
            if (text) followUpContent = text

            if (chunk.usageMetadata) followUpUsage = chunk.usageMetadata

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
            inputTokens: (usage.inputTokens || 0) + (followUpUsage.promptTokenCount || 0),
            outputTokens: (usage.outputTokens || 0) + (followUpUsage.candidatesTokenCount || 0),
            totalTokens: (usage.totalTokens || 0) + (followUpUsage.totalTokenCount || 0)
          }

          if (followUpFunctionCallParts.length > 0) {
            const followUpResponse = { candidates: [{ content: { parts: followUpFunctionCallParts } }] }

            let nextToolResult
            try {
              nextToolResult = await handleToolCalls(followUpResponse)
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
            modelTurnParts = [...followUpFunctionCallParts]
            toolResultFormatted = nextToolResult.formattedResults
            researchRound++

            accumulatedMessages = buildMessagesWithToolResults(
              accumulatedMessages,
              { role: 'model', parts: modelTurnParts } as any,
              toolResultFormatted,
              'gemini'
            )

            const remainingAfter = researchMaxRounds - totalSearchCount
            hasMoreToolCalls = remainingAfter > 0 && (researchMandatory || nextToolResult.needsFollowUp)
          } else {
            hasMoreToolCalls = false
          }
        }

        if (researchMandatory && totalSearchCount >= researchMaxRounds) {
          const finalAnswerMessages: any[] = [
            { role: 'user', parts: [{ text: `\n\n*** ALL RESEARCH COMPLETE ***\nYou have completed all ${totalSearchCount} required web searches.\n\nYou MUST now provide your FINAL COMPREHENSIVE ANSWER based on all the information gathered.\n\nDo NOT make any more tool calls.\nSynthesize all the search results into a coherent, well-structured response that directly answers the user's question.\nInclude relevant details from the searches and cite sources where appropriate.` }] },
            ...accumulatedMessages
          ]

          let finalAnswerContent = ''
          let finalAnswerUsage: any = {}

          for await (const chunk of streamGeminiCompletion(
            settings.geminiApiKey || '',
            settings.aiModel,
            finalAnswerMessages,
            { temperature: settings.temperature, maxOutputTokens: requestedMaxTokens, tools: geminiTools, signal }
          )) {
            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || ''
            if (text) finalAnswerContent = text

            if (chunk.usageMetadata) finalAnswerUsage = chunk.usageMetadata

            const now = Date.now()
            if (now - lastUpdateTime >= updateInterval) {
              throttledUpdateStreamingMessage(sessionId, messageId, {
                content: accumulatedContent + finalAnswerContent,
                researchStatus: undefined
              })
              lastUpdateTime = now
            }
          }

          accumulatedContent += finalAnswerContent
          flushThrottledUpdates()
          updateStreamingMessage(sessionId, messageId, {
            content: accumulatedContent,
            researchStatus: undefined
          })

          usage = {
            inputTokens: (usage.inputTokens || 0) + (finalAnswerUsage.promptTokenCount || 0),
            outputTokens: (usage.outputTokens || 0) + (finalAnswerUsage.candidatesTokenCount || 0),
            totalTokens: (usage.totalTokens || 0) + (finalAnswerUsage.totalTokenCount || 0)
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
      model: `gemini/${settings.aiModel}`,
      latency,
      usage: { ...usage, tps, ttft },
      finishReason: finishReason || undefined,
      toolResults: savedToolResults
    })

    return {
      content: accumulatedContent,
      model: `gemini/${settings.aiModel}`,
      toolResults: savedToolResults,
      usage: { ...usage, tps, ttft },
      latency,
      finishReason: finishReason || undefined,
    }
  }, [settings, toolCalling, updateStreamingMessage, flushThrottledUpdates, throttledUpdateStreamingMessage, updateInterval])

  return { streamGemini }
}

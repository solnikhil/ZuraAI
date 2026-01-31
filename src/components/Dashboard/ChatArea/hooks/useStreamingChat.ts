/**
 * useStreamingChat - Custom hook for handling chat streaming logic
 * Encapsulates all provider-specific streaming, tool calling, and research mode logic
 * 
 * Requirements: 1.1, 7.1, 7.2, 7.3
 */

import { useState, useCallback, useRef } from 'react'
import { useChatHistory, type Message, type ThinkingBlock } from '../../../../contexts/ChatHistoryContext'
import { useSettings } from '../../../../contexts/SettingsContext'
import { useToast } from '../../../shared/Toast'
import { useToolCalling } from '../../../../hooks/useToolCalling'
import { streamOllamaCompletion } from '../../../../services/ollama'
import { streamPerplexityCompletion, cleanSonarResponse } from '../../../../services/perplexity'
import { streamGeminiCompletion } from '../../../../services/gemini'
import { streamGroqCompletion } from '../../../../services/groq'
import { streamOpenRouterCompletion } from '../../../../services/openrouter'
import { 
  streamMiniMaxCompletion, 
  extractReasoningFromChunk, 
  extractReasoningText,
  ToolCallAccumulator,
  ReasoningAccumulator,
  isToolCallsFinishReason,
  extractUsageMetrics,
  accumulateUsageMetrics,
  calculateTPS
} from '../../../../services/minimax'
import { generateChatTitle } from '../../../../services/titleGenerator'
import { buildOptimizedContext } from '../../../../utils/tokenUtils'
import { getEffectiveSystemPrompt } from '../../../../utils/promptSelection'
import type { AttachedFile } from '../FileUploadHandler'

export interface UseStreamingChatOptions {
  onMessageSent?: () => void
  onStreamStart?: () => void
  onStreamEnd?: () => void
  onRegenerateStart?: () => void
}

export interface UseStreamingChatReturn {
  isLoading: boolean
  sendMessage: (content: string, files: AttachedFile[]) => Promise<void>
  regenerateMessage: (message: any, instruction: string) => Promise<void>
  stopStreaming: () => void
}

const UPDATE_INTERVAL = 120 // ms

function userRequestsWebSearch(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('use web search') ||
    normalized.includes('web search') ||
    normalized.includes('web_search') ||
    normalized.includes('search the web') ||
    normalized.includes('search online') ||
    normalized.includes('use websearch')
  )
}

export function useStreamingChat(options: UseStreamingChatOptions = {}): UseStreamingChatReturn {
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const {
    sessions,
    currentSessionId,
    addMessageToSession,
    updateStreamingMessage,
    createSession,
    updateSessionTitle,
    deleteMessageFromSession
  } = useChatHistory()

  const { settings, updateSettings } = useSettings()
  const { showToast } = useToast()
  const {
    canUseTools,
    getToolsForRequest,
    handleToolCalls,
    toolState,
    clearToolState,
    startResearchMode,
    getResearchContext
  } = useToolCalling()

  const currentSession = sessions.find(s => s.id === currentSessionId)
  const messages = currentSession?.messages || []

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsLoading(false)
    clearToolState()
    options.onStreamEnd?.()
  }, [clearToolState, options])

  /**
   * Stream response from Ollama provider
   */
  const streamOllama = async (
    targetSessionId: string,
    streamingMessageId: string,
    optimizedHistory: any[],
    startTime: number,
    researchMaxRounds: number,
    researchMandatory: boolean
  ) => {
    const tools = canUseTools ? getToolsForRequest() : null
    const ollamaTools = tools && Array.isArray(tools) ? tools : undefined

    let accumulatedContent = ''
    let lastUpdateTime = Date.now()
    let finalUsage: any = {}
    let hasToolCalls = false
    let finalMessage: any = null
    let isDone = false
    let savedToolResults: any = null
    let localThinkingBlocks: ThinkingBlock[] = []
    let firstTokenTime: number | null = null

    try {
      for await (const chunk of streamOllamaCompletion(
        settings.ollamaUrl,
        settings.aiModel,
        optimizedHistory,
        { temperature: settings.temperature, tools: ollamaTools, signal: abortControllerRef.current?.signal }
      )) {
        if (!firstTokenTime && chunk.message?.content) {
          firstTokenTime = performance.now()
        }

        if (chunk.message?.content) {
          accumulatedContent += chunk.message.content
        }

        if (chunk.message) {
          finalMessage = chunk.message
          if ((chunk.message as any)?.tool_calls?.length > 0) {
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
        if (now - lastUpdateTime >= UPDATE_INTERVAL && !isDone) {
          updateStreamingMessage(targetSessionId, streamingMessageId, { content: accumulatedContent })
          lastUpdateTime = now
        }
      }

      updateStreamingMessage(targetSessionId, streamingMessageId, { content: accumulatedContent })
    } catch (streamError: any) {
      console.error('Ollama streaming failed, trying non-streaming:', streamError)

      // Fallback to non-streaming
      const nonStreamingResponse = await fetch(`${settings.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.aiModel,
          messages: optimizedHistory,
          stream: false,
          tools: ollamaTools,
          tool_choice: ollamaTools ? 'auto' : undefined,
          options: { temperature: settings.temperature }
        })
      })

      if (nonStreamingResponse.ok) {
        const data = await nonStreamingResponse.json()
        accumulatedContent = data.message?.content || ''
        finalUsage = {
          inputTokens: data.prompt_eval_count || 0,
          outputTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
        }
        if (data.message?.tool_calls?.length > 0) {
          hasToolCalls = true
          finalMessage = data.message
        }
        updateStreamingMessage(targetSessionId, streamingMessageId, { content: accumulatedContent })
      } else {
        throw new Error(`Ollama API Error: ${nonStreamingResponse.statusText}`)
      }
    }

    updateStreamingMessage(targetSessionId, streamingMessageId, { content: accumulatedContent })

    if (!accumulatedContent) {
      // If still no content, return empty
      const endTime = performance.now()
      const latency = Math.round(endTime - startTime)
      const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : undefined
      const outputTokens = finalUsage.outputTokens || 0
      const tps = outputTokens > 0 && latency > 0 ? (outputTokens / (latency / 1000)) : undefined

      updateStreamingMessage(targetSessionId, streamingMessageId, {
        content: '',
        model: `ollama/${settings.aiModel}`,
        latency,
        usage: { ...finalUsage, tps, ttft }
      })
      return { content: '', model: `ollama/${settings.aiModel}` }
    }

    // Handle tool calls
    if (canUseTools && hasToolCalls && finalMessage?.tool_calls?.length > 0) {
      let toolResult
      try {
        toolResult = await handleToolCalls({ choices: [{ message: finalMessage }] })
      } catch (toolError: any) {
        console.error('Tool calls processing error:', toolError)
        showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
      }

      if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
        // Stream follow-up response
        let followUpContent = ''
        let followUpLastUpdate = Date.now()
        let followUpUsage: any = {}

        const webSearchCount = toolResult.toolResults?.filter((r: any) => r.toolCall.name === 'web_search').length || 0
        const researchContextMsg = getResearchContext(webSearchCount, researchMaxRounds, researchMandatory)

        const followUpMessages: any[] = [
          ...optimizedHistory,
          finalMessage,
          ...toolResult.formattedResults
        ]

        if (researchContextMsg) {
          followUpMessages.push({ role: 'user', content: researchContextMsg })
        }

        for await (const chunk of streamOllamaCompletion(
          settings.ollamaUrl,
          settings.aiModel,
          followUpMessages,
          { temperature: settings.temperature, tools: ollamaTools, signal: abortControllerRef.current?.signal }
        )) {
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
          if (now - followUpLastUpdate >= UPDATE_INTERVAL && !chunk.done) {
            updateStreamingMessage(targetSessionId, streamingMessageId, {
              content: accumulatedContent + followUpContent
            })
            followUpLastUpdate = now
          }
        }

        accumulatedContent += followUpContent
        updateStreamingMessage(targetSessionId, streamingMessageId, { content: accumulatedContent })

        finalUsage = {
          inputTokens: (finalUsage.inputTokens || 0) + (followUpUsage.inputTokens || 0),
          outputTokens: (finalUsage.outputTokens || 0) + (followUpUsage.outputTokens || 0),
          totalTokens: (finalUsage.totalTokens || 0) + (followUpUsage.totalTokens || 0)
        }
      }
    }

    const endTime = performance.now()
    const latency = Math.round(endTime - startTime)
    const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : undefined
    const outputTokens = finalUsage.outputTokens || 0
    const tps = outputTokens > 0 && latency > 0 ? (outputTokens / (latency / 1000)) : undefined

    updateStreamingMessage(targetSessionId, streamingMessageId, {
      content: accumulatedContent,
      model: `ollama/${settings.aiModel}`,
      latency,
      usage: { ...finalUsage, tps, ttft },
      toolResults: savedToolResults
    })

    return { content: accumulatedContent, model: `ollama/${settings.aiModel}` }
  }


  /**
   * Stream response from Perplexity provider
   */
  const streamPerplexity = async (
    targetSessionId: string,
    streamingMessageId: string,
    optimizedHistory: any[],
    startTime: number
  ) => {
    let accumulatedContent = ''
    let lastUpdateTime = Date.now()
    let finalUsage: any = {}
    let firstTokenTime: number | null = null

    for await (const chunk of streamPerplexityCompletion(
      settings.perplexityApiKey,
      settings.aiModel,
      optimizedHistory,
      { temperature: settings.temperature, max_tokens: settings.maxTokens, signal: abortControllerRef.current?.signal }
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
      if (now - lastUpdateTime >= UPDATE_INTERVAL) {
        updateStreamingMessage(targetSessionId, streamingMessageId, { content: accumulatedContent })
        lastUpdateTime = now
      }
    }

    const cleanedContent = cleanSonarResponse(accumulatedContent)
    updateStreamingMessage(targetSessionId, streamingMessageId, { content: cleanedContent })

    const usage = {
      inputTokens: finalUsage.prompt_tokens || 0,
      outputTokens: finalUsage.completion_tokens || 0,
      totalTokens: finalUsage.total_tokens || 0
    }

    const endTime = performance.now()
    const latency = Math.round(endTime - startTime)
    const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : undefined
    const tps = usage.outputTokens > 0 && latency > 0 ? (usage.outputTokens / (latency / 1000)) : undefined

    updateStreamingMessage(targetSessionId, streamingMessageId, {
      content: cleanedContent,
      model: `perplexity/${settings.aiModel}`,
      latency,
      usage: { ...usage, tps, ttft }
    })

    return { content: cleanedContent, model: `perplexity/${settings.aiModel}` }
  }

  /**
   * Stream response from Gemini provider
   */
  const streamGemini = async (
    targetSessionId: string,
    streamingMessageId: string,
    geminiMessages: any[],
    startTime: number
  ) => {
    let accumulatedContent = ''
    let lastUpdateTime = Date.now()
    let finalUsage: any = {}
    let chunkCount = 0
    let firstTokenTime: number | null = null

    for await (const chunk of streamGeminiCompletion(
      settings.geminiApiKey,
      settings.aiModel,
      geminiMessages,
      { temperature: settings.temperature, maxOutputTokens: settings.maxTokens, signal: abortControllerRef.current?.signal }
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
      if (now - lastUpdateTime >= UPDATE_INTERVAL) {
        updateStreamingMessage(targetSessionId, streamingMessageId, { content: accumulatedContent })
        lastUpdateTime = now
      }
    }

    updateStreamingMessage(targetSessionId, streamingMessageId, { content: accumulatedContent })

    if (!accumulatedContent) {
      if (!settings.geminiApiKey?.trim()) {
        accumulatedContent = 'Gemini API key is not set. Please add it in Settings > API Keys.'
      } else if (chunkCount === 0) {
        accumulatedContent = 'No response from Gemini. Check API key and model.'
      }
      if (accumulatedContent) {
        updateStreamingMessage(targetSessionId, streamingMessageId, { content: accumulatedContent })
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

    updateStreamingMessage(targetSessionId, streamingMessageId, {
      content: accumulatedContent,
      model: `gemini/${settings.aiModel}`,
      latency,
      usage: { ...usage, tps, ttft }
    })

    return { content: accumulatedContent, model: `gemini/${settings.aiModel}` }
  }


  /**
   * Stream response from Groq provider with tool calling support
   */
  const streamGroq = async (
    targetSessionId: string,
    streamingMessageId: string,
    optimizedHistory: any[],
    startTime: number,
    researchMaxRounds: number,
    researchMandatory: boolean
  ) => {
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
      settings.groqApiKey,
      settings.aiModel,
      optimizedHistory,
      {
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        tools: groqTools,
        toolChoice: initialToolChoice,
        signal: abortControllerRef.current?.signal
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
      if (now - lastUpdateTime >= UPDATE_INTERVAL) {
        updateStreamingMessage(targetSessionId, streamingMessageId, {
          content: accumulatedContent,
          thinking: accumulatedReasoning || undefined
        })
        lastUpdateTime = now
      }
    }

    updateStreamingMessage(targetSessionId, streamingMessageId, {
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
        showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
      }

      // Update researchStatus for web searches instead of creating separate blocks
      const webSearchCalls = (toolResult.toolResults || []).filter((tr: any) => tr.toolCall.name === 'web_search')
      if (webSearchCalls.length > 0) {
        // Get the first search query for display
        const firstSearchQuery = webSearchCalls[0]
        const searchQuery = typeof firstSearchQuery.toolCall.arguments === 'object'
          ? firstSearchQuery.toolCall.arguments?.query
          : firstSearchQuery.toolCall.arguments

        // Update researchStatus to show searching state (single block will handle display)
        updateStreamingMessage(targetSessionId, streamingMessageId, {
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
            settings.groqApiKey,
            settings.aiModel,
            followUpMessages,
            { temperature: settings.temperature, max_tokens: settings.maxTokens, tools: groqTools, toolChoice, signal: abortControllerRef.current?.signal }
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
            if (now - lastUpdateTime >= UPDATE_INTERVAL) {
              updateStreamingMessage(targetSessionId, streamingMessageId, { content: accumulatedContent + followUpContent })
              lastUpdateTime = now
            }
          }

          accumulatedContent += followUpContent
          updateStreamingMessage(targetSessionId, streamingMessageId, { content: accumulatedContent })

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

    updateStreamingMessage(targetSessionId, streamingMessageId, {
      content: accumulatedContent,
      model: `groq/${settings.aiModel}`,
      latency,
      usage: { ...usage, tps, ttft },
      toolResults: savedToolResults
    })

    return { content: accumulatedContent, model: `groq/${settings.aiModel}` }
  }


  /**
   * Stream response from MiniMax provider with tool calling and reasoning support
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
   */
  const streamMiniMax = async (
    targetSessionId: string,
    streamingMessageId: string,
    optimizedHistory: any[],
    startTime: number,
    researchMaxRounds: number,
    researchMandatory: boolean
  ) => {
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
        settings.minimaxApiKey,
        settings.aiModel,
        optimizedHistory,
        {
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          tools: minimaxTools,
          toolChoice: initialToolChoice,
          signal: abortControllerRef.current?.signal
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

          updateStreamingMessage(targetSessionId, streamingMessageId, {
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
        if (now - lastUpdateTime >= UPDATE_INTERVAL) {
          updateStreamingMessage(targetSessionId, streamingMessageId, {
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

    updateStreamingMessage(targetSessionId, streamingMessageId, {
      content: accumulatedContent,
      thinking: reasoningAccumulator.hasReasoning() ? reasoningAccumulator.getReasoning() : undefined,
      thinkingDuration
    })

    // Map MiniMax usage to standard format using utility function
    // Requirements: 10.1, 10.2, 10.3, 10.4
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
        showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
      }

      // Update researchStatus for web searches instead of creating separate blocks
      const webSearchCalls = (toolResult.toolResults || []).filter((tr: any) => tr.toolCall.name === 'web_search')
      if (webSearchCalls.length > 0) {
        // Get the first search query for display
        const firstSearchQuery = webSearchCalls[0]
        const searchQuery = typeof firstSearchQuery.toolCall.arguments === 'object'
          ? firstSearchQuery.toolCall.arguments?.query
          : firstSearchQuery.toolCall.arguments

        // Update researchStatus to show searching state (single block will handle display)
        updateStreamingMessage(targetSessionId, streamingMessageId, {
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

          updateStreamingMessage(targetSessionId, streamingMessageId, {
            researchStatus: { currentRound: researchRound, maxRounds: researchMaxRounds, isSearching: false }
          })

          for await (const chunk of streamMiniMaxCompletion(
            settings.minimaxApiKey,
            settings.aiModel,
            followUpMessages,
            { temperature: settings.temperature, maxTokens: settings.maxTokens, tools: minimaxTools, toolChoice, signal: abortControllerRef.current?.signal }
          )) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            followUpContent += delta

            // Extract reasoning
            const reasoningDetails = extractReasoningFromChunk(chunk)
            if (reasoningDetails && reasoningDetails.length > 0) {
              followUpReasoningAccumulator.accumulate(reasoningDetails)
              updateStreamingMessage(targetSessionId, streamingMessageId, {
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
            if (now - lastUpdateTime >= UPDATE_INTERVAL) {
              updateStreamingMessage(targetSessionId, streamingMessageId, {
                content: accumulatedContent + followUpContent,
                thinking: followUpReasoningAccumulator.hasReasoning() ? followUpReasoningAccumulator.getReasoning() : undefined
              })
              lastUpdateTime = now
            }
          }

          accumulatedContent += followUpContent
          updateStreamingMessage(targetSessionId, streamingMessageId, { content: accumulatedContent })

          // Accumulate usage metrics from follow-up request
          // Requirements: 10.1, 10.2, 10.3, 10.4
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
                updateStreamingMessage(targetSessionId, streamingMessageId, {
                  thinking: '', thinkingDuration: undefined, thinkingBlocks: [...localThinkingBlocks],
                  researchStatus: { currentRound: researchRound, maxRounds: researchMaxRounds, currentSearch: String(searchQuery || ''), isSearching: true }
                })
                followUpReasoningAccumulator.clear()
              }
            }

            // Update researchStatus to stop searching (searching blocks are handled by single thinking block)
            updateStreamingMessage(targetSessionId, streamingMessageId, {
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
            settings.minimaxApiKey,
            settings.aiModel,
            finalAnswerMessages,
            { temperature: settings.temperature, maxTokens: settings.maxTokens, tools: minimaxTools, signal: abortControllerRef.current?.signal }
          )) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            finalAnswerContent += delta

            const reasoningDetails = extractReasoningFromChunk(chunk)
            if (reasoningDetails && reasoningDetails.length > 0) {
              finalReasoningAccumulator.accumulate(reasoningDetails)
              const currentReasoning = reasoningAccumulator.getReasoning()
              const finalReasoning = finalReasoningAccumulator.getReasoning()
              const updatedThinking = currentReasoning + (currentReasoning ? '\n\n---\n\n' : '') + finalReasoning
              updateStreamingMessage(targetSessionId, streamingMessageId, {
                content: accumulatedContent + finalAnswerContent,
                thinking: updatedThinking
              })
            }

            if (chunk.usage) {
              finalAnswerUsage = chunk.usage
            }

            const now = Date.now()
            if (now - lastUpdateTime >= UPDATE_INTERVAL) {
              const currentReasoning = reasoningAccumulator.getReasoning()
              const finalReasoning = finalReasoningAccumulator.getReasoning()
              const fullThinking = currentReasoning + (finalReasoning ? '\n\n---\n\n' + finalReasoning : '')
              updateStreamingMessage(targetSessionId, streamingMessageId, {
                content: accumulatedContent + finalAnswerContent,
                thinking: fullThinking || undefined
              })
              lastUpdateTime = now
            }
          }

          accumulatedContent += finalAnswerContent

          updateStreamingMessage(targetSessionId, streamingMessageId, {
            content: accumulatedContent,
            thinking: reasoningAccumulator.hasReasoning() ? reasoningAccumulator.getReasoning() : undefined,
            researchStatus: undefined
          })

          // Accumulate usage metrics from final answer request
          // Requirements: 10.1, 10.2, 10.3, 10.4
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
    // Requirements: 10.5
    const tps = calculateTPS(usage.outputTokens, latency)

    updateStreamingMessage(targetSessionId, streamingMessageId, {
      content: accumulatedContent,
      thinking: reasoningAccumulator.hasReasoning() ? reasoningAccumulator.getReasoning() : undefined,
      model: `minimax/${settings.aiModel}`,
      latency,
      usage: { ...usage, tps, ttft },
      toolResults: savedToolResults
    })

    return { content: accumulatedContent, model: `minimax/${settings.aiModel}` }
  }


  /**
   * Stream response from OpenRouter provider with tool calling and research support
   */
  const streamOpenRouter = async (
    targetSessionId: string,
    streamingMessageId: string,
    openRouterMessages: any[],
    startTime: number,
    researchMaxRounds: number,
    researchMandatory: boolean,
    forceWebSearch: boolean
  ) => {
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
    // Providers/models may still enforce their own caps.
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
      settings.openRouterApiKey,
      settings.aiModel,
      openRouterMessages,
      { temperature: settings.temperature, maxTokens: requestedMaxTokens, tools: openRouterTools, toolChoice: initialToolChoice, signal: abortControllerRef.current?.signal }
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

        updateStreamingMessage(targetSessionId, streamingMessageId, {
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
        updateStreamingMessage(targetSessionId, streamingMessageId, {
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
      if (now - lastUpdateTime >= UPDATE_INTERVAL) {
        updateStreamingMessage(targetSessionId, streamingMessageId, {
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

    updateStreamingMessage(targetSessionId, streamingMessageId, {
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
        showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
      }

      // Update researchStatus for web searches instead of creating separate blocks
      const webSearchCalls = (toolResult.toolResults || []).filter((tr: any) => tr.toolCall.name === 'web_search')
      if (webSearchCalls.length > 0) {
        // Get the first search query for display
        const firstSearchQuery = webSearchCalls[0]
        const searchQuery = typeof firstSearchQuery.toolCall.arguments === 'object'
          ? firstSearchQuery.toolCall.arguments?.query
          : firstSearchQuery.toolCall.arguments

        // Update researchStatus to show searching state (single block will handle display)
        updateStreamingMessage(targetSessionId, streamingMessageId, {
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

          updateStreamingMessage(targetSessionId, streamingMessageId, {
            researchStatus: { currentRound: researchRound, maxRounds: researchMaxRounds, isSearching: false }
          })

          for await (const chunk of streamOpenRouterCompletion(
            settings.openRouterApiKey,
            settings.aiModel,
            followUpMessages,
            { temperature: settings.temperature, maxTokens: requestedMaxTokens, tools: openRouterTools, toolChoice, signal: abortControllerRef.current?.signal }
          )) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            followUpContent += delta

            const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning || ''
            if (reasoningDelta) {
              followUpReasoning += reasoningDelta
              updateStreamingMessage(targetSessionId, streamingMessageId, {
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
            if (now - lastUpdateTime >= UPDATE_INTERVAL) {
              updateStreamingMessage(targetSessionId, streamingMessageId, {
                content: accumulatedContent + followUpContent,
                thinking: followUpReasoning || undefined
              })
              lastUpdateTime = now
            }
          }

          accumulatedContent += followUpContent
          if (followUpReasoning) accumulatedReasoning = followUpReasoning
          updateStreamingMessage(targetSessionId, streamingMessageId, { content: accumulatedContent })

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
                updateStreamingMessage(targetSessionId, streamingMessageId, {
                  thinking: '', thinkingDuration: undefined, thinkingBlocks: [...localThinkingBlocks],
                  researchStatus: { currentRound: researchRound, maxRounds: researchMaxRounds, currentSearch: String(searchQuery || ''), isSearching: true }
                })
                accumulatedReasoning = ''
              }
            }

            // Update researchStatus to stop searching (searching blocks are handled by single thinking block)
            updateStreamingMessage(targetSessionId, streamingMessageId, {
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
            settings.openRouterApiKey,
            settings.aiModel,
            finalAnswerMessages,
            { temperature: settings.temperature, maxTokens: requestedMaxTokens, tools: openRouterTools, signal: abortControllerRef.current?.signal }
          )) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            finalAnswerContent += delta

            const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning || ''
            if (reasoningDelta) {
              finalAnswerReasoning += reasoningDelta
              const updatedThinking = accumulatedReasoning + (accumulatedReasoning ? '\n\n---\n\n' : '') + finalAnswerReasoning
              updateStreamingMessage(targetSessionId, streamingMessageId, {
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
            if (now - lastUpdateTime >= UPDATE_INTERVAL) {
              const fullThinking = accumulatedReasoning + (finalAnswerReasoning ? '\n\n---\n\n' + finalAnswerReasoning : '')
              updateStreamingMessage(targetSessionId, streamingMessageId, {
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

          updateStreamingMessage(targetSessionId, streamingMessageId, {
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

    updateStreamingMessage(targetSessionId, streamingMessageId, {
      content: accumulatedContent,
      thinking: accumulatedReasoning || undefined,
      model: `openrouter/${settings.aiModel}`,
      latency,
      usage: { ...usage, tps, ttft },
      finishReason: finishReason || undefined,
      requestedMaxTokens,
      toolResults: savedToolResults
    })

    return { content: accumulatedContent, model: `openrouter/${settings.aiModel}` }
  }


  /**
   * Main send message function
   */
  const sendMessage = useCallback(async (content: string, files: AttachedFile[]) => {
    // Debug: log received content
    console.log('[useStreamingChat] sendMessage called:', {
      contentLength: content.length,
      contentPreview: content.slice(0, 200) + (content.length > 200 ? '...' : ''),
      filesCount: files.length
    })

    if ((!content.trim() && files.length === 0) || isLoading) return

    clearToolState()
    setIsLoading(true)
    abortControllerRef.current = new AbortController()
    options.onStreamStart?.()

    let targetSessionId = currentSessionId
    let isNewSession = false

    const fileAttachments = files.map(f => ({
      id: f.id, name: f.name, type: f.type, size: f.size, data: f.data, mimeType: f.mimeType
    }))

    if (!targetSessionId) {
      targetSessionId = createSession(content)
      isNewSession = true
    } else {
      addMessageToSession(targetSessionId, {
        role: 'user',
        content,
        files: fileAttachments.length > 0 ? fileAttachments : undefined
      })
    }

    const startTime = performance.now()

    try {
      // Build conversation history
      const conversationHistory = messages.map(m => {
        const msg: any = { role: m.role, content: m.content }
        if (m.files?.length) msg.files = m.files
        return msg
      })

      // Research mode setup - FIXED
      // Deep research (deepResearchEnabled ON): 25 rounds, existing behavior
      // Normal web search (only webSearchEnabled ON): 5 rounds, planning required
      // Neither toggle ON: 0 rounds, no research mode started
      // Requirements: 2.1, 4.1, 5.1, 5.2, 5.3
      let researchMaxRounds = 0
      let researchMandatory = false
      const webSearchEnabledBySettings = (settings.enabledTools?.length ? settings.enabledTools.includes('web_search') : true)
        && (settings.webSearchEnabled || settings.deepResearchEnabled)
      const forceWebSearch = settings.modelProvider === 'openrouter' && canUseTools && webSearchEnabledBySettings && userRequestsWebSearch(content)

      if (settings.deepResearchEnabled && canUseTools) {
        // Deep research mode: 25 searches, existing behavior
        researchMaxRounds = 25
        researchMandatory = false
        startResearchMode(25, false)
      } else if (settings.webSearchEnabled && canUseTools && !forceWebSearch) {
        // Normal web search mode: 20 searches, planning required
        researchMaxRounds = 20
        researchMandatory = false
        startResearchMode(20, false)
      }
      // If neither toggle is ON, researchMaxRounds stays 0 and no research mode is started

      const forceWebSearchPrompt = forceWebSearch
        ? '\n\nUSER REQUEST: You must call the web_search tool at least once before answering. Use the user\'s latest request as the query if needed. Respond with the tool call first, then answer after results.'
        : ''
      const effectiveSystemPrompt = getEffectiveSystemPrompt(settings)
        + getResearchContext(0, researchMaxRounds, researchMandatory)
        + forceWebSearchPrompt
      const imageFiles = files.filter(f => f.type === 'image')
      const firstImage = imageFiles.length > 0 ? imageFiles[0].data : undefined
      const optimizedHistory = buildOptimizedContext(conversationHistory, content, effectiveSystemPrompt, settings.aiModel)

      // Create streaming message
      const streamingMessageId = addMessageToSession(targetSessionId!, {
        role: 'assistant',
        content: '',
        model: `${settings.modelProvider}/${settings.aiModel}`
      })

      let result: { content: string; model: string }

      if (settings.modelProvider === 'ollama') {
        result = await streamOllama(targetSessionId!, streamingMessageId, optimizedHistory, startTime, researchMaxRounds, researchMandatory)
      } else if (settings.modelProvider === 'perplexity') {
        result = await streamPerplexity(targetSessionId!, streamingMessageId, optimizedHistory, startTime)
      } else if (settings.modelProvider === 'gemini') {
        // Prepare Gemini messages with vision support
        let geminiMessages = [...optimizedHistory]
        if (firstImage) {
          const lastMessage = geminiMessages[geminiMessages.length - 1]
          if (lastMessage?.role === 'user') {
            const base64Image = firstImage.includes(',') ? firstImage.split(',')[1] : firstImage
            const mimeType = firstImage.match(/data:([^;]+)/)?.[1] || 'image/png'
            geminiMessages[geminiMessages.length - 1] = {
              role: 'user',
              parts: [
                { text: lastMessage.content || content },
                { inline_data: { mime_type: mimeType, data: base64Image } }
              ]
            } as any
          }
        }
        result = await streamGemini(targetSessionId!, streamingMessageId, geminiMessages, startTime)
      } else if (settings.modelProvider === 'groq') {
        result = await streamGroq(targetSessionId!, streamingMessageId, optimizedHistory, startTime, researchMaxRounds, researchMandatory)
      } else if (settings.modelProvider === 'minimax') {
        result = await streamMiniMax(targetSessionId!, streamingMessageId, optimizedHistory, startTime, researchMaxRounds, researchMandatory)
      } else {
        // OpenRouter (default)
        let openRouterMessages = [...optimizedHistory]
        if (firstImage) {
          const lastMessage = openRouterMessages[openRouterMessages.length - 1]
          if (lastMessage?.role === 'user') {
            openRouterMessages[openRouterMessages.length - 1] = {
              role: 'user',
              content: [
                { type: 'text', text: lastMessage.content || content },
                { type: 'image_url', image_url: { url: firstImage } }
              ]
            } as any
          }
        }
        result = await streamOpenRouter(targetSessionId!, streamingMessageId, openRouterMessages, startTime, researchMaxRounds, researchMandatory, forceWebSearch)
      }

      setIsLoading(false)
      clearToolState()
      options.onStreamEnd?.()
      options.onMessageSent?.()

      // Generate title for new sessions
      if (isNewSession && targetSessionId) {
        generateChatTitle(content, settings).then(title => {
          if (title) updateSessionTitle(targetSessionId!, title)
        }).catch(console.error)
      }

    } catch (error: any) {
      // Silently handle abort (user clicked stop)
      if (error.name === 'AbortError' || abortControllerRef.current === null) {
        // Stream was aborted by user - loading state already cleared by stopStreaming
        return
      }

      setIsLoading(false)
      let errorMsg = 'An unexpected error occurred.'

      if (error.message?.includes('429') || error.message?.includes('rate limit')) {
        errorMsg = 'Rate limit exceeded. Please slow down and try again in a moment.'
        showToast(errorMsg, 'warning')
      } else if (error.message?.includes('401') || error.message?.includes('403')) {
        errorMsg = 'Invalid API key. Please check your API key in Settings.'
        showToast(errorMsg, 'error')
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMsg = 'Network error. Please check your internet connection.'
        showToast(errorMsg, 'error')
      } else {
        errorMsg = `Error: ${error.message || 'Unknown error'}`
        showToast(errorMsg, 'error')
      }

      addMessageToSession(targetSessionId!, { role: 'assistant', content: errorMsg })
      clearToolState()
      options.onStreamEnd?.()
    }
  }, [
    isLoading, currentSessionId, messages, settings, canUseTools,
    createSession, addMessageToSession, updateStreamingMessage, updateSessionTitle,
    clearToolState, startResearchMode, getResearchContext, getToolsForRequest, handleToolCalls,
    showToast, options
  ])

  /**
   * Regenerate a message with different instructions
   */
  const regenerateMessage = useCallback(async (message: any, instruction: string) => {
    if (!currentSessionId || isLoading) return

    // Handle switch_model instruction
    if (instruction === 'switch_model') {
      const models = getModelOptions()
      const currentModelIndex = models.findIndex(m => m.id === settings.aiModel)
      const nextModel = models[(currentModelIndex + 1) % models.length]
      updateSettings({ aiModel: nextModel.id })
    }

    const versions = message.responseVersions || []
    versions.push({
      id: message.id,
      content: message.content,
      timestamp: message.timestamp,
      instruction: message.instruction,
      model: message.model
    })

    clearToolState()
    setIsLoading(true)
    abortControllerRef.current = new AbortController()

    try {
      const session = sessions.find(s => s.id === currentSessionId)
      if (!session) {
        showToast('Session not found', 'error')
        setIsLoading(false)
        return
      }

      const messageIndex = session.messages.findIndex(m => m.id === message.id)
      if (messageIndex <= 0) {
        showToast('Cannot regenerate - no user message found', 'error')
        setIsLoading(false)
        return
      }

      const userMessage = session.messages[messageIndex - 1]
      // Get conversation history BEFORE the user message being regenerated
      // We exclude the user message because we'll add it back with the instruction appended
      const conversationHistory = session.messages.slice(0, messageIndex - 1)

      let systemPrompt = getEffectiveSystemPrompt(settings)
      let userContent = userMessage.content

      if (instruction === 'concise') {
        userContent += '\n\nPlease provide a more concise response.'
      } else if (instruction === 'detailed') {
        userContent += '\n\nPlease provide more details and expand on your response.'
      } else if (instruction && instruction.trim()) {
        // Handle custom instructions - append the user's instruction directly
        userContent += `\n\n[Regenerate Instruction]: ${instruction}`
      }

      deleteMessageFromSession(currentSessionId, message.id)
      options.onRegenerateStart?.()

      const streamingMessageId = addMessageToSession(currentSessionId, {
        role: 'assistant',
        content: '',
        model: `openrouter/${settings.aiModel}`,
        responseVersions: versions,
        currentVersionIndex: versions.length
      })

      let accumulatedContent = ''
      let accumulatedReasoning = ''

      // Build context with the modified user content (including instruction)
      // conversationHistory contains all messages before the user message
      // userContent is the modified user message with instruction appended
      const apiMessages = buildOptimizedContext(conversationHistory, userContent, systemPrompt, settings.aiModel)

      try {
        if (settings.modelProvider === 'ollama') {
          for await (const chunk of streamOllamaCompletion(settings.ollamaUrl, settings.aiModel, apiMessages, { signal: abortControllerRef.current?.signal })) {
            const delta = chunk.message?.content || ''
            accumulatedContent += delta
            updateStreamingMessage(currentSessionId, streamingMessageId, { content: accumulatedContent })
          }
        } else if (settings.modelProvider === 'perplexity') {
          for await (const chunk of streamPerplexityCompletion(settings.perplexityApiKey, settings.aiModel, apiMessages, { signal: abortControllerRef.current?.signal })) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            accumulatedContent += delta
            updateStreamingMessage(currentSessionId, streamingMessageId, { content: accumulatedContent })
          }
        } else if (settings.modelProvider === 'gemini') {
          for await (const chunk of streamGeminiCompletion(settings.geminiApiKey, settings.aiModel, apiMessages, { signal: abortControllerRef.current?.signal })) {
            const delta = chunk.candidates?.[0]?.content?.parts?.[0]?.text || ''
            accumulatedContent += delta
            updateStreamingMessage(currentSessionId, streamingMessageId, { content: accumulatedContent })
          }
        } else if (settings.modelProvider === 'groq') {
          for await (const chunk of streamGroqCompletion(settings.groqApiKey, settings.aiModel, apiMessages, { signal: abortControllerRef.current?.signal })) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            accumulatedContent += delta
            updateStreamingMessage(currentSessionId, streamingMessageId, { content: accumulatedContent })
          }
        } else if (settings.modelProvider === 'minimax') {
          const reasoningAccumulator = new ReasoningAccumulator()
          for await (const chunk of streamMiniMaxCompletion(settings.minimaxApiKey, settings.aiModel, apiMessages, {
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            signal: abortControllerRef.current?.signal
          })) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            const reasoningDetails = extractReasoningFromChunk(chunk)
            if (reasoningDetails && reasoningDetails.length > 0) {
              reasoningAccumulator.accumulate(reasoningDetails)
              accumulatedReasoning = reasoningAccumulator.getReasoning()
            }
            if (delta) accumulatedContent += delta
            updateStreamingMessage(currentSessionId, streamingMessageId, {
              content: accumulatedContent,
              thinking: accumulatedReasoning || undefined
            })
          }
        } else {
          for await (const chunk of streamOpenRouterCompletion(
            settings.openRouterApiKey, settings.aiModel, apiMessages,
            { temperature: settings.temperature, maxTokens: settings.maxTokens, signal: abortControllerRef.current?.signal }
          )) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning || ''
            if (reasoningDelta) accumulatedReasoning += reasoningDelta
            if (delta) accumulatedContent += delta
            updateStreamingMessage(currentSessionId, streamingMessageId, {
              content: accumulatedContent,
              thinking: accumulatedReasoning || undefined
            })
          }
        }

        updateStreamingMessage(currentSessionId, streamingMessageId, {
          content: accumulatedContent,
          thinking: accumulatedReasoning || undefined
        })
        setIsLoading(false)

      } catch (streamError: any) {
        // Silently handle abort (user clicked stop)
        if (streamError.name === 'AbortError' || abortControllerRef.current === null) {
          return
        }
        deleteMessageFromSession(currentSessionId, streamingMessageId)
        addMessageToSession(currentSessionId, {
          role: 'assistant',
          content: message.content,
          model: message.model,
          thinking: message.thinking,
          responseVersions: message.responseVersions,
          currentVersionIndex: message.currentVersionIndex
        })
        showToast(streamError.message || 'Failed to regenerate', 'error')
        setIsLoading(false)
      }

    } catch (error: any) {
      // Silently handle abort (user clicked stop)
      if (error.name === 'AbortError' || abortControllerRef.current === null) {
        return
      }
      showToast(error.message || 'Failed to regenerate', 'error')
      setIsLoading(false)
    }
  }, [
    currentSessionId, isLoading, sessions, settings,
    addMessageToSession, updateStreamingMessage, deleteMessageFromSession,
    clearToolState, showToast, updateSettings
  ])

  /**
   * Get available models for switching
   */
  const getModelOptions = (): Array<{ id: string; displayName: string }> => {
    const allModels: Array<{ id: string; displayName: string }> = []

    if (settings.configuredModels) {
      settings.configuredModels.forEach(m => allModels.push({ id: m.code, displayName: m.displayName }))
    }
    if (settings.ollamaModels) {
      settings.ollamaModels.forEach(m => allModels.push({ id: m.code, displayName: m.displayName }))
    }
    if (settings.perplexityModels) {
      settings.perplexityModels.forEach(m => allModels.push({ id: `perplexity/${m.code}`, displayName: m.displayName }))
    }
    if (settings.geminiModels) {
      settings.geminiModels.forEach(m => allModels.push({ id: m.code, displayName: m.displayName }))
    }
    if (settings.groqModels) {
      settings.groqModels.forEach(m => allModels.push({ id: m.code, displayName: m.displayName }))
    }
    if (settings.minimaxModels) {
      settings.minimaxModels.forEach(m => allModels.push({ id: m.code, displayName: m.displayName }))
    }

    return allModels
  }

  return {
    isLoading,
    sendMessage,
    regenerateMessage,
    stopStreaming
  }
}

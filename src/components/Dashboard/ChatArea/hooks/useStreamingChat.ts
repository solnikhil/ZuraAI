/**
 * useStreamingChat - Custom hook for handling chat streaming logic
 * Composes provider-specific streaming hooks for cleaner architecture.
 * 
 * Requirements: 1.1, 7.1, 7.2, 7.3
 * Requirements: 3.2 - Throttle updateStreamingMessage calls to a maximum of 8 per second
 * Requirements: 5.3 - Isolated streaming updates
 * Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
 * 
 * **Validates: Property 22: Isolated Streaming Updates**
 * - Uses StreamingContext for isolated streaming updates during streaming
 * - Only commits final content to the session when streaming completes
 */

import { useState, useCallback, useRef, useMemo } from 'react'
import { useChatHistory, type Message } from '../../../../contexts/ChatHistoryContext'
import { useStreamingActions, type StreamingMessageState } from '../../../../contexts/StreamingContext'
import { useSettings } from '../../../../contexts/SettingsContext'
import { useToast } from '../../../shared/Toast'
import { generateChatTitle } from '../../../../services/titleGenerator'
import { buildOptimizedContext } from '../../../../utils/tokenUtils'
import { getEffectiveSystemPrompt } from '../../../../utils/promptSelection'
import { StreamingThrottler } from '../../../../utils/streamingThrottler'
import { getOpenRouterApiKey } from '../../../../utils/openRouterKey'
import type { AttachedFile } from '../FileUploadHandler'

// Import provider-specific streaming hooks
import {
  useOllamaStreaming,
  usePerplexityStreaming,
  useGroqStreaming,
  useOpenRouterStreaming,
  useNvidiaStreaming,
  useAlibabaStreaming,
  useStreamingToolCalls,
  useResearchMode,
  type StreamingSettings,
  type ToolCallingHook,
} from './streaming'

// Import streaming services for regenerate (simplified streaming without full hook)
import { streamOllamaCompletion } from '../../../../services/ollama'
import { streamPerplexityCompletion } from '../../../../services/perplexity'
import { streamGroqCompletion } from '../../../../services/groq'
import { streamNvidiaCompletion } from '../../../../services/nvidia'
import { streamAlibabaCompletion } from '../../../../services/alibaba'
import { streamOpenRouterCompletion } from '../../../../services/openrouter'

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

export function useStreamingChat(options: UseStreamingChatOptions = {}): UseStreamingChatReturn {
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Streaming throttler instance - limits updates to 8/second per Requirements 3.2
  const throttlerRef = useRef<StreamingThrottler | null>(null)
  if (!throttlerRef.current) {
    throttlerRef.current = new StreamingThrottler({ maxUpdatesPerSecond: 8 })
  }

  const {
    sessions,
    currentSessionId,
    addMessageToSession,
    updateStreamingMessage,
    createSession,
    updateSessionTitle,
    deleteMessageFromSession
  } = useChatHistory()

  // Isolated streaming context for Property 22: Isolated Streaming Updates
  // **Validates: Requirements 5.3**
  const {
    startStreaming,
    updateStreaming,
    completeStreaming,
    cancelStreaming,
  } = useStreamingActions()

  const buildFinalStreamingUpdates = useCallback((finalState: StreamingMessageState): Partial<Message> => {
    const updates: Partial<Message> = {
      content: finalState.content,
    }

    if (finalState.thinking !== undefined) updates.thinking = finalState.thinking
    if (finalState.thinkingDuration !== undefined) updates.thinkingDuration = finalState.thinkingDuration
    if (finalState.thinkingBlocks !== undefined) updates.thinkingBlocks = finalState.thinkingBlocks
    if (finalState.researchStatus !== undefined) updates.researchStatus = finalState.researchStatus
    if (finalState.researchPlan !== undefined) updates.researchPlan = finalState.researchPlan
    if (finalState.researchProgress !== undefined) updates.researchProgress = finalState.researchProgress
    if (finalState.toolResults !== undefined) updates.toolResults = finalState.toolResults
    if (finalState.model !== undefined) updates.model = finalState.model
    if (finalState.latency !== undefined) updates.latency = finalState.latency
    if (finalState.usage !== undefined) updates.usage = finalState.usage

    return updates
  }, [])

  // Track current streaming message for isolated updates
  const streamingMessageRef = useRef<{ sessionId: string; messageId: string } | null>(null)

  const { settings, updateSettings } = useSettings()
  const { showToast } = useToast()

  const currentSession = sessions.find(s => s.id === currentSessionId)
  const messages = currentSession?.messages || []

  // Create throttled update function that uses isolated streaming context
  // **Validates: Property 22: Isolated Streaming Updates**
  const throttledUpdateStreamingMessage = useCallback(
    (sessionId: string, messageId: string, updates: Partial<Message>) => {
      // Use isolated streaming context for updates during streaming
      if (streamingMessageRef.current?.sessionId === sessionId && 
          streamingMessageRef.current?.messageId === messageId) {
        // Update isolated streaming context (doesn't trigger message list re-render)
        if (throttlerRef.current) {
          throttlerRef.current.throttle(sessionId, messageId, updates, (_sid, _mid, upd) => {
            updateStreaming(upd)
          })
        } else {
          updateStreaming(updates)
        }
      } else {
        // Fallback to direct update for non-streaming messages
        if (throttlerRef.current) {
          throttlerRef.current.throttle(sessionId, messageId, updates, updateStreamingMessage)
        } else {
          updateStreamingMessage(sessionId, messageId, updates)
        }
      }
    },
    [updateStreamingMessage, updateStreaming]
  )

  // Flush any pending throttled updates - ensures final update is always applied
  const flushThrottledUpdates = useCallback(() => {
    if (throttlerRef.current) {
      // Flush to the isolated streaming context
      throttlerRef.current.flush((sid, mid, upd) => {
        if (streamingMessageRef.current?.sessionId === sid && 
            streamingMessageRef.current?.messageId === mid) {
          updateStreaming(upd)
        } else {
          updateStreamingMessage(sid, mid, upd)
        }
      })
    }
  }, [updateStreamingMessage, updateStreaming])

  // Convert settings to StreamingSettings type for hooks
  const streamingSettings: StreamingSettings = useMemo(() => ({
    aiModel: settings.aiModel,
    modelProvider: settings.modelProvider,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    streamResponses: settings.streamResponses,
    webSearchPrompt: settings.webSearchPrompt,
    ollamaUrl: settings.ollamaUrl,
    openRouterApiKey: settings.openRouterApiKey,
    perplexityApiKey: settings.perplexityApiKey,
    groqApiKey: settings.groqApiKey,
    nvidiaApiKey: settings.nvidiaApiKey,
    alibabaApiKey: settings.alibabaApiKey,
  }), [settings])

  // Use the streaming tool calls hook
  // Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
  const {
    canUseTools,
    getToolsForRequest,
    handleToolCalls,
    clearToolState,
    startResearchMode,
    getResearchContext,
  } = useStreamingToolCalls({ settings: streamingSettings })

  // Create tool calling hook interface for provider hooks
  const toolCalling: ToolCallingHook = useMemo(() => ({
    canUseTools,
    getToolsForRequest,
    handleToolCalls,
    getResearchContext,
  }), [canUseTools, getToolsForRequest, handleToolCalls, getResearchContext])

  // Use the research mode hook
  // Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
  const {
    calculateResearchConfig,
  } = useResearchMode({ canUseTools })

  // Initialize provider-specific streaming hooks
  // Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
  const { streamOllama } = useOllamaStreaming({
    settings: streamingSettings,
    toolCalling,
    updateStreamingMessage,
    flushThrottledUpdates,
    throttledUpdateStreamingMessage,
  })

  const { streamPerplexity } = usePerplexityStreaming({
    settings: streamingSettings,
    updateStreamingMessage,
    flushThrottledUpdates,
    throttledUpdateStreamingMessage,
  })

  const { streamGroq } = useGroqStreaming({
    settings: streamingSettings,
    toolCalling,
    updateStreamingMessage,
    flushThrottledUpdates,
    throttledUpdateStreamingMessage,
  })

  const { streamOpenRouter } = useOpenRouterStreaming({
    settings: streamingSettings,
    toolCalling,
    updateStreamingMessage,
    flushThrottledUpdates,
    throttledUpdateStreamingMessage,
  })

  const { streamNvidia } = useNvidiaStreaming({
    settings: streamingSettings,
    toolCalling,
    updateStreamingMessage,
    flushThrottledUpdates,
    throttledUpdateStreamingMessage,
  })

  const { streamAlibaba } = useAlibabaStreaming({
    settings: streamingSettings,
    toolCalling,
    updateStreamingMessage,
    flushThrottledUpdates,
    throttledUpdateStreamingMessage,
  })

  const stopStreaming = useCallback(() => {
    // Flush any pending throttled updates before stopping
    flushThrottledUpdates()
    
    // Commit any pending streaming content to the session
    // **Validates: Property 22: Isolated Streaming Updates**
    if (streamingMessageRef.current) {
      const finalState = completeStreaming()
      if (finalState.sessionId && finalState.messageId && finalState.content) {
        // Commit final content to the session
        updateStreamingMessage(finalState.sessionId, finalState.messageId, buildFinalStreamingUpdates(finalState))
      }
      streamingMessageRef.current = null
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsLoading(false)
    clearToolState()
    options.onStreamEnd?.()
  }, [clearToolState, options, flushThrottledUpdates, completeStreaming, updateStreamingMessage, buildFinalStreamingUpdates])

  /**
   * Main send message function
   * Uses composed provider-specific streaming hooks
   */
  const sendMessage = useCallback(async (content: string, files: AttachedFile[]) => {
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

      // Research mode setup - single web search toggle, model-driven depth, no caps
      const researchConfig = calculateResearchConfig({
        webSearchEnabled: settings.webSearchEnabled,
        structuredResearchEnabled: settings.structuredResearchEnabled,
        modelProvider: settings.modelProvider,
        enabledTools: settings.enabledTools,
      }, content)

      let researchMaxRounds = researchConfig.maxRounds
      let researchMandatory = researchConfig.mandatory
      const forceWebSearch = researchConfig.forceWebSearch

      // Start research mode when web search is enabled (maxRounds >= 0)
      if (researchMaxRounds >= 0 && canUseTools) {
        startResearchMode(researchMaxRounds, researchMandatory, forceWebSearch)
      }

      const planFirstInstruction =
        settings.structuredResearchEnabled && settings.webSearchEnabled && canUseTools
          ? `\n\nBefore searching, call the research_plan tool with your planned steps (2-6 searches). Do not call web_search directly. We will execute your plan and return combined results.\n\n`
          : ''
      const effectiveSystemPrompt = getEffectiveSystemPrompt(settings)
        + planFirstInstruction
        + getResearchContext(0, researchMaxRounds, researchMandatory)
      const imageFiles = files.filter(f => f.type === 'image')
      const firstImage = imageFiles.length > 0 ? imageFiles[0].data : undefined
      const optimizedHistory = buildOptimizedContext(conversationHistory, content, effectiveSystemPrompt, settings.aiModel)

      // Create streaming message
      const streamingMessageId = addMessageToSession(targetSessionId!, {
        role: 'assistant',
        content: '',
        model: `${settings.modelProvider}/${settings.aiModel}`
      })

      // Start isolated streaming for Property 22: Isolated Streaming Updates
      // **Validates: Requirements 5.3**
      streamingMessageRef.current = { sessionId: targetSessionId!, messageId: streamingMessageId }
      startStreaming(targetSessionId!, streamingMessageId)

      // Validate API key before sending
      const isOpenRouter = settings.modelProvider === 'openrouter' ||
        !['ollama', 'perplexity', 'groq', 'nvidia', 'alibaba'].includes(settings.modelProvider)
      const isNvidia = settings.modelProvider === 'nvidia'
      const isAlibaba = settings.modelProvider === 'alibaba'
      if (isNvidia && !settings.nvidiaApiKey?.trim()) {
        deleteMessageFromSession(targetSessionId!, streamingMessageId)
        streamingMessageRef.current = null
        setIsLoading(false)
        showToast('NVIDIA API key is required. Add it in Settings > Providers and save.', 'error')
        return
      }
      if (isAlibaba && !settings.alibabaApiKey?.trim()) {
        deleteMessageFromSession(targetSessionId!, streamingMessageId)
        streamingMessageRef.current = null
        setIsLoading(false)
        showToast('Alibaba API key is required. Add it in Settings > Providers and save.', 'error')
        return
      }
      if (isOpenRouter && !getOpenRouterApiKey(settings.openRouterApiKey)) {
        deleteMessageFromSession(targetSessionId!, streamingMessageId)
        streamingMessageRef.current = null
        setIsLoading(false)
        showToast('OpenRouter API key is required. Add it in Settings > Providers and save.', 'error')
        return
      }

      // Use composed provider-specific streaming hooks
      // Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
      if (settings.modelProvider === 'ollama') {
        await streamOllama({
          sessionId: targetSessionId!,
          messageId: streamingMessageId,
          messages: optimizedHistory,
          startTime,
          researchMaxRounds,
          researchMandatory,
          signal: abortControllerRef.current?.signal,
        })
      } else if (settings.modelProvider === 'perplexity') {
        await streamPerplexity({
          sessionId: targetSessionId!,
          messageId: streamingMessageId,
          messages: optimizedHistory,
          startTime,
          signal: abortControllerRef.current?.signal,
        })
      } else if (settings.modelProvider === 'groq') {
        await streamGroq({
          sessionId: targetSessionId!,
          messageId: streamingMessageId,
          messages: optimizedHistory,
          startTime,
          researchMaxRounds,
          researchMandatory,
          signal: abortControllerRef.current?.signal,
        })
      } else if (settings.modelProvider === 'nvidia') {
        await streamNvidia({
          sessionId: targetSessionId!,
          messageId: streamingMessageId,
          messages: optimizedHistory,
          startTime,
          researchMaxRounds,
          researchMandatory,
          signal: abortControllerRef.current?.signal,
        })
      } else if (settings.modelProvider === 'alibaba') {
        await streamAlibaba({
          sessionId: targetSessionId!,
          messageId: streamingMessageId,
          messages: optimizedHistory,
          startTime,
          researchMaxRounds,
          researchMandatory,
          signal: abortControllerRef.current?.signal,
        })
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
        await streamOpenRouter({
          sessionId: targetSessionId!,
          messageId: streamingMessageId,
          messages: openRouterMessages,
          startTime,
          researchMaxRounds,
          researchMandatory,
          forceWebSearch,
          signal: abortControllerRef.current?.signal,
        })
      }

      // Commit streaming content to the session
      // **Validates: Property 22: Isolated Streaming Updates**
      if (streamingMessageRef.current) {
        const finalState = completeStreaming()
        // Explicitly commit the captured streaming state to ChatHistoryContext.
        // The provider hooks call updateStreamingMessage too, but that setState
        // may still be batched/pending when completeStreaming() resets the
        // ephemeral StreamingContext, causing the content to vanish on re-render.
        if (finalState.sessionId && finalState.messageId && finalState.content) {
          updateStreamingMessage(finalState.sessionId, finalState.messageId, buildFinalStreamingUpdates(finalState))
        }
        streamingMessageRef.current = null
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

      // Cancel isolated streaming on error
      if (streamingMessageRef.current) {
        cancelStreaming()
        streamingMessageRef.current = null
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
      } else if (error.message?.includes('API Key') || error.message?.includes('missing')) {
        errorMsg = 'OpenRouter API key is required. Add it in Settings > Providers and click Save.'
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
    deleteMessageFromSession, clearToolState, startResearchMode, getResearchContext, calculateResearchConfig,
    showToast, options, startStreaming, completeStreaming, cancelStreaming,
    streamOllama, streamPerplexity, streamGroq, streamNvidia, streamAlibaba, streamOpenRouter,
    buildFinalStreamingUpdates,
  ])

  /**
   * Regenerate a message with different instructions
   * Note: This uses direct streaming for simplicity, not the composed hooks
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
      const conversationHistory = session.messages.slice(0, messageIndex - 1)

      let systemPrompt = getEffectiveSystemPrompt(settings)
      let userContent = userMessage.content

      if (instruction === 'concise') {
        userContent += '\n\nPlease provide a more concise response.'
      } else if (instruction === 'detailed') {
        userContent += '\n\nPlease provide more details and expand on your response.'
      } else if (instruction && instruction.trim()) {
        userContent += `\n\n[Regenerate Instruction]: ${instruction}`
      }

      deleteMessageFromSession(currentSessionId, message.id)
      options.onRegenerateStart?.()

      const streamingMessageId = addMessageToSession(currentSessionId, {
        role: 'assistant',
        content: '',
        model: `${settings.modelProvider}/${settings.aiModel}`,
        responseVersions: versions,
        currentVersionIndex: versions.length
      })

      let accumulatedContent = ''
      let accumulatedReasoning = ''

      const apiMessages = buildOptimizedContext(conversationHistory, userContent, systemPrompt, settings.aiModel)

      try {
        if (settings.modelProvider === 'ollama') {
          for await (const chunk of streamOllamaCompletion(settings.ollamaUrl, settings.aiModel, apiMessages, { think: true, signal: abortControllerRef.current?.signal })) {
            const thinkingDelta = chunk.message?.thinking || ''
            const delta = chunk.message?.content || ''
            if (thinkingDelta) accumulatedReasoning += thinkingDelta
            accumulatedContent += delta
            updateStreamingMessage(currentSessionId, streamingMessageId, {
              content: accumulatedContent,
              thinking: accumulatedReasoning || undefined
            })
          }
        } else if (settings.modelProvider === 'perplexity') {
          for await (const chunk of streamPerplexityCompletion(settings.perplexityApiKey, settings.aiModel, apiMessages, { signal: abortControllerRef.current?.signal })) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            accumulatedContent += delta
            updateStreamingMessage(currentSessionId, streamingMessageId, { content: accumulatedContent })
          }
        } else if (settings.modelProvider === 'groq') {
          for await (const chunk of streamGroqCompletion(settings.groqApiKey, settings.aiModel, apiMessages, { signal: abortControllerRef.current?.signal })) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            accumulatedContent += delta
            updateStreamingMessage(currentSessionId, streamingMessageId, { content: accumulatedContent })
          }
        } else if (settings.modelProvider === 'nvidia') {
          for await (const chunk of streamNvidiaCompletion(settings.nvidiaApiKey, settings.aiModel, apiMessages, { signal: abortControllerRef.current?.signal })) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            accumulatedContent += delta
            updateStreamingMessage(currentSessionId, streamingMessageId, { content: accumulatedContent })
          }
        } else if (settings.modelProvider === 'alibaba') {
          for await (const chunk of streamAlibabaCompletion(settings.alibabaApiKey, settings.aiModel, apiMessages, { signal: abortControllerRef.current?.signal })) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            accumulatedContent += delta
            updateStreamingMessage(currentSessionId, streamingMessageId, { content: accumulatedContent })
          }
        } else {
          for await (const chunk of streamOpenRouterCompletion(
            getOpenRouterApiKey(settings.openRouterApiKey), settings.aiModel, apiMessages,
            { temperature: settings.temperature, signal: abortControllerRef.current?.signal }
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
    if (settings.groqModels) {
      settings.groqModels.forEach(m => allModels.push({ id: m.code, displayName: m.displayName }))
    }
    if (settings.nvidiaModels) {
      settings.nvidiaModels.forEach(m => allModels.push({ id: m.code, displayName: m.displayName }))
    }
    if (settings.alibabaModels) {
      settings.alibabaModels.forEach(m => allModels.push({ id: m.code, displayName: m.displayName }))
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

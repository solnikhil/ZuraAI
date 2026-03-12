/**
 * Orchestrates provider streaming, tool execution, and final message commits.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useChatHistory, type Message } from '../../../../contexts/ChatHistoryContext'
import {
  useStreamingActions,
  type StreamingMessageState,
} from '../../../../contexts/StreamingContext'
import { useSettings } from '../../../../contexts/SettingsContext'
import { useToast } from '../../../shared/Toast'
import type { ToolCallState } from '../../../../hooks/useToolCalling'
import { generateChatTitle } from '../../../../services/titleGenerator'
import { buildOptimizedContext } from '../../../../utils/tokenUtils'
import { getEffectiveSystemPrompt } from '../../../../utils/promptSelection'
import { StreamingThrottler } from '../../../../utils/streamingThrottler'
import { getOpenRouterApiKey } from '../../../../utils/openRouterKey'
import { getWebResearchMode, isWebResearchEnabled } from '@/skills'
import {
  buildProviderMessages,
  canAnalyzeImageAttachments,
  isImageAttachment,
  type AttachedFile,
  type ConversationMessage,
} from '../attachmentUtils'

import {
  useOllamaStreaming,
  usePerplexityStreaming,
  useGroqStreaming,
  useOpenRouterStreaming,
  useAlibabaStreaming,
  useStreamingToolCalls,
  useResearchMode,
  type StreamingSettings,
  type ToolCallingHook,
} from './streaming'

import { streamOllamaCompletion } from '../../../../services/ollama'
import { streamPerplexityCompletion } from '../../../../services/perplexity'
import { streamGroqCompletion } from '../../../../services/groq'
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
  toolState: ToolCallState
  sendMessage: (content: string, files: AttachedFile[]) => Promise<void>
  regenerateMessage: (message: any, instruction: string) => Promise<void>
  stopStreaming: () => void
}

function hasImageAttachments(files?: AttachedFile[]) {
  return (files || []).some(isImageAttachment)
}

function toConversationMessages(
  messages: Array<{ role: string; content: string; files?: AttachedFile[] }>
): ConversationMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    files: message.files,
  }))
}

export function useStreamingChat(options: UseStreamingChatOptions = {}): UseStreamingChatReturn {
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Throttle partial updates so long responses do not repaint the message list on every token.
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
    deleteMessageFromSession,
  } = useChatHistory()

  // Keep in-flight content in the isolated streaming store until the response finishes.
  const { startStreaming, updateStreaming, completeStreaming, cancelStreaming } =
    useStreamingActions()

  const buildFinalStreamingUpdates = useCallback(
    (finalState: StreamingMessageState): Partial<Message> => {
      const updates: Partial<Message> = {
        content: finalState.content,
      }

      if (finalState.thinking !== undefined) updates.thinking = finalState.thinking
      if (finalState.thinkingDuration !== undefined)
        updates.thinkingDuration = finalState.thinkingDuration
      if (finalState.thinkingBlocks !== undefined)
        updates.thinkingBlocks = finalState.thinkingBlocks
      if (finalState.researchStatus !== undefined)
        updates.researchStatus = finalState.researchStatus
      if (finalState.researchPlan !== undefined) updates.researchPlan = finalState.researchPlan
      if (finalState.researchProgress !== undefined)
        updates.researchProgress = finalState.researchProgress
      if (finalState.toolResults !== undefined) updates.toolResults = finalState.toolResults
      if (finalState.model !== undefined) updates.model = finalState.model
      if (finalState.latency !== undefined) updates.latency = finalState.latency
      if (finalState.usage !== undefined) updates.usage = finalState.usage

      return updates
    },
    []
  )

  // Track current streaming message for isolated updates
  const streamingMessageRef = useRef<{ sessionId: string; messageId: string } | null>(null)
  const titleRevealIntervalRef = useRef<Map<string, number>>(new Map())

  const { settings, updateSettings } = useSettings()
  const { showToast } = useToast()

  const clearTitleRevealInterval = useCallback((sessionId: string) => {
    const timerId = titleRevealIntervalRef.current.get(sessionId)
    if (timerId !== undefined) {
      window.clearInterval(timerId)
      titleRevealIntervalRef.current.delete(sessionId)
    }
  }, [])

  const applyGeneratedSessionTitle = useCallback(
    (sessionId: string, generatedTitle: string) => {
      const normalizedTitle = generatedTitle.trim()
      if (!normalizedTitle) return

      clearTitleRevealInterval(sessionId)

      if (settings.titleGenerationDisplayMode !== 'typewriter') {
        updateSessionTitle(sessionId, normalizedTitle)
        return
      }

      let visibleLength = 1
      updateSessionTitle(sessionId, normalizedTitle.slice(0, visibleLength))
      const intervalId = window.setInterval(() => {
        visibleLength += 1
        updateSessionTitle(sessionId, normalizedTitle.slice(0, visibleLength))
        if (visibleLength >= normalizedTitle.length) {
          clearTitleRevealInterval(sessionId)
        }
      }, 24)

      titleRevealIntervalRef.current.set(sessionId, intervalId)
    },
    [clearTitleRevealInterval, settings.titleGenerationDisplayMode, updateSessionTitle]
  )

  useEffect(() => {
    return () => {
      for (const timerId of titleRevealIntervalRef.current.values()) {
        window.clearInterval(timerId)
      }
      titleRevealIntervalRef.current.clear()
    }
  }, [])

  const currentSession = sessions.find((s) => s.id === currentSessionId)
  const messages = currentSession?.messages || []

  // Create throttled update function that uses isolated streaming context
  const throttledUpdateStreamingMessage = useCallback(
    (sessionId: string, messageId: string, updates: Partial<Message>) => {
      // Use isolated streaming context for updates during streaming
      if (
        streamingMessageRef.current?.sessionId === sessionId &&
        streamingMessageRef.current?.messageId === messageId
      ) {
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
        if (
          streamingMessageRef.current?.sessionId === sid &&
          streamingMessageRef.current?.messageId === mid
        ) {
          updateStreaming(upd)
        } else {
          updateStreamingMessage(sid, mid, upd)
        }
      })
    }
  }, [updateStreamingMessage, updateStreaming])

  // Convert settings to StreamingSettings type for hooks
  const streamingSettings: StreamingSettings = useMemo(
    () => ({
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
      alibabaApiKey: settings.alibabaApiKey,
    }),
    [settings]
  )

  const {
    canUseTools,
    getToolsForRequest,
    handleToolCalls,
    toolState,
    clearToolState,
    startResearchMode,
    getResearchContext,
  } = useStreamingToolCalls({ settings: streamingSettings })

  // Create tool calling hook interface for provider hooks
  const toolCalling: ToolCallingHook = useMemo(
    () => ({
      canUseTools,
      getToolsForRequest,
      handleToolCalls,
      getResearchContext,
    }),
    [canUseTools, getToolsForRequest, handleToolCalls, getResearchContext]
  )

  const { calculateResearchConfig } = useResearchMode({ canUseTools })

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
    if (streamingMessageRef.current) {
      const finalState = completeStreaming()
      if (finalState.sessionId && finalState.messageId && finalState.content) {
        // Commit final content to the session
        updateStreamingMessage(
          finalState.sessionId,
          finalState.messageId,
          buildFinalStreamingUpdates(finalState)
        )
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
  }, [
    clearToolState,
    options,
    flushThrottledUpdates,
    completeStreaming,
    updateStreamingMessage,
    buildFinalStreamingUpdates,
  ])

  /**
   * Main send message function
   * Uses composed provider-specific streaming hooks
   */
  const sendMessage = useCallback(
    async (content: string, files: AttachedFile[]) => {
      if ((!content.trim() && files.length === 0) || isLoading) return

      clearToolState()
      setIsLoading(true)
      abortControllerRef.current = new AbortController()
      options.onStreamStart?.()

      let targetSessionId = currentSessionId
      let isNewSession = false

      const fileAttachments = files.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        data: f.data,
        mimeType: f.mimeType,
      }))
      const outboundUserMessage = {
        role: 'user' as const,
        content,
        files: fileAttachments.length > 0 ? fileAttachments : undefined,
      }

      if (hasImageAttachments(fileAttachments) && !canAnalyzeImageAttachments(settings)) {
        setIsLoading(false)
        showToast(
          'Current model cannot analyze attached images. Switch to a vision-capable model or remove the images.',
          'warning'
        )
        return
      }

      if (!targetSessionId) {
        targetSessionId = createSession()
        isNewSession = true
      }

      addMessageToSession(targetSessionId, outboundUserMessage)

      const startTime = performance.now()

      try {
        // Build conversation history
        const conversationHistory = toConversationMessages(
          messages.map((message) => ({
            role: message.role,
            content: message.content,
            files: message.files as AttachedFile[] | undefined,
          }))
        )

        // Research mode setup - skills-driven web research, model-driven depth, no caps
        const researchConfig = calculateResearchConfig(
          {
            skills: settings.skills,
            modelProvider: settings.modelProvider,
            enabledTools: settings.enabledTools,
          },
          content
        )

        let researchMaxRounds = researchConfig.maxRounds
        const forceWebSearch = researchConfig.forceWebSearch

        // Start research mode when web search is enabled (maxRounds >= 0)
        if (researchMaxRounds >= 0 && canUseTools) {
          startResearchMode(researchMaxRounds, forceWebSearch)
        }

        const planFirstInstruction =
          isWebResearchEnabled(settings.skills) &&
          getWebResearchMode(settings.skills) === 'structured' &&
          canUseTools
            ? `\n\nBefore searching, call the research_plan tool with your planned steps (2-6 searches). Do not call web_search directly. We will execute your plan and return combined results.\n\n`
            : ''
        const effectiveSystemPrompt =
          getEffectiveSystemPrompt(settings) +
          planFirstInstruction +
          getResearchContext(0, researchMaxRounds)
        const optimizedHistory = buildOptimizedContext(
          conversationHistory,
          outboundUserMessage,
          effectiveSystemPrompt,
          settings.aiModel
        )
        const providerMessages = buildProviderMessages(
          optimizedHistory as ConversationMessage[],
          settings.modelProvider
        )

        // Create streaming message
        const streamingMessageId = addMessageToSession(targetSessionId!, {
          role: 'assistant',
          content: '',
          model: `${settings.modelProvider}/${settings.aiModel}`,
        })

        // Keep partial assistant output out of persisted chat history until completion.
        streamingMessageRef.current = { sessionId: targetSessionId!, messageId: streamingMessageId }
        startStreaming(targetSessionId!, streamingMessageId)

        // Validate API key before sending
        const isOpenRouter =
          settings.modelProvider === 'openrouter' ||
          !['ollama', 'perplexity', 'groq', 'alibaba'].includes(settings.modelProvider)
        const isAlibaba = settings.modelProvider === 'alibaba'
        if (isAlibaba && !settings.alibabaApiKey?.trim()) {
          deleteMessageFromSession(targetSessionId!, streamingMessageId)
          streamingMessageRef.current = null
          setIsLoading(false)
          showToast(
            'Alibaba API key is required. Add it in Settings > Providers and save.',
            'error'
          )
          return
        }
        if (isOpenRouter && !getOpenRouterApiKey(settings.openRouterApiKey)) {
          deleteMessageFromSession(targetSessionId!, streamingMessageId)
          streamingMessageRef.current = null
          setIsLoading(false)
          showToast(
            'OpenRouter API key is required. Add it in Settings > Providers and save.',
            'error'
          )
          return
        }

        // Use composed provider-specific streaming hooks
        if (settings.modelProvider === 'ollama') {
          await streamOllama({
            sessionId: targetSessionId!,
            messageId: streamingMessageId,
            messages: providerMessages,
            startTime,
            researchMaxRounds,
            signal: abortControllerRef.current?.signal,
          })
        } else if (settings.modelProvider === 'perplexity') {
          await streamPerplexity({
            sessionId: targetSessionId!,
            messageId: streamingMessageId,
            messages: providerMessages,
            startTime,
            signal: abortControllerRef.current?.signal,
          })
        } else if (settings.modelProvider === 'groq') {
          await streamGroq({
            sessionId: targetSessionId!,
            messageId: streamingMessageId,
            messages: providerMessages,
            startTime,
            researchMaxRounds,
            signal: abortControllerRef.current?.signal,
          })
        } else if (settings.modelProvider === 'alibaba') {
          await streamAlibaba({
            sessionId: targetSessionId!,
            messageId: streamingMessageId,
            messages: providerMessages,
            startTime,
            researchMaxRounds,
            signal: abortControllerRef.current?.signal,
          })
        } else {
          await streamOpenRouter({
            sessionId: targetSessionId!,
            messageId: streamingMessageId,
            messages: providerMessages,
            startTime,
            researchMaxRounds,
            forceWebSearch,
            signal: abortControllerRef.current?.signal,
          })
        }

        // Commit streaming content to the session
        if (streamingMessageRef.current) {
          const finalState = completeStreaming()
          // Explicitly commit the captured streaming state to ChatHistoryContext.
          // The provider hooks call updateStreamingMessage too, but that setState
          // may still be batched/pending when completeStreaming() resets the
          // ephemeral StreamingContext, causing the content to vanish on re-render.
          if (finalState.sessionId && finalState.messageId && finalState.content) {
            updateStreamingMessage(
              finalState.sessionId,
              finalState.messageId,
              buildFinalStreamingUpdates(finalState)
            )
          }
          streamingMessageRef.current = null
        }

        setIsLoading(false)
        clearToolState()
        options.onStreamEnd?.()
        options.onMessageSent?.()

        // Generate title for new sessions (slight delay to avoid request burst after streaming)
        if (isNewSession && targetSessionId) {
          setTimeout(() => {
            generateChatTitle(content, settings)
              .then((title) => {
                if (title) applyGeneratedSessionTitle(targetSessionId!, title)
              })
              .catch(console.error)
          }, 1500)
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
        const msg = error.message || ''

        if (msg.includes('429') || msg.includes('rate limit')) {
          // Surface the actual error detail from the provider
          // Error messages now include [status] prefix from retry logic
          const statusMatch = msg.match(/\[(\d+)\]\s*(.+)/)
          if (statusMatch) {
            errorMsg = `Provider error (${statusMatch[1]}): ${statusMatch[2]}`
          } else if (msg.includes('Provider returned error') || msg.includes('provider:')) {
            errorMsg =
              'The upstream model provider returned an error (429). This usually means the model is temporarily overloaded. Try a different model or wait a moment.'
          } else {
            errorMsg = 'Rate limit exceeded. Please slow down and try again in a moment.'
          }
          showToast(errorMsg, 'warning')
        } else if (msg.includes('401') || msg.includes('403')) {
          errorMsg = 'Invalid API key. Please check your API key in Settings.'
          showToast(errorMsg, 'error')
        } else if (msg.includes('network') || msg.includes('fetch')) {
          errorMsg = 'Network error. Please check your internet connection.'
          showToast(errorMsg, 'error')
        } else if (msg.includes('API Key') || msg.includes('missing')) {
          errorMsg =
            'OpenRouter API key is required. Add it in Settings > Providers and click Save.'
          showToast(errorMsg, 'error')
        } else {
          errorMsg = `Error: ${msg || 'Unknown error'}`
          showToast(errorMsg, 'error')
        }

        addMessageToSession(targetSessionId!, { role: 'assistant', content: errorMsg })
        clearToolState()
        options.onStreamEnd?.()
      }
    },
    [
      isLoading,
      currentSessionId,
      messages,
      settings,
      canUseTools,
      createSession,
      addMessageToSession,
      updateStreamingMessage,
      applyGeneratedSessionTitle,
      deleteMessageFromSession,
      clearToolState,
      startResearchMode,
      getResearchContext,
      calculateResearchConfig,
      showToast,
      options,
      startStreaming,
      completeStreaming,
      cancelStreaming,
      streamOllama,
      streamPerplexity,
      streamGroq,
      streamAlibaba,
      streamOpenRouter,
      buildFinalStreamingUpdates,
    ]
  )

  /**
   * Regenerate a message with different instructions
   * Note: This uses direct streaming for simplicity, not the composed hooks
   */
  const regenerateMessage = useCallback(
    async (message: any, instruction: string) => {
      if (!currentSessionId || isLoading) return

      // Handle switch_model instruction
      if (instruction === 'switch_model') {
        const models = getModelOptions()
        const currentModelIndex = models.findIndex((m) => m.id === settings.aiModel)
        const nextModel = models[(currentModelIndex + 1) % models.length]
        updateSettings({ aiModel: nextModel.id })
      }

      const versions = message.responseVersions || []
      versions.push({
        id: message.id,
        content: message.content,
        timestamp: message.timestamp,
        instruction: message.instruction,
        model: message.model,
      })

      clearToolState()
      setIsLoading(true)
      abortControllerRef.current = new AbortController()

      try {
        const session = sessions.find((s) => s.id === currentSessionId)
        if (!session) {
          showToast('Session not found', 'error')
          setIsLoading(false)
          return
        }

        const messageIndex = session.messages.findIndex((m) => m.id === message.id)
        if (messageIndex <= 0) {
          showToast('Cannot regenerate - no user message found', 'error')
          setIsLoading(false)
          return
        }

        const userMessage = session.messages[messageIndex - 1]
        // Get conversation history BEFORE the user message being regenerated
        const conversationHistory = toConversationMessages(
          session.messages.slice(0, messageIndex - 1).map((entry) => ({
            role: entry.role,
            content: entry.content,
            files: entry.files as AttachedFile[] | undefined,
          }))
        )

        if (hasImageAttachments(userMessage.files as AttachedFile[] | undefined) && !canAnalyzeImageAttachments(settings)) {
          showToast(
            'This response was generated from an image prompt. Switch back to a vision-capable model to regenerate it.',
            'warning'
          )
          setIsLoading(false)
          return
        }

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
          currentVersionIndex: versions.length,
        })

        let accumulatedContent = ''
        let accumulatedReasoning = ''

        const outboundUserMessage = {
          role: 'user' as const,
          content: userContent,
          files: userMessage.files as AttachedFile[] | undefined,
        }

        const apiMessages = buildProviderMessages(
          buildOptimizedContext(
            conversationHistory,
            outboundUserMessage,
            systemPrompt,
            settings.aiModel
          ) as ConversationMessage[],
          settings.modelProvider
        )

        try {
          if (settings.modelProvider === 'ollama') {
            for await (const chunk of streamOllamaCompletion(
              settings.ollamaUrl,
              settings.aiModel,
              apiMessages,
              { think: true, signal: abortControllerRef.current?.signal }
            )) {
              const thinkingDelta = chunk.message?.thinking || ''
              const delta = chunk.message?.content || ''
              if (thinkingDelta) accumulatedReasoning += thinkingDelta
              accumulatedContent += delta
              updateStreamingMessage(currentSessionId, streamingMessageId, {
                content: accumulatedContent,
                thinking: accumulatedReasoning || undefined,
              })
            }
          } else if (settings.modelProvider === 'perplexity') {
            for await (const chunk of streamPerplexityCompletion(
              settings.perplexityApiKey,
              settings.aiModel,
              apiMessages,
              { signal: abortControllerRef.current?.signal }
            )) {
              const delta = chunk.choices?.[0]?.delta?.content || ''
              accumulatedContent += delta
              updateStreamingMessage(currentSessionId, streamingMessageId, {
                content: accumulatedContent,
              })
            }
          } else if (settings.modelProvider === 'groq') {
            for await (const chunk of streamGroqCompletion(
              settings.groqApiKey,
              settings.aiModel,
              apiMessages,
              { signal: abortControllerRef.current?.signal }
            )) {
              const delta = chunk.choices?.[0]?.delta?.content || ''
              accumulatedContent += delta
              updateStreamingMessage(currentSessionId, streamingMessageId, {
                content: accumulatedContent,
              })
            }
          } else if (settings.modelProvider === 'alibaba') {
            for await (const chunk of streamAlibabaCompletion(
              settings.alibabaApiKey,
              settings.aiModel,
              apiMessages,
              { signal: abortControllerRef.current?.signal }
            )) {
              const delta = chunk.choices?.[0]?.delta?.content || ''
              accumulatedContent += delta
              updateStreamingMessage(currentSessionId, streamingMessageId, {
                content: accumulatedContent,
              })
            }
          } else {
            for await (const chunk of streamOpenRouterCompletion(
              getOpenRouterApiKey(settings.openRouterApiKey),
              settings.aiModel,
              apiMessages,
              { temperature: settings.temperature, signal: abortControllerRef.current?.signal }
            )) {
              const delta = chunk.choices?.[0]?.delta?.content || ''
              const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning || ''
              if (reasoningDelta) accumulatedReasoning += reasoningDelta
              if (delta) accumulatedContent += delta
              updateStreamingMessage(currentSessionId, streamingMessageId, {
                content: accumulatedContent,
                thinking: accumulatedReasoning || undefined,
              })
            }
          }

          updateStreamingMessage(currentSessionId, streamingMessageId, {
            content: accumulatedContent,
            thinking: accumulatedReasoning || undefined,
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
            currentVersionIndex: message.currentVersionIndex,
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
    },
    [
      currentSessionId,
      isLoading,
      sessions,
      settings,
      addMessageToSession,
      updateStreamingMessage,
      deleteMessageFromSession,
      clearToolState,
      showToast,
      updateSettings,
    ]
  )

  /**
   * Get available models for switching
   */
  const getModelOptions = (): Array<{ id: string; displayName: string }> => {
    const allModels: Array<{ id: string; displayName: string }> = []

    if (settings.configuredModels) {
      settings.configuredModels.forEach((m) =>
        allModels.push({ id: m.code, displayName: m.displayName })
      )
    }
    if (settings.ollamaModels) {
      settings.ollamaModels.forEach((m) =>
        allModels.push({ id: m.code, displayName: m.displayName })
      )
    }
    if (settings.perplexityModels) {
      settings.perplexityModels.forEach((m) =>
        allModels.push({ id: `perplexity/${m.code}`, displayName: m.displayName })
      )
    }
    if (settings.groqModels) {
      settings.groqModels.forEach((m) => allModels.push({ id: m.code, displayName: m.displayName }))
    }
    if (settings.alibabaModels) {
      settings.alibabaModels.forEach((m) =>
        allModels.push({ id: m.code, displayName: m.displayName })
      )
    }

    return allModels
  }

  return {
    isLoading,
    toolState,
    sendMessage,
    regenerateMessage,
    stopStreaming,
  }
}

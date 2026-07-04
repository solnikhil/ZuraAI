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
import { getSessionMemoryScope } from '../../../../utils/memoryScope'
import {
  completeAgentToolStep,
  createAgentRun,
  finishAgentRun,
  isAgentWorkspaceMode,
  upsertAgentToolStep,
  upsertAgentVerificationStep,
} from '../../../../agent/agentRun'
import { useAgentToolApproval } from '../../../../agent/AgentToolApprovalContext'
import { generateChatTitle } from '../../../../services/titleGenerator'
import { runMemoryExtraction, type ExtractionMessage } from '../../../../services/memoryExtraction'
import { inferOpenRouterSupportsDeepThinking } from '../../../../services/openrouterModels'
import { inferAlibabaSupportsDeepThinking } from '../../../../services/alibabaModels'
import { getDeepseekReasoning } from '../../../../utils/deepseekReasoning'
import { buildOptimizedContextWithTrace } from '../../../../utils/tokenUtils'
import { getEffectiveSystemPrompt } from '../../../../utils/promptSelection'
import { loadMemoryBlock } from '../../../../prompts/buildMemoryBlock'
import { loadRecentActivityBlock } from '../../../../prompts/buildRecentActivityBlock'
import { StreamingThrottler } from '../../../../utils/streamingThrottler'
import { resolveProviderApiKeysForSettings } from '../../../../utils/secureApiKeys'
import {
  getAvailableModelOptions,
  getProviderCredentialError,
  normalizeActiveProviderId,
  TITLE_REVEAL_INTERVAL_MS,
} from '../../../../providers'
import {
  buildProviderMessages,
  canAnalyzeImageAttachments,
  isImageAttachment,
  type AttachedFile,
  type ConversationMessage,
} from '../attachmentUtils'

import {
  formatProviderStreamError,
  useProviderStreaming,
  useStreamingToolCalls,
  useResearchMode,
  type StreamingResult,
  type StreamingSettings,
  type ToolCallingHook,
} from './streaming'
import { trackAnalytics, trackRendererError } from '../../../../analytics/track'

export interface UseStreamingChatOptions {
  onStreamStart?: () => void
  onStreamEnd?: () => void
  onRegenerateStart?: () => void
}

export interface UseStreamingChatReturn {
  isLoading: boolean
  toolState: ToolCallState
  sendMessage: (content: string, files: AttachedFile[]) => Promise<void>
  regenerateMessage: (message: RegenerateMessage, instruction: string) => Promise<void>
  stopStreaming: () => void
}

type RegenerateMessage = Message & {
  instruction?: string
}

function addDynamicSystemPrompt<T extends { role: string; content: string }>(
  messages: T[],
  dynamicPrompt: string
): T[] {
  const trimmed = dynamicPrompt.trim()
  if (!trimmed) return messages

  const systemIndex = messages.findIndex((message) => message.role === 'system')
  const dynamicMessage = { role: 'system', content: trimmed } as T
  if (systemIndex < 0) {
    return [dynamicMessage, ...messages]
  }

  return [...messages.slice(0, systemIndex + 1), dynamicMessage, ...messages.slice(systemIndex + 1)]
}

export function buildCommittedStreamingUpdates(
  finalState: StreamingMessageState,
  streamResult?: StreamingResult
): Partial<Message> {
  const hasField = <K extends keyof StreamingMessageState>(key: K) =>
    Object.prototype.hasOwnProperty.call(finalState, key)

  const updates: Partial<Message> = {
    content: streamResult?.content ?? finalState.content,
  }

  if (streamResult?.thinking !== undefined || hasField('thinking')) {
    updates.thinking = streamResult?.thinking ?? finalState.thinking
  }
  if (streamResult?.thinkingDuration !== undefined || hasField('thinkingDuration')) {
    updates.thinkingDuration = streamResult?.thinkingDuration ?? finalState.thinkingDuration
  }
  if (streamResult?.thinkingBlocks !== undefined || hasField('thinkingBlocks')) {
    updates.thinkingBlocks = streamResult?.thinkingBlocks ?? finalState.thinkingBlocks
  }
  if (hasField('researchStatus')) updates.researchStatus = finalState.researchStatus
  if (hasField('researchPlan')) updates.researchPlan = finalState.researchPlan
  if (hasField('researchProgress')) updates.researchProgress = finalState.researchProgress
  if (streamResult?.toolResults !== undefined || hasField('toolResults')) {
    updates.toolResults =
      streamResult?.toolResults === null
        ? undefined
        : (streamResult?.toolResults ?? finalState.toolResults)
  }
  if (hasField('agentRun')) updates.agentRun = finalState.agentRun
  if (streamResult?.files !== undefined || hasField('files'))
    updates.files = streamResult?.files ?? finalState.files
  if (streamResult?.model !== undefined || hasField('model'))
    updates.model = streamResult?.model ?? finalState.model
  if (streamResult?.latency !== undefined || hasField('latency'))
    updates.latency = streamResult?.latency ?? finalState.latency
  if (streamResult?.usage !== undefined || hasField('usage'))
    updates.usage = streamResult?.usage ?? finalState.usage
  if (streamResult?.finishReason !== undefined) updates.finishReason = streamResult.finishReason

  return updates
}

export function normalizeGeneratedSessionTitle(
  generatedTitle: string | null | undefined
): string | null {
  const normalizedTitle = generatedTitle?.trim() || ''
  return normalizedTitle || null
}

function hasImageAttachments(files?: AttachedFile[]) {
  return (files || []).some(isImageAttachment)
}

function toConversationMessages(
  messages: Array<{ id?: string; role: string; content: string; files?: AttachedFile[] }>
): ConversationMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    files: message.files,
  }))
}

function buildMemoryExtractionMessages(
  conversationHistory: ConversationMessage[],
  userContent: string,
  assistantContent: string
): ExtractionMessage[] {
  const priorMessages = conversationHistory
    .filter(
      (message): message is ConversationMessage & { role: 'user' | 'assistant' } =>
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0
    )
    .map((message) => ({ role: message.role, content: message.content }))

  return [
    ...priorMessages,
    { role: 'user' as const, content: userContent },
    ...(assistantContent.trim() ? [{ role: 'assistant' as const, content: assistantContent }] : []),
  ]
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
    folders,
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
      const hasField = <K extends keyof StreamingMessageState>(key: K) =>
        Object.prototype.hasOwnProperty.call(finalState, key)

      const updates: Partial<Message> = {
        content: finalState.content,
      }

      if (hasField('thinking')) updates.thinking = finalState.thinking
      if (hasField('thinkingDuration')) updates.thinkingDuration = finalState.thinkingDuration
      if (hasField('thinkingBlocks')) updates.thinkingBlocks = finalState.thinkingBlocks
      if (hasField('researchStatus')) updates.researchStatus = finalState.researchStatus
      if (hasField('researchPlan')) updates.researchPlan = finalState.researchPlan
      if (hasField('researchProgress')) updates.researchProgress = finalState.researchProgress
      if (hasField('toolResults')) updates.toolResults = finalState.toolResults
      if (hasField('agentRun')) updates.agentRun = finalState.agentRun
      if (hasField('files')) updates.files = finalState.files
      if (hasField('model')) updates.model = finalState.model
      if (hasField('latency')) updates.latency = finalState.latency
      if (hasField('usage')) updates.usage = finalState.usage

      return updates
    },
    []
  )

  // Track current streaming message for isolated updates
  const streamingMessageRef = useRef<{ sessionId: string; messageId: string } | null>(null)
  const titleRevealIntervalRef = useRef<Map<string, number>>(new Map())

  const { settings, updateSettings } = useSettings()
  const { showToast } = useToast()
  const { requestApproval } = useAgentToolApproval()
  const activeAgentRunRef = useRef<Message['agentRun'] | undefined>(undefined)

  const publishAgentRun = useCallback(
    (sessionId: string, messageId: string, agentRun: Message['agentRun']) => {
      if (!agentRun) return
      activeAgentRunRef.current = agentRun
      updateStreaming({ agentRun })
      if (
        streamingMessageRef.current?.sessionId !== sessionId ||
        streamingMessageRef.current?.messageId !== messageId
      ) {
        updateStreamingMessage(sessionId, messageId, { agentRun })
      }
    },
    [updateStreaming, updateStreamingMessage]
  )

  const clearTitleRevealInterval = useCallback((sessionId: string) => {
    const timerId = titleRevealIntervalRef.current.get(sessionId)
    if (timerId !== undefined) {
      window.clearInterval(timerId)
      titleRevealIntervalRef.current.delete(sessionId)
    }
  }, [])

  const applyGeneratedSessionTitle = useCallback(
    (sessionId: string, generatedTitle: string | null) => {
      const normalizedTitle = normalizeGeneratedSessionTitle(generatedTitle)
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
      }, TITLE_REVEAL_INTERVAL_MS)

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

  const throttledUpdateStreamingMessage = useCallback(
    (sessionId: string, messageId: string, updates: Partial<Message>) => {
      // Use isolated streaming context for updates during streaming
      if (
        streamingMessageRef.current?.sessionId === sessionId &&
        streamingMessageRef.current?.messageId === messageId
      ) {
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

  const streamingSettings: StreamingSettings = useMemo(
    () => ({
      aiModel: settings.aiModel,
      modelProvider: settings.modelProvider,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      streamResponses: settings.streamResponses,
      webSearchPrompt: settings.webSearchPrompt,
      ollamaUrl: settings.ollamaUrl,
      openRouterDebug: settings.openRouterDebug,
      openRouterApiKey: settings.openRouterApiKey,
      configuredModels: settings.configuredModels,
      alibabaModels: settings.alibabaModels,
      perplexityApiKey: settings.perplexityApiKey,
      groqApiKey: settings.groqApiKey,
      alibabaApiKey: settings.alibabaApiKey,
      deepseekApiKey: settings.deepseekApiKey,
      opencodeGoApiKey: settings.opencodeGoApiKey,
      fireworksApiKey: settings.fireworksApiKey,
      nvidiaApiKey: settings.nvidiaApiKey,
      nvidiaModels: settings.nvidiaModels,
    }),
    [
      settings.aiModel,
      settings.modelProvider,
      settings.temperature,
      settings.maxTokens,
      settings.streamResponses,
      settings.webSearchPrompt,
      settings.ollamaUrl,
      settings.openRouterDebug,
      settings.openRouterApiKey,
      settings.configuredModels,
      settings.alibabaModels,
      settings.perplexityApiKey,
      settings.groqApiKey,
      settings.alibabaApiKey,
      settings.deepseekApiKey,
      settings.opencodeGoApiKey,
      settings.fireworksApiKey,
      settings.nvidiaApiKey,
      settings.nvidiaModels,
    ]
  )

  const {
    canUseTools,
    getToolsForRequest,
    getToolsForRequestAsync,
    handleToolCalls,
    toolState,
    clearToolState,
    startResearchMode,
    getResearchContext,
  } = useStreamingToolCalls({ settings: streamingSettings })

  const toolCalling: ToolCallingHook = useMemo(
    () => ({
      canUseTools,
      getToolsForRequest,
      getToolsForRequestAsync,
      handleToolCalls,
      getResearchContext,
    }),
    [canUseTools, getToolsForRequest, getToolsForRequestAsync, handleToolCalls, getResearchContext]
  )

  const { calculateResearchConfig } = useResearchMode({ canUseTools })

  const { runProviderStream } = useProviderStreaming({
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
      if (activeAgentRunRef.current) {
        publishAgentRun(
          streamingMessageRef.current.sessionId,
          streamingMessageRef.current.messageId,
          finishAgentRun(activeAgentRunRef.current, 'cancelled')
        )
      }
      const finalState = completeStreaming()
      if (finalState.sessionId && finalState.messageId) {
        // Commit final content to the session
        updateStreamingMessage(
          finalState.sessionId,
          finalState.messageId,
          buildFinalStreamingUpdates(finalState)
        )
      }
      streamingMessageRef.current = null
      activeAgentRunRef.current = undefined
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

      const outboundUserMessageId = addMessageToSession(targetSessionId, outboundUserMessage)

      const startTime = performance.now()

      try {
        const conversationHistory = toConversationMessages(
          messages.map((message) => ({
            id: message.id,
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

        const researchMaxRounds = researchConfig.maxRounds
        const forceWebSearch = researchConfig.forceWebSearch

        // Start research mode when web search is enabled (maxRounds >= 0)
        if (researchMaxRounds >= 0 && canUseTools) {
          startResearchMode(researchMaxRounds, forceWebSearch)
        }

        const memoryScope = getSessionMemoryScope(sessions, targetSessionId, folders)
        const baseSystemPrompt = getEffectiveSystemPrompt(
          settings,
          await loadMemoryBlock(settings, memoryScope, {
            userMessage:
              typeof outboundUserMessage.content === 'string' ? outboundUserMessage.content : '',
          }),
          await loadRecentActivityBlock(settings)
        )
        const dynamicResearchContext = getResearchContext(0, researchMaxRounds)
        const optimizedContext = buildOptimizedContextWithTrace(
          conversationHistory,
          { ...outboundUserMessage, id: outboundUserMessageId },
          baseSystemPrompt,
          settings.aiModel
        )
        const cacheStableHistory = addDynamicSystemPrompt(
          optimizedContext.messages as ConversationMessage[],
          dynamicResearchContext
        )
        const providerMessages = buildProviderMessages(cacheStableHistory, settings.modelProvider)
        const provider = normalizeActiveProviderId(settings.modelProvider)
        const effectiveStreamingSettings = await resolveProviderApiKeysForSettings(
          streamingSettings,
          provider
        )

        const credentialError = getProviderCredentialError(effectiveStreamingSettings, provider)
        if (credentialError) {
          setIsLoading(false)
          showToast(credentialError, 'error')
          trackRendererError('provider', 'credential_error')
          return
        }

        trackAnalytics('chat_message_sent', {
          provider,
          model: settings.aiModel,
          assistantMode: settings.assistantMode,
          hasAttachments: fileAttachments.length > 0,
        })
        trackAnalytics('provider_used', { provider })
        trackAnalytics('model_used', {
          provider,
          model: settings.aiModel,
        })

        const initialAgentRun = isAgentWorkspaceMode(settings.assistantMode)
          ? createAgentRun(settings.assistantMode, content)
          : undefined

        const streamingMessageId = addMessageToSession(targetSessionId!, {
          role: 'assistant',
          content: '',
          model: `${settings.modelProvider}/${settings.aiModel}`,
          agentRun: initialAgentRun,
        })

        // Keep partial assistant output out of persisted chat history until completion.
        streamingMessageRef.current = { sessionId: targetSessionId!, messageId: streamingMessageId }
        startStreaming(targetSessionId!, streamingMessageId)
        activeAgentRunRef.current = initialAgentRun
        if (activeAgentRunRef.current) {
          publishAgentRun(targetSessionId!, streamingMessageId, activeAgentRunRef.current)
        }

        // Use composed provider-specific streaming hooks
        const currentModel =
          provider === 'openrouter'
            ? settings.configuredModels?.find((m) => m.code === settings.aiModel)
            : undefined
        const openRouterReasoning =
          provider === 'openrouter' &&
          inferOpenRouterSupportsDeepThinking(
            currentModel || { code: settings.aiModel, displayName: settings.aiModel }
          )
            ? { enabled: true, effort: settings.openRouterReasoningEffort?.[settings.aiModel] }
            : undefined

        const alibabaModel =
          provider === 'alibaba'
            ? (settings.alibabaModels || []).find((m) => m.code === settings.aiModel)
            : undefined
        const alibabaEnableThinking =
          provider === 'alibaba' &&
          inferAlibabaSupportsDeepThinking(
            alibabaModel || { code: settings.aiModel, displayName: settings.aiModel }
          )
            ? true
            : undefined

        const deepseekReasoning =
          provider === 'deepseek' ? getDeepseekReasoning(settings, settings.aiModel) : undefined
        const nvidiaModel =
          provider === 'nvidia'
            ? (settings.nvidiaModels || []).find((m) => m.code === settings.aiModel)
            : undefined
        const nvidiaReasoningEffort =
          provider === 'nvidia'
            ? (settings.nvidiaReasoningEffort?.[settings.aiModel] ?? 'high')
            : undefined
        const nvidiaEnableThinking =
          provider === 'nvidia'
            ? nvidiaReasoningEffort !== 'none' &&
              (nvidiaModel?.supportsDeepThinking ||
                /(?:reason|thinking|m3|nemotron)/i.test(settings.aiModel))
              ? true
              : false
            : undefined

        const streamResult = await runProviderStream({
          provider,
          model: settings.aiModel,
          settingsOverride: effectiveStreamingSettings,
          sessionId: targetSessionId!,
          messageId: streamingMessageId,
          messages: providerMessages,
          contextTrace: optimizedContext.trace,
          startTime,
          researchMaxRounds,
          forceWebSearch,
          signal: abortControllerRef.current?.signal,
          enableTools: true,
          syncToStreamingContext: true,
          toolEventCallbacks: activeAgentRunRef.current
            ? {
                requestToolApproval: requestApproval,
                onToolApprovalStart: (toolCall) => {
                  if (!activeAgentRunRef.current) return
                  publishAgentRun(
                    targetSessionId!,
                    streamingMessageId,
                    upsertAgentToolStep(activeAgentRunRef.current, toolCall, {
                      status: 'awaiting-approval',
                      approvalState: 'pending',
                      startedAt: Date.now(),
                    })
                  )
                },
                onToolApprovalResolved: (toolCall, approved) => {
                  if (!activeAgentRunRef.current) return
                  publishAgentRun(
                    targetSessionId!,
                    streamingMessageId,
                    upsertAgentToolStep(activeAgentRunRef.current, toolCall, {
                      status: approved ? 'pending' : 'rejected',
                      approvalState: approved ? 'approved' : 'rejected',
                      completedAt: approved ? undefined : Date.now(),
                    })
                  )
                },
                onToolStart: (toolCall) => {
                  if (!activeAgentRunRef.current) return
                  publishAgentRun(
                    targetSessionId!,
                    streamingMessageId,
                    upsertAgentToolStep(activeAgentRunRef.current, toolCall, {
                      status: 'running',
                      approvalState: 'approved',
                      startedAt: Date.now(),
                    })
                  )
                },
                onToolComplete: (result) => {
                  if (!activeAgentRunRef.current) return
                  publishAgentRun(
                    targetSessionId!,
                    streamingMessageId,
                    completeAgentToolStep(activeAgentRunRef.current, result)
                  )
                },
                onVerificationStart: (strategy) => {
                  if (!activeAgentRunRef.current) return
                  publishAgentRun(
                    targetSessionId!,
                    streamingMessageId,
                    upsertAgentVerificationStep(activeAgentRunRef.current, strategy, {
                      status: 'running',
                      startedAt: Date.now(),
                    })
                  )
                },
                onVerificationComplete: (strategy, verified) => {
                  if (!activeAgentRunRef.current) return
                  const now = Date.now()
                  publishAgentRun(
                    targetSessionId!,
                    streamingMessageId,
                    upsertAgentVerificationStep(activeAgentRunRef.current, strategy, {
                      status: verified ? 'completed' : 'failed',
                      completedAt: now,
                      durationMs: Math.max(
                        0,
                        now -
                          (activeAgentRunRef.current.steps.find(
                            (step) => step.kind === 'verify' && step.status === 'running'
                          )?.startedAt ?? now)
                      ),
                    })
                  )
                },
              }
            : undefined,
          reasoning: openRouterReasoning,
          enableThinking: deepseekReasoning
            ? deepseekReasoning.enabled && deepseekReasoning.effort !== 'none'
            : (nvidiaEnableThinking ?? alibabaEnableThinking),
          reasoningEffort:
            deepseekReasoning?.enabled && deepseekReasoning.effort !== 'none'
              ? deepseekReasoning.effort
              : undefined,
        })

        // Commit streaming content to the session
        let assistantTextForMemory = ''
        if (streamingMessageRef.current && activeAgentRunRef.current) {
          publishAgentRun(
            streamingMessageRef.current.sessionId,
            streamingMessageRef.current.messageId,
            finishAgentRun(activeAgentRunRef.current, 'completed')
          )
        }
        if (streamingMessageRef.current) {
          const finalState = completeStreaming()
          if (finalState.sessionId && finalState.messageId) {
            updateStreamingMessage(
              finalState.sessionId,
              finalState.messageId,
              buildCommittedStreamingUpdates(finalState, streamResult)
            )
          }
          assistantTextForMemory = typeof finalState.content === 'string' ? finalState.content : ''
          streamingMessageRef.current = null
          activeAgentRunRef.current = undefined
        }

        setIsLoading(false)
        clearToolState()
        options.onStreamEnd?.()

        // Dreaming: fire-and-forget background memory extraction for this turn.
        // Gated by the Memory skill inside runMemoryExtraction; best-effort and
        // silent on failure so it never disrupts the chat.
        if (targetSessionId && typeof content === 'string' && content.trim()) {
          void runMemoryExtraction({
            settings,
            sessionId: targetSessionId,
            scope: memoryScope,
            messages: buildMemoryExtractionMessages(
              conversationHistory,
              content,
              assistantTextForMemory
            ),
          }).catch(() => undefined)
        }

        if (isNewSession && targetSessionId) {
          generateChatTitle(content, settings)
            .then((title) => {
              if (title) applyGeneratedSessionTitle(targetSessionId!, title)
            })
            .catch(console.error)
        }
      } catch (error: unknown) {
        // Silently handle abort (user clicked stop)
        if (
          error instanceof Error &&
          (error.name === 'AbortError' || abortControllerRef.current === null)
        ) {
          // Stream was aborted by user - loading state already cleared by stopStreaming
          return
        }

        // Cancel isolated streaming on error
        if (streamingMessageRef.current) {
          activeAgentRunRef.current = undefined
          deleteMessageFromSession(
            streamingMessageRef.current.sessionId,
            streamingMessageRef.current.messageId
          )
          cancelStreaming()
          streamingMessageRef.current = null
        }

        setIsLoading(false)
        const formattedError = formatProviderStreamError(
          error,
          normalizeActiveProviderId(settings.modelProvider),
          settings
        )
        trackRendererError('provider', formattedError.tone)
        const errorMsg = formattedError.message
        showToast(errorMsg, formattedError.tone)

        addMessageToSession(targetSessionId!, { role: 'assistant', content: errorMsg })
        clearToolState()
        options.onStreamEnd?.()
      }
    },
    [
      isLoading,
      currentSessionId,
      sessions,
      messages,
      settings,
      streamingSettings,
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
      runProviderStream,
      buildFinalStreamingUpdates,
      publishAgentRun,
      requestApproval,
    ]
  )

  /** Regenerate a message with different instructions. */
  const regenerateMessage = useCallback(
    async (message: RegenerateMessage, instruction: string) => {
      if (!currentSessionId || isLoading) return

      let effectiveSettings = settings

      if (instruction === 'switch_model') {
        const models = getAvailableModelOptions(settings)
        if (models.length === 0) {
          showToast('No enabled models are available to switch to.', 'warning')
          return
        }

        const currentModelIndex = models.findIndex(
          (m) => m.id === settings.aiModel && m.provider === settings.modelProvider
        )
        const nextIndex = currentModelIndex >= 0 ? (currentModelIndex + 1) % models.length : 0
        const nextModel = models[nextIndex]
        updateSettings({ aiModel: nextModel.id, modelProvider: nextModel.provider })
        effectiveSettings = {
          ...settings,
          aiModel: nextModel.id,
          modelProvider: nextModel.provider,
        }
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
        const conversationHistory = toConversationMessages(
          session.messages.slice(0, messageIndex - 1).map((entry) => ({
            id: entry.id,
            role: entry.role,
            content: entry.content,
            files: entry.files as AttachedFile[] | undefined,
          }))
        )

        if (
          hasImageAttachments(userMessage.files as AttachedFile[] | undefined) &&
          !canAnalyzeImageAttachments(effectiveSettings)
        ) {
          showToast(
            'This response was generated from an image prompt. Switch back to a vision-capable model to regenerate it.',
            'warning'
          )
          setIsLoading(false)
          return
        }

        const effectiveProvider = normalizeActiveProviderId(effectiveSettings.modelProvider)
        const effectiveRegenerationSettings = await resolveProviderApiKeysForSettings(
          {
            aiModel: effectiveSettings.aiModel,
            modelProvider: effectiveSettings.modelProvider,
            temperature: effectiveSettings.temperature,
            maxTokens: effectiveSettings.maxTokens,
            streamResponses: effectiveSettings.streamResponses,
            webSearchPrompt: effectiveSettings.webSearchPrompt,
            ollamaUrl: effectiveSettings.ollamaUrl,
            openRouterDebug: effectiveSettings.openRouterDebug,
            openRouterApiKey: effectiveSettings.openRouterApiKey,
            configuredModels: effectiveSettings.configuredModels,
            alibabaModels: effectiveSettings.alibabaModels,
            perplexityApiKey: effectiveSettings.perplexityApiKey,
            groqApiKey: effectiveSettings.groqApiKey,
            alibabaApiKey: effectiveSettings.alibabaApiKey,
            deepseekApiKey: effectiveSettings.deepseekApiKey,
            opencodeGoApiKey: effectiveSettings.opencodeGoApiKey,
            fireworksApiKey: effectiveSettings.fireworksApiKey,
            nvidiaApiKey: effectiveSettings.nvidiaApiKey,
            nvidiaModels: effectiveSettings.nvidiaModels,
          },
          effectiveProvider
        )
        const credentialError = getProviderCredentialError(
          effectiveRegenerationSettings,
          effectiveProvider
        )
        if (credentialError) {
          showToast(credentialError, 'error')
          setIsLoading(false)
          return
        }

        const memoryScope = getSessionMemoryScope(sessions, currentSessionId, folders)
        const systemPrompt = getEffectiveSystemPrompt(
          effectiveSettings,
          await loadMemoryBlock(effectiveSettings, memoryScope, {
            userMessage: typeof userMessage.content === 'string' ? userMessage.content : '',
          }),
          await loadRecentActivityBlock(effectiveSettings)
        )
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
          model: `${effectiveSettings.modelProvider}/${effectiveSettings.aiModel}`,
          responseVersions: versions,
          currentVersionIndex: versions.length,
        })

        const outboundUserMessage = {
          role: 'user' as const,
          content: userContent,
          files: userMessage.files as AttachedFile[] | undefined,
        }

        const openRouterModel =
          effectiveSettings.modelProvider === 'openrouter'
            ? effectiveSettings.configuredModels?.find(
                (model) => model.code === effectiveSettings.aiModel
              )
            : undefined
        const openRouterModalities = openRouterModel?.supportsImageGeneration
          ? openRouterModel.outputModalities?.filter(
              (modality): modality is 'text' | 'image' =>
                modality === 'text' || modality === 'image'
            ) || ['image', 'text']
          : undefined
        const openRouterReasoning = inferOpenRouterSupportsDeepThinking(
          openRouterModel || {
            code: effectiveSettings.aiModel,
            displayName: effectiveSettings.aiModel,
          }
        )
          ? {
              enabled: true,
              effort: effectiveSettings.openRouterReasoningEffort?.[effectiveSettings.aiModel],
            }
          : undefined

        const alibabaModelForRegen =
          effectiveSettings.modelProvider === 'alibaba'
            ? (effectiveSettings.alibabaModels || []).find(
                (m) => m.code === effectiveSettings.aiModel
              )
            : undefined
        const alibabaEnableThinkingForRegen =
          effectiveSettings.modelProvider === 'alibaba' &&
          inferAlibabaSupportsDeepThinking(
            alibabaModelForRegen || {
              code: effectiveSettings.aiModel,
              displayName: effectiveSettings.aiModel,
            }
          )
            ? true
            : undefined

        const deepseekReasoningForRegen =
          effectiveSettings.modelProvider === 'deepseek'
            ? getDeepseekReasoning(effectiveSettings, effectiveSettings.aiModel)
            : undefined
        const nvidiaModelForRegen =
          effectiveSettings.modelProvider === 'nvidia'
            ? (effectiveSettings.nvidiaModels || []).find(
                (m) => m.code === effectiveSettings.aiModel
              )
            : undefined
        const nvidiaReasoningEffortForRegen =
          effectiveSettings.modelProvider === 'nvidia'
            ? (effectiveSettings.nvidiaReasoningEffort?.[effectiveSettings.aiModel] ?? 'high')
            : undefined
        const nvidiaEnableThinkingForRegen =
          effectiveSettings.modelProvider === 'nvidia'
            ? nvidiaReasoningEffortForRegen !== 'none' &&
              (nvidiaModelForRegen?.supportsDeepThinking ||
                /(?:reason|thinking|m3|nemotron)/i.test(effectiveSettings.aiModel))
              ? true
              : false
            : undefined

        const optimizedContext = buildOptimizedContextWithTrace(
          conversationHistory,
          { ...outboundUserMessage, id: userMessage.id },
          systemPrompt,
          effectiveSettings.aiModel
        )
        const apiMessages = buildProviderMessages(
          optimizedContext.messages as ConversationMessage[],
          effectiveSettings.modelProvider
        )

        try {
          const regenerationResult = await runProviderStream({
            provider: effectiveProvider,
            model: effectiveSettings.aiModel,
            settingsOverride: effectiveRegenerationSettings,
            sessionId: currentSessionId,
            messageId: streamingMessageId,
            messages: apiMessages,
            contextTrace: optimizedContext.trace,
            startTime: performance.now(),
            researchMaxRounds: 0,
            forceWebSearch: false,
            signal: abortControllerRef.current?.signal,
            enableTools: false,
            syncToStreamingContext: false,
            modalities: openRouterModalities,
            reasoning: openRouterReasoning,
            enableThinking: deepseekReasoningForRegen
              ? deepseekReasoningForRegen.enabled && deepseekReasoningForRegen.effort !== 'none'
              : (nvidiaEnableThinkingForRegen ?? alibabaEnableThinkingForRegen),
            reasoningEffort:
              deepseekReasoningForRegen?.enabled && deepseekReasoningForRegen.effort !== 'none'
                ? deepseekReasoningForRegen.effort
                : undefined,
          })

          updateStreamingMessage(currentSessionId, streamingMessageId, {
            content: regenerationResult.content,
            thinkingBlocks: regenerationResult.thinkingBlocks,
            files: regenerationResult.files,
            usage: regenerationResult.usage,
            latency: regenerationResult.latency,
            model: regenerationResult.model,
          })
          setIsLoading(false)
        } catch (streamError: unknown) {
          // Silently handle abort (user clicked stop)
          if (
            streamError instanceof Error &&
            (streamError.name === 'AbortError' || abortControllerRef.current === null)
          ) {
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
          const formattedError = formatProviderStreamError(
            streamError,
            effectiveProvider,
            effectiveSettings
          )
          trackRendererError('provider', formattedError.tone)
          showToast(formattedError.message, formattedError.tone)
          setIsLoading(false)
        }
      } catch (error: unknown) {
        // Silently handle abort (user clicked stop)
        if (
          error instanceof Error &&
          (error.name === 'AbortError' || abortControllerRef.current === null)
        ) {
          return
        }
        const effectiveProvider = normalizeActiveProviderId(settings.modelProvider)
        const formattedError = formatProviderStreamError(error, effectiveProvider, settings)
        trackRendererError('provider', formattedError.tone)
        showToast(formattedError.message, formattedError.tone)
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
      options,
      updateSettings,
      runProviderStream,
    ]
  )

  return {
    isLoading,
    toolState,
    sendMessage,
    regenerateMessage,
    stopStreaming,
  }
}

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
import { getSessionMemoryScope, isFolderAssociationResolvable } from '../../../../utils/memoryScope'
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
import { buildOptimizedContextWithTrace } from '../../../../utils/tokenUtils'
import { getEffectiveSystemPrompt } from '../../../../utils/promptSelection'
import { loadMemoryBlock } from '../../../../prompts/buildMemoryBlock'
import { loadRecentActivityBlock } from '../../../../prompts/buildRecentActivityBlock'
import { StreamingThrottler } from '../../../../utils/streamingThrottler'
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
import { buildStreamingSettings } from './streaming/chatRunConfig'
import { ChatRunController, isChatRunAbort } from './chatRunController'
import { buildChatRunRequest } from './chatRunRequest'
import {
  buildChatRunResultUpdates,
  finalizeChatRun,
  mergeStreamingFinalState,
} from './chatRunFinalization'

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

export function buildRegenerationResponseVersions(message: RegenerateMessage) {
  return [
    ...(message.responseVersions ?? []),
    {
      id: message.id,
      content: message.content,
      timestamp: message.timestamp,
      instruction: message.instruction,
      model: message.model,
    },
  ]
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
  streamResult?: StreamingResult,
  terminalAgentRun?: Message['agentRun']
): Partial<Message> {
  if (streamResult) {
    const updates = mergeStreamingFinalState(finalState, streamResult)
    if (terminalAgentRun) updates.agentRun = terminalAgentRun
    return updates
  }
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
  if (terminalAgentRun) updates.agentRun = terminalAgentRun

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
  const activeRunRef = useRef<ChatRunController | null>(null)

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
    (finalState: StreamingMessageState, terminalAgentRun?: Message['agentRun']): Partial<Message> =>
      buildCommittedStreamingUpdates(finalState, undefined, terminalAgentRun),
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
    () => buildStreamingSettings(settings),
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
      settings.alibabaRegion,
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

  const finishRunUi = useCallback(
    (run: ChatRunController) => {
      const outcome = run.snapshot.outcome
      if (outcome && window.backgroundWindow?.releaseRun) {
        void window.backgroundWindow.releaseRun(run.id, outcome).catch(() => undefined)
      }
      if (activeRunRef.current === run) activeRunRef.current = null
      setIsLoading(false)
      clearToolState()
      options.onStreamEnd?.()
    },
    [clearToolState, options]
  )

  const stopStreaming = useCallback(() => {
    const run = activeRunRef.current
    if (!run) return

    finalizeChatRun(
      run,
      'cancelled',
      () => {
        flushThrottledUpdates()
        if (streamingMessageRef.current) {
          const terminalAgentRun = finishAgentRun(activeAgentRunRef.current, 'cancelled')
          if (terminalAgentRun) {
            publishAgentRun(
              streamingMessageRef.current.sessionId,
              streamingMessageRef.current.messageId,
              terminalAgentRun
            )
          }
          const finalState = completeStreaming()
          if (finalState.sessionId && finalState.messageId) {
            updateStreamingMessage(
              finalState.sessionId,
              finalState.messageId,
              buildFinalStreamingUpdates(finalState, terminalAgentRun),
              { persist: true }
            )
          }
          streamingMessageRef.current = null
          activeAgentRunRef.current = undefined
        }
      },
      () => finishRunUi(run)
    )
  }, [
    flushThrottledUpdates,
    completeStreaming,
    updateStreamingMessage,
    buildFinalStreamingUpdates,
    publishAgentRun,
    finishRunUi,
  ])

  useEffect(() => {
    if (!window.backgroundWindow?.onRunStopped) return undefined
    return window.backgroundWindow.onRunStopped(({ runId }) => {
      if (activeRunRef.current?.id === runId) stopStreaming()
    })
  }, [stopStreaming])

  /**
   * Main send message function
   * Uses composed provider-specific streaming hooks
   */
  const sendMessage = useCallback(
    async (content: string, files: AttachedFile[]) => {
      if ((!content.trim() && files.length === 0) || isLoading) return

      const run = new ChatRunController('send')
      activeRunRef.current = run
      clearToolState()
      setIsLoading(true)
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
        showToast(
          'Current model cannot analyze attached images. Switch to a vision-capable model or remove the images.',
          'warning'
        )
        finalizeChatRun(
          run,
          'failed',
          () => undefined,
          () => finishRunUi(run)
        )
        return
      }

      if (!targetSessionId) {
        targetSessionId = createSession()
        isNewSession = true
      }

      const outboundUserMessageId = addMessageToSession(targetSessionId, outboundUserMessage)
      const providerStartTime = performance.now()

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
        const effectiveStreamingSettings = streamingSettings

        const credentialError = getProviderCredentialError(effectiveStreamingSettings, provider)
        if (credentialError) {
          showToast(credentialError, 'error')
          trackRendererError('provider', 'credential_error')
          finalizeChatRun(
            run,
            'failed',
            () => undefined,
            () => finishRunUi(run)
          )
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

        run.transition('streaming')
        const streamResult = await runProviderStream(
          buildChatRunRequest({
            run,
            settings,
            sessionId: targetSessionId!,
            messageId: streamingMessageId,
            messages: providerMessages,
            contextTrace: optimizedContext.trace,
            providerStartTime,
            researchMaxRounds,
            forceWebSearch,
            enableTools: true,
            syncToStreamingContext: true,
            toolEventCallbacks: activeAgentRunRef.current
              ? {
                  requestToolApproval: requestApproval,
                  onToolApprovalStart: (toolCall) => {
                    if (!run.isFinalized && run.phase === 'streaming')
                      run.transition('awaiting_tool')
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
                    if (!run.isFinalized && run.phase === 'awaiting_tool' && !approved) {
                      run.transition('streaming')
                    }
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
                    if (!run.isFinalized && run.phase !== 'executing_tools') {
                      run.transition('executing_tools')
                    }
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
                    if (!run.isFinalized && run.phase === 'executing_tools') {
                      run.transition('streaming')
                    }
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
          })
        )

        // Commit streaming content to the session
        let assistantTextForMemory = ''
        finalizeChatRun(
          run,
          'completed',
          () => {
            const terminalAgentRun = finishAgentRun(activeAgentRunRef.current, 'completed')
            if (streamingMessageRef.current && terminalAgentRun) {
              publishAgentRun(
                streamingMessageRef.current.sessionId,
                streamingMessageRef.current.messageId,
                terminalAgentRun
              )
            }
            if (streamingMessageRef.current) {
              const finalState = completeStreaming()
              if (finalState.sessionId && finalState.messageId) {
                updateStreamingMessage(
                  finalState.sessionId,
                  finalState.messageId,
                  buildCommittedStreamingUpdates(finalState, streamResult, terminalAgentRun),
                  { persist: true }
                )
              }
              assistantTextForMemory =
                typeof finalState.content === 'string' ? finalState.content : ''
              streamingMessageRef.current = null
              activeAgentRunRef.current = undefined
            }
          },
          () => finishRunUi(run)
        )

        // Dreaming: fire-and-forget background memory extraction for this turn.
        // Gated by the Memory skill inside runMemoryExtraction; best-effort and
        // silent on failure so it never disrupts the chat.
        //
        // Deferral (Requirement 1.5): a brand-new session created earlier in
        // this call has no folderId (createSession() is invoked with no
        // folderId in this flow) and is trivially resolvable as global, even
        // though it hasn't reached the `sessions` array from context yet. For
        // any other session, the folder association must be definitively
        // resolvable — i.e. either no folderId (global chat) or a folderId
        // that matches a known folder — before extraction runs. When the
        // session can't be found at all, or it carries a folderId that no
        // longer matches any known folder (stale/removed folder), we defer
        // (skip) the write rather than silently persisting it as global.
        const folderAssociationResolvable =
          isNewSession || isFolderAssociationResolvable(sessions, targetSessionId, folders)
        if (
          targetSessionId &&
          typeof content === 'string' &&
          content.trim() &&
          folderAssociationResolvable
        ) {
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
        if (isChatRunAbort(error, run)) {
          // Stream was aborted by user - loading state already cleared by stopStreaming
          return
        }

        // Cancel isolated streaming on error
        const formattedError = formatProviderStreamError(
          error,
          normalizeActiveProviderId(settings.modelProvider),
          settings
        )
        trackRendererError('provider', formattedError.tone)
        const errorMsg = formattedError.message
        showToast(errorMsg, formattedError.tone)

        finalizeChatRun(
          run,
          'failed',
          () => {
            if (streamingMessageRef.current) {
              activeAgentRunRef.current = undefined
              deleteMessageFromSession(
                streamingMessageRef.current.sessionId,
                streamingMessageRef.current.messageId
              )
              cancelStreaming()
              streamingMessageRef.current = null
            }
            addMessageToSession(targetSessionId!, { role: 'assistant', content: errorMsg })
          },
          () => finishRunUi(run)
        )
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
      finishRunUi,
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

      const versions = buildRegenerationResponseVersions(message)

      const run = new ChatRunController('regenerate')
      activeRunRef.current = run
      clearToolState()
      setIsLoading(true)

      try {
        const session = sessions.find((s) => s.id === currentSessionId)
        if (!session) {
          showToast('Session not found', 'error')
          finalizeChatRun(
            run,
            'failed',
            () => undefined,
            () => finishRunUi(run)
          )
          return
        }

        const messageIndex = session.messages.findIndex((m) => m.id === message.id)
        if (messageIndex <= 0) {
          showToast('Cannot regenerate - no user message found', 'error')
          finalizeChatRun(
            run,
            'failed',
            () => undefined,
            () => finishRunUi(run)
          )
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
          finalizeChatRun(
            run,
            'failed',
            () => undefined,
            () => finishRunUi(run)
          )
          return
        }

        const effectiveProvider = normalizeActiveProviderId(effectiveSettings.modelProvider)
        const effectiveRegenerationSettings = buildStreamingSettings(effectiveSettings)
        const credentialError = getProviderCredentialError(
          effectiveRegenerationSettings,
          effectiveProvider
        )
        if (credentialError) {
          showToast(credentialError, 'error')
          finalizeChatRun(
            run,
            'failed',
            () => undefined,
            () => finishRunUi(run)
          )
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
          run.transition('streaming')
          const regenerationResult = await runProviderStream(
            buildChatRunRequest({
              run,
              settings: effectiveSettings,
              sessionId: currentSessionId,
              messageId: streamingMessageId,
              messages: apiMessages,
              contextTrace: optimizedContext.trace,
              providerStartTime: performance.now(),
              researchMaxRounds: 0,
              forceWebSearch: false,
              enableTools: false,
              syncToStreamingContext: false,
              includeImageModalities: true,
            })
          )

          finalizeChatRun(
            run,
            'completed',
            () => {
              updateStreamingMessage(
                currentSessionId,
                streamingMessageId,
                buildChatRunResultUpdates(regenerationResult),
                { persist: true }
              )
            },
            () => finishRunUi(run)
          )
        } catch (streamError: unknown) {
          // Silently handle abort (user clicked stop)
          if (isChatRunAbort(streamError, run)) {
            return
          }
          const formattedError = formatProviderStreamError(
            streamError,
            effectiveProvider,
            effectiveSettings
          )
          trackRendererError('provider', formattedError.tone)
          showToast(formattedError.message, formattedError.tone)
          finalizeChatRun(
            run,
            'failed',
            () => {
              deleteMessageFromSession(currentSessionId, streamingMessageId)
              addMessageToSession(currentSessionId, {
                role: 'assistant',
                content: message.content,
                model: message.model,
                thinking: message.thinking,
                responseVersions: message.responseVersions,
                currentVersionIndex: message.currentVersionIndex,
              })
            },
            () => finishRunUi(run)
          )
        }
      } catch (error: unknown) {
        // Silently handle abort (user clicked stop)
        if (isChatRunAbort(error, run)) {
          return
        }
        const effectiveProvider = normalizeActiveProviderId(settings.modelProvider)
        const formattedError = formatProviderStreamError(error, effectiveProvider, settings)
        trackRendererError('provider', formattedError.tone)
        showToast(formattedError.message, formattedError.tone)
        finalizeChatRun(
          run,
          'failed',
          () => undefined,
          () => finishRunUi(run)
        )
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
      finishRunUi,
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

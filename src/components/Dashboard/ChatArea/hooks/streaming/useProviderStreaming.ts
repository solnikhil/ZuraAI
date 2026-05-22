import { useCallback } from 'react'
import { useStreamingActions } from '../../../../../contexts/StreamingContext'
import type {
  FileAttachment,
  ThinkingBlock,
  ToolCallResult,
} from '../../../../../chat/types'
import type { ReasoningDetail, ServiceAssistantMessage } from '../../../../../services/types'
import { cleanSonarResponse } from '../../../../../services/perplexity'
import {
  providerSupportsTools,
  providerUsesNativeSearch,
  type ActiveProviderId,
} from '../../../../../providers'
import { extractInlineToolCallsFromContent } from '../../../../../tools/adapters/openrouterToolCalls'
import { emptyUsage } from '../../../../../providers/providerRuntimeTypes'
import {
  SAFETY_CAP,
  MAX_RESEARCH_ROUNDS,
  accumulateDeltaToolCalls,
  appendCompletedThinkingBlock,
  buildFinalSynthesisMessages,
  buildFollowUpMessages,
  buildPlainTextOnlySynthesisMessages,
  buildRecoverySynthesisMessages,
  buildSearchSynthesisFailureMessage,
  buildResponseWithFallback,
  buildThinkingBlocksFromResults,
  shouldRetryUngroundedSearchSynthesis,
  computeStreamMetrics,
  fillMissingUsage,
  getStreamingUpdateInterval,
  getThinkingTranscript,
  hasSearchResults,
  mergeSavedToolResults,
  processInitialToolResults,
  publishStreamingToolResults,
  reconstructToolCallMessage,
  stripStandaloneHorizontalRule,
  type DeltaToolCall,
} from './streamingUtils'
import { createProviderStreamClient } from './providerStreamClient'
import {
  appendChatDiagnosticEvent,
  summarizeDiagnosticMessages,
  summarizeDiagnosticToolResult,
} from '../../../../../diagnostics/chatDiagnosticsClient'
import {
  evaluateResearchContinuation,
  getEffectiveSearchBudget,
} from './researchLoopPolicy'
import type {
  HandleToolCallsOptions,
  NormalizedUsage,
  StreamingResult,
  StreamingSettings,
  ToolCallingHook,
  UpdateStreamingCallback,
} from './types'
import type { ChatDiagnosticRequestShape } from '../../../../../diagnostics/chatDiagnostics'
import { createStreamChunkCoalescer } from '../../../../../diagnostics/streamChunkCoalescer'

export interface ProviderStreamingRunOptions {
  provider: ActiveProviderId
  model: string
  settingsOverride?: StreamingSettings
  sessionId: string
  messageId: string
  messages: Array<ServiceAssistantMessage & { images?: string[]; thinking?: string }>
  contextTrace?: import('../../../../../utils/tokenUtils').ContextOptimizationTrace
  startTime: number
  researchMaxRounds: number
  forceWebSearch?: boolean
  signal?: AbortSignal
  enableTools?: boolean
  syncToStreamingContext?: boolean
  modalities?: Array<'text' | 'image'>
  reasoning?: {
    max_tokens?: number
    effort?: 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none'
    exclude?: boolean
    enabled?: boolean
  }
  enableThinking?: boolean
  imageConfig?: {
    aspect_ratio?: string
    image_size?: string
  }
  toolEventCallbacks?: HandleToolCallsOptions
}

export interface UseProviderStreamingOptions {
  settings: StreamingSettings
  toolCalling: ToolCallingHook
  updateStreamingMessage: UpdateStreamingCallback
  flushThrottledUpdates: () => void
  throttledUpdateStreamingMessage: UpdateStreamingCallback
}

export interface UseProviderStreamingReturn {
  runProviderStream: (options: ProviderStreamingRunOptions) => Promise<StreamingResult>
}


function mergeUsage(existing: NormalizedUsage, incoming: NormalizedUsage): NormalizedUsage {
  return {
    inputTokens: (existing.inputTokens || 0) + (incoming.inputTokens || 0),
    outputTokens: (existing.outputTokens || 0) + (incoming.outputTokens || 0),
    totalTokens: (existing.totalTokens || 0) + (incoming.totalTokens || 0),
    thinkingTokens: (existing.thinkingTokens || 0) + (incoming.thinkingTokens || 0) || undefined,
    cachedInputTokens:
      (existing.cachedInputTokens || 0) + (incoming.cachedInputTokens || 0) || undefined,
    cachedOutputTokens:
      (existing.cachedOutputTokens || 0) + (incoming.cachedOutputTokens || 0) || undefined,
    cacheMissInputTokens:
      (existing.cacheMissInputTokens || 0) + (incoming.cacheMissInputTokens || 0) || undefined,
    cacheWriteInputTokens:
      (existing.cacheWriteInputTokens || 0) + (incoming.cacheWriteInputTokens || 0) || undefined,
  }
}

const TOOL_MARKUP_PREVIEW_LIMIT = 240

function logToolMarkupLeak(
  event:
    | 'detected'
    | 'recovered'
    | 'suppressed-during-no-tools-pass'
    | 'recovery-failed',
  details: Record<string, unknown>
): void {
  console.warn('[tool-markup-leak]', event, details)
}

function mergeGeneratedFiles(existing: FileAttachment[], incoming: FileAttachment[]): FileAttachment[] {
  if (incoming.length === 0) return existing

  const merged = [...existing]
  const seen = new Set(existing.map((file) => file.data))
  for (const file of incoming) {
    if (seen.has(file.data)) continue
    seen.add(file.data)
    merged.push(file)
  }

  return merged
}

function extractWebSearchQueries(toolResults: ToolCallResult[] | undefined): string[] {
  return (toolResults || [])
    .filter((result) => result.toolCall.name === 'web_search')
    .map((result) => String(result.toolCall.arguments?.query || '').trim())
    .filter(Boolean)
}

function getUserContextText(
  messages: ProviderStreamingRunOptions['messages']
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user') continue

    if (typeof message.content === 'string') {
      return message.content
    }

    return message.content
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text?.trim() || '')
      .filter(Boolean)
      .join(' ')
  }

  return ''
}

function countCacheMarkers(messages: ProviderStreamingRunOptions['messages']): number {
  return messages.reduce((count, message) => {
    if (!Array.isArray(message.content)) return count
    return count + message.content.filter((part) => Boolean(part.cache_control)).length
  }, 0)
}

function buildRequestShape(
  messages: ProviderStreamingRunOptions['messages'],
  toolCount: number,
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
): ChatDiagnosticRequestShape {
  return {
    roleOrder: messages.map((message) => message.role),
    textLengths: messages.map((message) => {
      if (typeof message.content === 'string') return message.content.length
      return message.content
        .filter((part) => part.type === 'text' && typeof part.text === 'string')
        .reduce((total, part) => total + (part.text?.length || 0), 0)
    }),
    contentTypes: messages.map((message) => {
      if (typeof message.content === 'string') return message.content ? 'text' : 'empty'
      return message.content.length > 0 ? 'parts' : 'empty'
    }),
    partTypes: messages.map((message) =>
      Array.isArray(message.content) ? message.content.map((part) => part.type) : []
    ),
    hasReasoning: messages.map((message) => Boolean(message.reasoning)),
    hasThinking: messages.map((message) => Boolean(message.thinking)),
    toolCount,
    toolChoice: typeof toolChoice === 'string'
      ? toolChoice
      : toolChoice && typeof toolChoice === 'object'
        ? 'function'
        : undefined,
    cacheMarkerCount: countCacheMarkers(messages),
  }
}

function buildResearchStatus(
  currentRound: number,
  maxRounds: number,
  isSearching: boolean,
  currentSearches?: string[]
) {
  const normalizedSearches = (currentSearches || []).filter(Boolean)
  return {
    currentRound,
    maxRounds,
    currentSearch: normalizedSearches[0],
    currentSearches: normalizedSearches.length > 0 ? normalizedSearches : undefined,
    isSearching,
  }
}

interface VisibleAnswerRound {
  content: string
  usage: NormalizedUsage
  firstTokenTime: number | null
}

interface SynthesisContext {
  lastAssistantMessage: ServiceAssistantMessage
  formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
  totalSearchCount: number
  researchRound: number
  stopReason?: 'budget' | 'empty-batch' | 'sufficient-results'
}

export function useProviderStreaming({
  settings,
  toolCalling,
  updateStreamingMessage,
  flushThrottledUpdates,
  throttledUpdateStreamingMessage,
}: UseProviderStreamingOptions): UseProviderStreamingReturn {
  const { updateStreaming } = useStreamingActions()
  const updateInterval = getStreamingUpdateInterval()
  const shouldLogResearchLoop = import.meta.env.DEV
  const shouldLogOpenRouterDebug = settings.openRouterDebug === true

  const logResearchLoop = (event: string, details?: Record<string, unknown>) => {
    if (!shouldLogResearchLoop) return

    console.debug('[research-loop]', event, details || {})
  }

  const logOpenRouterDebug = (event: string, details?: Record<string, unknown>) => {
    if (!shouldLogOpenRouterDebug) return

    console.debug('[openrouter-debug]', event, details || {})
  }

  const runProviderStream = useCallback(
    async (options: ProviderStreamingRunOptions): Promise<StreamingResult> => {
      const provider = options.provider
      const model = options.model
      const runtimeSettings = options.settingsOverride ?? settings
      const client = createProviderStreamClient(runtimeSettings, provider)
      const supportsExternalTools = providerSupportsTools(provider)
      const toolsAvailable = options.enableTools !== false && toolCalling.canUseTools && supportsExternalTools
      const tools = toolsAvailable ? toolCalling.getToolsForRequest() : null
      const effectiveSearchBudget = getEffectiveSearchBudget(
        options.researchMaxRounds,
        SAFETY_CAP,
        MAX_RESEARCH_ROUNDS
      )

      const logDiagnostic = (event: Omit<Parameters<typeof appendChatDiagnosticEvent>[0], 'sessionId' | 'messageId' | 'timestamp' | 'provider' | 'model'>) => {
        appendChatDiagnosticEvent({
          sessionId: options.sessionId,
          messageId: options.messageId,
          timestamp: Date.now(),
          provider,
          model,
          ...event,
        })
      }

      // Coalesce provider deltas into batched stream-chunk diagnostic events.
      // Disabled outside dev so production builds stay quiet.
      const streamChunkCoalescer = createStreamChunkCoalescer({
        enabled: import.meta.env.DEV,
        emit: (streamChunk) => {
          logDiagnostic({
            phase: 'stream-chunk',
            streamChunk,
          })
        },
      })

      const buildToolDiagnosticsCallbacks = (
        executionPolicy: HandleToolCallsOptions['executionPolicy']
      ): HandleToolCallsOptions => ({
        ...options.toolEventCallbacks,
        executionPolicy,
        onToolStart: (toolCall) => {
          logDiagnostic({
            phase: 'tool-start',
            tool: {
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.arguments,
            },
          })
          options.toolEventCallbacks?.onToolStart?.(toolCall)
        },
        onToolComplete: (result) => {
          logDiagnostic({
            phase: 'tool-complete',
            tool: summarizeDiagnosticToolResult(result),
          })
          options.toolEventCallbacks?.onToolComplete?.(result)
        },
      })

      let accumulatedContent = ''
      let generatedFiles: FileAttachment[] = []
      let lastUpdateTime = Date.now()
      let finalVisibleAnswerRound: VisibleAnswerRound | null = null
      let savedToolResults: ToolCallResult[] | undefined
      let localThinkingBlocks: ThinkingBlock[] = []
      let finishReason: string | null = null
      let finalAnswerForcedFailure = false
      let activeThinking = ''
      let activeThinkingStartTime: number | null = null
      let citations: string[] = []

      const throwIfAborted = () => {
        if (options.signal?.aborted) {
          throw new DOMException('Streaming aborted', 'AbortError')
        }
      }

      const shouldRecoverSearchSynthesis = (content: string) =>
        !content.trim() || shouldRetryUngroundedSearchSynthesis(content)

      const updateStreamingState = (updates: Record<string, unknown>) => {
        if (options.signal?.aborted) return
        if (options.syncToStreamingContext !== false) {
          updateStreaming(updates)
        }
      }

      const updatePersistedStreamingMessage: UpdateStreamingCallback = (
        sessionId,
        messageId,
        updates
      ) => {
        if (options.signal?.aborted) return
        updateStreamingMessage(sessionId, messageId, updates)
      }

      const flushActiveThrottledUpdates = () => {
        if (options.signal?.aborted) return
        flushThrottledUpdates()
      }

      const persistProgress = () => {
        if (options.signal?.aborted) return
        const now = Date.now()
        if (now - lastUpdateTime < updateInterval) return

        throttledUpdateStreamingMessage(options.sessionId, options.messageId, {
          content: accumulatedContent,
          thinking: activeThinking || undefined,
          thinkingDuration: activeThinkingStartTime !== null
            ? performance.now() - activeThinkingStartTime
            : undefined,
          thinkingBlocks: localThinkingBlocks,
          files: generatedFiles,
          toolResults: savedToolResults,
        })
        lastUpdateTime = now
      }

      const finalizeActiveThinking = () => {
        if (!activeThinking.trim()) return false

        const thinkingEndTime = performance.now()
        const thinkingDuration = activeThinkingStartTime !== null
          ? thinkingEndTime - activeThinkingStartTime
          : undefined

        localThinkingBlocks = appendCompletedThinkingBlock(
          localThinkingBlocks,
          activeThinking,
          thinkingDuration
        )
        activeThinking = ''
        activeThinkingStartTime = null
        return true
      }

      const publishCompletedThinking = () => {
        const completedThinkingUpdate = {
          thinking: undefined,
          thinkingDuration: undefined,
          thinkingBlocks: localThinkingBlocks,
        }
        updateStreamingState(completedThinkingUpdate)
        updatePersistedStreamingMessage(options.sessionId, options.messageId, completedThinkingUpdate)
      }

      const resetAccumulatedAnswerForRetry = () => {
        accumulatedContent = ''
        finalVisibleAnswerRound = null
        updateStreamingState({
          content: '',
          phase: 'reasoning',
        })
        updatePersistedStreamingMessage(options.sessionId, options.messageId, {
          content: '',
        })
      }

      const runRound = async (
        roundMessages: ProviderStreamingRunOptions['messages'],
        roundOptions?: {
          round?: number
          toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
          tools?: ReturnType<ToolCallingHook['getToolsForRequest']>
        }
      ) => {
        const roundStartContent = accumulatedContent
        const roundTools = roundOptions?.tools === undefined ? tools : roundOptions.tools
        const roundAllowsTools =
          Array.isArray(roundTools) && roundTools.length > 0 && roundOptions?.toolChoice !== 'none'
        const roundType = roundAllowsTools ? 'tool-enabled' : 'no-tools'
        let roundContent = ''
        let roundToolCalls: DeltaToolCall[] = []
        let roundReasoningDetails: ReasoningDetail[] = []
        let roundFinishReason: string | null = null
        let roundUsage = emptyUsage()
        let roundFirstTokenTime: number | null = null
        let strippedToolPrelude = false
        let suppressedInlineToolMarkup = false

        throwIfAborted()
        logDiagnostic({
          phase: 'round-start',
          round: roundOptions?.round,
          roundType,
          messageCount: roundMessages.length,
        })
        logDiagnostic({
          phase: 'request-shape',
          round: roundOptions?.round,
          roundType,
          requestShape: buildRequestShape(
            roundMessages,
            Array.isArray(roundTools) ? roundTools.length : 0,
            roundOptions?.toolChoice
          ),
        })

        const persistToolPreludeAsThinkingBlock = () => {
          if (accumulatedContent === roundStartContent) return

          const toolPrelude = accumulatedContent.slice(roundStartContent.length).trim()
          if (!toolPrelude) return

          localThinkingBlocks = appendCompletedThinkingBlock(localThinkingBlocks, toolPrelude)
        }

        try {
          for await (const event of client.stream({
            provider,
            model,
            messages: roundMessages,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            streamResponses: settings.streamResponses,
            tools: roundTools,
            toolChoice: roundOptions?.toolChoice,
            modalities: options.modalities,
            reasoning: options.reasoning,
            enableThinking: options.enableThinking,
            imageConfig: options.imageConfig,
            sessionId: options.sessionId,
            signal: options.signal,
          })) {
            throwIfAborted()

            switch (event.type) {
              case 'text-delta':
                if (!roundFirstTokenTime && event.delta) {
                  roundFirstTokenTime = performance.now()
                }

                if (event.delta && activeThinking) {
                  finalizeActiveThinking()
                  publishCompletedThinking()
                }

                accumulatedContent += event.delta
                roundContent += event.delta
                if (event.delta) {
                  streamChunkCoalescer.recordTextDelta(event.delta, accumulatedContent.length)
                  updateStreamingState({
                    phase: 'answering',
                    // Keep the isolated active-message view in sync on every delta.
                    // Persisted chat-history writes stay throttled separately.
                    content: accumulatedContent,
                  })
                }
                persistProgress()
                break
              case 'reasoning-delta':
                if (!roundFirstTokenTime && event.delta) {
                  roundFirstTokenTime = performance.now()
                }
                if (activeThinkingStartTime === null) {
                  activeThinkingStartTime = performance.now()
                }
                activeThinking += event.delta
                const thinkingDuration = activeThinkingStartTime !== null
                  ? performance.now() - activeThinkingStartTime
                  : undefined
                updateStreamingState({
                  phase: 'reasoning',
                  thinking: activeThinking,
                  thinkingDuration,
                  thinkingBlocks: localThinkingBlocks,
                  files: generatedFiles,
                })
                persistProgress()
                break
              case 'reasoning-details':
                roundReasoningDetails.push(...event.details)
                break
              case 'tool-call-delta':
                if (activeThinking) {
                  finalizeActiveThinking()
                  publishCompletedThinking()
                }
                if (!strippedToolPrelude && accumulatedContent !== roundStartContent) {
                  strippedToolPrelude = true
                  persistToolPreludeAsThinkingBlock()
                  accumulatedContent = roundStartContent
                  updateStreamingState({
                    content: accumulatedContent,
                    thinking: undefined,
                    thinkingDuration: undefined,
                    thinkingBlocks: localThinkingBlocks,
                  })
                  updatePersistedStreamingMessage(options.sessionId, options.messageId, {
                    content: accumulatedContent,
                    thinking: undefined,
                    thinkingDuration: undefined,
                    thinkingBlocks: localThinkingBlocks,
                  })
                }
                accumulateDeltaToolCalls(roundToolCalls, event.delta)
                streamChunkCoalescer.recordToolCallDelta(
                  Array.isArray(event.delta) ? event.delta.length : 1
                )
                break
              case 'file-delta':
                generatedFiles = mergeGeneratedFiles(generatedFiles, event.files)
                updateStreamingState({ files: generatedFiles })
                persistProgress()
                break
              case 'usage':
                roundUsage = mergeUsage(roundUsage, event.usage)
                logDiagnostic({ phase: 'usage', round: roundOptions?.round, roundType, usage: event.usage, rawUsage: event.rawUsage })
                break
              case 'finish':
                roundFinishReason = event.finishReason || null
                break
              case 'citation':
                citations = [...new Set([...citations, ...event.citations])]
                break
              case 'error':
                throw event.error
            }
          }
        } catch (streamError: unknown) {
          if (!(streamError instanceof DOMException && streamError.name === 'AbortError')) {
            streamChunkCoalescer.flush()
            logDiagnostic({
              phase: 'provider-error',
              error: streamError instanceof Error ? streamError.message : String(streamError),
            })
          }
          throw streamError
        }

        throwIfAborted()

        if (activeThinking) {
          finalizeActiveThinking()
        }

        flushActiveThrottledUpdates()
        throwIfAborted()
        const hasValidRoundToolCalls = roundToolCalls.some((toolCall) => toolCall?.id)
        if (roundFinishReason === 'tool_calls' && hasValidRoundToolCalls) {
          accumulatedContent = roundStartContent
        }
        let finalRoundContent = providerUsesNativeSearch(provider)
          ? cleanSonarResponse(accumulatedContent, citations)
          : accumulatedContent

        if (!hasValidRoundToolCalls) {
          const extracted = extractInlineToolCallsFromContent(finalRoundContent, {
            lastUserMessage: getUserContextText(roundMessages),
            reasoning: getThinkingTranscript(localThinkingBlocks),
          })

          if (extracted.hadMarkup) {
            logToolMarkupLeak('detected', {
              provider,
              model,
              roundType,
              format: extracted.format,
              rawPreview: extracted.rawPreview.slice(0, TOOL_MARKUP_PREVIEW_LIMIT),
            })

            finalRoundContent = extracted.cleanedContent

            if (roundAllowsTools && extracted.toolCalls.length > 0) {
              if (provider === 'openrouter') {
                logOpenRouterDebug('xml-tool-call-recovered', {
                  model,
                  toolNames: extracted.toolCalls.map((toolCall) => toolCall.name),
                  cleanedContentLength: extracted.cleanedContent.length,
                  rawContentPreview: extracted.rawPreview.slice(0, TOOL_MARKUP_PREVIEW_LIMIT),
                })
              }

              roundToolCalls = extracted.toolCalls.map((toolCall, index) => ({
                index,
                id: toolCall.id,
                type: 'function',
                function: {
                  name: toolCall.name,
                  arguments: JSON.stringify(toolCall.arguments),
                },
              }))
              roundFinishReason = 'tool_calls'
              logToolMarkupLeak('recovered', {
                provider,
                model,
                roundType,
                format: extracted.format,
                toolNames: extracted.recoveredToolNames,
                cleanedContentLength: extracted.cleanedContent.length,
                rawPreview: extracted.rawPreview.slice(0, TOOL_MARKUP_PREVIEW_LIMIT),
              })
            } else if (!roundAllowsTools) {
              suppressedInlineToolMarkup = true
              logToolMarkupLeak('suppressed-during-no-tools-pass', {
                provider,
                model,
                roundType,
                format: extracted.format,
                toolNames: extracted.recoveredToolNames,
                cleanedContentLength: extracted.cleanedContent.length,
                rawPreview: extracted.rawPreview.slice(0, TOOL_MARKUP_PREVIEW_LIMIT),
              })
            } else {
              logToolMarkupLeak('recovery-failed', {
                provider,
                model,
                roundType,
                format: extracted.format,
                reason: 'markup-detected-but-no-tool-calls-recovered',
                cleanedContentLength: extracted.cleanedContent.length,
                rawPreview: extracted.rawPreview.slice(0, TOOL_MARKUP_PREVIEW_LIMIT),
              })
            }
          }
        }

        updateStreamingState({
          content: finalRoundContent,
          phase: 'answering',
          thinking: undefined,
          thinkingDuration: undefined,
          thinkingBlocks: localThinkingBlocks,
          files: generatedFiles,
        })
        updatePersistedStreamingMessage(options.sessionId, options.messageId, {
          content: finalRoundContent,
          thinking: undefined,
          thinkingDuration: undefined,
          thinkingBlocks: localThinkingBlocks,
          files: generatedFiles,
          toolResults: savedToolResults,
        })

        accumulatedContent = finalRoundContent
        if (roundFinishReason) {
          finishReason = roundFinishReason
        }

        if (roundFinishReason !== 'tool_calls' && finalRoundContent.trim() && !suppressedInlineToolMarkup) {
          finalVisibleAnswerRound = {
            content: finalRoundContent,
            usage: roundUsage,
            firstTokenTime: roundFirstTokenTime,
          }
        }

        const returnedRoundContent = finalRoundContent.startsWith(roundStartContent)
          ? finalRoundContent.slice(roundStartContent.length)
          : finalRoundContent

        streamChunkCoalescer.flush()
        logDiagnostic({
          phase: 'round-finish',
          round: roundOptions?.round,
          roundType,
          finishReason: roundFinishReason || undefined,
          usage: roundUsage,
        })

        return {
          roundContent: returnedRoundContent,
          roundToolCalls,
          roundReasoningDetails,
          roundFinishReason,
          suppressedInlineToolMarkup,
        }
      }

      const runNoToolsSynthesisAttempt = async (
        synthesisContext: SynthesisContext,
        mode: 'final' | 'recovery' | 'plain-text-only'
      ) => {
        throwIfAborted()
        const researchContext = toolCalling.getResearchContext(
          synthesisContext.totalSearchCount,
          options.researchMaxRounds
        )

        const synthesisMessages =
          mode === 'final'
            ? buildFinalSynthesisMessages(
                researchContext,
                synthesisContext.researchRound,
                synthesisContext.totalSearchCount,
                options.messages,
                synthesisContext.lastAssistantMessage,
                synthesisContext.formattedResults,
                synthesisContext.stopReason
              )
            : mode === 'recovery'
              ? buildRecoverySynthesisMessages(
                  researchContext,
                  synthesisContext.researchRound,
                  synthesisContext.totalSearchCount,
                  options.messages,
                  synthesisContext.lastAssistantMessage,
                  synthesisContext.formattedResults
                )
              : buildPlainTextOnlySynthesisMessages(
                  researchContext,
                  synthesisContext.researchRound,
                  synthesisContext.totalSearchCount,
                  options.messages,
                  synthesisContext.lastAssistantMessage,
                  synthesisContext.formattedResults
                )

        updateStreamingState({
          phase: 'reasoning',
          researchStatus: buildResearchStatus(
            synthesisContext.researchRound,
            options.researchMaxRounds,
            false
          ),
        })
        return await runRound(synthesisMessages, {
          round: synthesisContext.researchRound,
          tools: null,
          toolChoice: 'none',
        })
      }

      const initialToolChoice =
        options.forceWebSearch &&
        tools?.some((tool) => tool.function?.name === 'web_search')
          ? { type: 'function' as const, function: { name: 'web_search' } }
          : undefined

      logDiagnostic({
        phase: 'request-start',
        messageCount: options.messages.length,
        messages: summarizeDiagnosticMessages(options.messages),
      })
      if (options.contextTrace) {
        logDiagnostic({
          phase: 'context-optimized',
          context: options.contextTrace,
        })
      }

      throwIfAborted()
      const initialRound = await runRound(options.messages, {
        round: 0,
        toolChoice: initialToolChoice,
      })
      throwIfAborted()
      const userContextText = getUserContextText(options.messages)

      if (
        toolsAvailable &&
        finishReason === 'tool_calls' &&
        initialRound.roundToolCalls.filter((toolCall) => toolCall?.id).length > 0
      ) {
            const reconstructedMessage = reconstructToolCallMessage(
              initialRound.roundContent,
              initialRound.roundToolCalls,
              {
                reasoning: getThinkingTranscript(localThinkingBlocks),
                reasoningDetails: initialRound.roundReasoningDetails,
              }
            )
        let toolResult = await toolCalling.handleToolCalls(
          buildResponseWithFallback(
            reconstructedMessage,
            options.messages,
            getThinkingTranscript(localThinkingBlocks)
          ),
          {
            ...buildToolDiagnosticsCallbacks({
              remainingWebSearchBudget: effectiveSearchBudget,
              priorWebSearchQueries: [],
              userContextText,
            }),
          }
        )
        throwIfAborted()
        const initialAttemptedSearchQueries = extractWebSearchQueries(toolResult.toolResults)
        const initialExecutedSearchQueries =
          toolResult.executionSummary.executedWebSearchQueries || []

        logResearchLoop('initial-tool-result', {
          provider,
          model,
          sessionId: options.sessionId,
          searchCount: toolResult.executionSummary.executedWebSearchCount || 0,
          needsFollowUp: toolResult.needsFollowUp,
          toolNames: (toolResult.toolResults || []).map((result) => result.toolCall.name),
        })

        const processed = processInitialToolResults(toolResult.toolResults || [], localThinkingBlocks)
        localThinkingBlocks = processed.updatedThinkingBlocks
        savedToolResults = processed.savedToolResults
        publishStreamingToolResults(
          updateStreamingState,
          updatePersistedStreamingMessage,
          options.sessionId,
          options.messageId,
          savedToolResults,
          localThinkingBlocks
        )

        if (processed.hasSearchCalls) {
          const researchStatus = buildResearchStatus(
            1,
            options.researchMaxRounds,
            false,
            initialExecutedSearchQueries
          )
          updateStreamingState({ phase: 'reasoning', researchStatus, thinkingBlocks: localThinkingBlocks })
          updatePersistedStreamingMessage(options.sessionId, options.messageId, {
            researchStatus,
            thinkingBlocks: localThinkingBlocks,
          })
        }

        if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
          let totalSearchCount = toolResult.executionSummary.executedWebSearchCount || 0
          const searchQueryHistory = [...initialExecutedSearchQueries]
          let lastAssistantMessage = reconstructedMessage
          let researchRound = 1
          let didRunFinalSynthesis = false
          let pendingFinalSynthesis: SynthesisContext | null = null
          let lastSynthesisContext: SynthesisContext = {
            lastAssistantMessage: reconstructedMessage,
            formattedResults: toolResult.formattedResults,
            totalSearchCount,
            researchRound,
          }
          const initialLoopDecision = evaluateResearchContinuation({
            searchCount: totalSearchCount,
            maxRounds: options.researchMaxRounds,
            priorQueries: [],
            nextQueries: initialAttemptedSearchQueries,
            safetyCap: SAFETY_CAP,
            practicalCap: MAX_RESEARCH_ROUNDS,
          })

          logResearchLoop('loop-start', {
            provider,
            model,
            totalSearchCount,
            researchRound,
            initialQueries: searchQueryHistory,
            initialDecision: initialLoopDecision.reason || 'continue',
          })

          const shouldSynthesizeAfterInitialBatch =
            initialLoopDecision.shouldForceFinalSynthesis ||
            toolResult.shouldContinueResearch === false

          if (
            shouldSynthesizeAfterInitialBatch &&
            toolResult.needsFollowUp &&
            toolResult.formattedResults.length > 0
          ) {
            pendingFinalSynthesis = {
              lastAssistantMessage: reconstructedMessage,
              formattedResults: toolResult.formattedResults,
              totalSearchCount,
              researchRound,
              stopReason: initialLoopDecision.reason || 'sufficient-results',
            }
            logResearchLoop('final-synthesis-scheduled', {
              reason: initialLoopDecision.reason || 'sufficient-tool-results',
              totalSearchCount,
              researchRound,
            })
            toolResult = {
              ...toolResult,
              needsFollowUp: false,
            }
          }

          while (toolResult.needsFollowUp && researchRound < SAFETY_CAP) {
            logResearchLoop('follow-up-round-start', {
              researchRound,
              totalSearchCount,
              priorQueries: searchQueryHistory,
            })

            throwIfAborted()
            const followUpMessages = buildFollowUpMessages(
              toolCalling.getResearchContext(totalSearchCount, options.researchMaxRounds),
              researchRound,
              totalSearchCount,
              options.messages,
              lastAssistantMessage,
              toolResult.formattedResults
            )

            updateStreamingState({
              phase: 'reasoning',
              researchStatus: buildResearchStatus(
                researchRound,
                options.researchMaxRounds,
                false
              ),
            })

            const followUpRound = await runRound(followUpMessages, { round: researchRound })
            throwIfAborted()
            const hasValidToolCalls =
              followUpRound.roundToolCalls.length > 0 &&
              followUpRound.roundToolCalls.some((toolCall) => toolCall?.function?.name)

            if (!hasValidToolCalls) {
              logResearchLoop('follow-up-round-ended-without-tool-call', {
                researchRound,
                totalSearchCount,
                hasAnswerText: Boolean(followUpRound.roundContent.trim()),
              })
              if (!followUpRound.roundContent.trim() && toolResult.formattedResults.length > 0) {
                pendingFinalSynthesis = {
                  lastAssistantMessage,
                  formattedResults: toolResult.formattedResults,
                  totalSearchCount,
                  researchRound,
                }
                logResearchLoop('final-synthesis-scheduled', {
                  reason: 'empty-follow-up-answer',
                  totalSearchCount,
                  researchRound,
                })
              }
              break
            }

            const reconstructedFollowUp = reconstructToolCallMessage(
              followUpRound.roundContent,
              followUpRound.roundToolCalls,
              {
                reasoning: getThinkingTranscript(localThinkingBlocks),
                reasoningDetails: followUpRound.roundReasoningDetails,
              }
            )
            lastAssistantMessage = reconstructedFollowUp
            const nextToolResult = await toolCalling.handleToolCalls(
              buildResponseWithFallback(
                reconstructedFollowUp,
                options.messages,
                getThinkingTranscript(localThinkingBlocks)
              ),
              {
                ...buildToolDiagnosticsCallbacks({
                  remainingWebSearchBudget: Math.max(0, effectiveSearchBudget - totalSearchCount),
                  priorWebSearchQueries: [...searchQueryHistory],
                  userContextText,
                }),
              }
            )
            throwIfAborted()

            const attemptedSearchQueries = extractWebSearchQueries(nextToolResult.toolResults)
            const executedSearchQueries =
              nextToolResult.executionSummary.executedWebSearchQueries || []
            const newWebSearches = nextToolResult.executionSummary.executedWebSearchCount || 0
            totalSearchCount += newWebSearches
            lastSynthesisContext = {
              lastAssistantMessage: reconstructedFollowUp,
              formattedResults: nextToolResult.formattedResults,
              totalSearchCount,
              researchRound,
              stopReason: continuationDecision.reason || 'sufficient-results',
            }

            logResearchLoop('follow-up-tool-result', {
              researchRound,
              newWebSearches,
              totalSearchCount,
              nextQueries: attemptedSearchQueries,
              needsFollowUp: nextToolResult.needsFollowUp,
            })

            localThinkingBlocks = buildThinkingBlocksFromResults(
              nextToolResult.toolResults || [],
              localThinkingBlocks
            )
            savedToolResults = mergeSavedToolResults(
              savedToolResults,
              nextToolResult.toolResults || []
            )
            publishStreamingToolResults(
              updateStreamingState,
              updatePersistedStreamingMessage,
              options.sessionId,
              options.messageId,
              savedToolResults,
              localThinkingBlocks
            )

            updateStreamingState({
              phase: 'reasoning',
              thinkingBlocks: localThinkingBlocks,
              researchStatus: buildResearchStatus(
                researchRound,
                options.researchMaxRounds,
                false,
                executedSearchQueries
              ),
            })

            researchRound += 1
            const continuationDecision = evaluateResearchContinuation({
              searchCount: totalSearchCount,
              maxRounds: options.researchMaxRounds,
              priorQueries: searchQueryHistory,
              nextQueries: attemptedSearchQueries,
              safetyCap: SAFETY_CAP,
              practicalCap: MAX_RESEARCH_ROUNDS,
            })
            searchQueryHistory.push(...executedSearchQueries)

            const shouldSynthesizeAfterFollowUpBatch =
              continuationDecision.shouldForceFinalSynthesis ||
              nextToolResult.shouldContinueResearch === false

            if (
              shouldSynthesizeAfterFollowUpBatch &&
              nextToolResult.needsFollowUp &&
              nextToolResult.formattedResults.length > 0
            ) {
              pendingFinalSynthesis = {
                lastAssistantMessage: reconstructedFollowUp,
                formattedResults: nextToolResult.formattedResults,
                totalSearchCount,
                researchRound,
              }
              logResearchLoop('final-synthesis-scheduled', {
                reason: continuationDecision.reason || 'sufficient-tool-results',
                totalSearchCount,
                researchRound,
              })
              toolResult = {
                ...nextToolResult,
                needsFollowUp: false,
              }
              break
            }

            toolResult = nextToolResult
          }

          if (pendingFinalSynthesis) {
            didRunFinalSynthesis = true
            logResearchLoop('final-synthesis-start', {
              totalSearchCount: pendingFinalSynthesis.totalSearchCount,
              researchRound: pendingFinalSynthesis.researchRound,
            })
            const finalSynthesisRound = await runNoToolsSynthesisAttempt(pendingFinalSynthesis, 'final')
            throwIfAborted()
            logResearchLoop('final-synthesis-complete', {
              totalSearchCount: pendingFinalSynthesis.totalSearchCount,
              researchRound: pendingFinalSynthesis.researchRound,
            })

            updateStreamingState({
              phase: 'answering',
              researchStatus: buildResearchStatus(
                pendingFinalSynthesis.researchRound,
                options.researchMaxRounds,
                false
              ),
            })
            updatePersistedStreamingMessage(options.sessionId, options.messageId, {
              researchStatus: buildResearchStatus(
                pendingFinalSynthesis.researchRound,
                options.researchMaxRounds,
                false
              ),
            })

            if (finalSynthesisRound.suppressedInlineToolMarkup) {
              resetAccumulatedAnswerForRetry()
            }
          }

          if (
            hasSearchResults(savedToolResults) &&
            shouldRecoverSearchSynthesis(accumulatedContent) &&
            lastSynthesisContext.formattedResults.length > 0
          ) {
            const recoveryReason = !accumulatedContent.trim() ? 'blank-answer' : 'ungrounded-answer'
            logResearchLoop('final-synthesis-recovery', {
              totalSearchCount: lastSynthesisContext.totalSearchCount,
              researchRound: lastSynthesisContext.researchRound,
              afterPriorSynthesis: didRunFinalSynthesis,
              reason: recoveryReason,
            })

            const recoveryModes: Array<'final' | 'recovery' | 'plain-text-only'> = didRunFinalSynthesis
              ? ['recovery', 'plain-text-only']
              : ['final', 'recovery', 'plain-text-only']

            if (accumulatedContent.trim()) {
              resetAccumulatedAnswerForRetry()
            }

            for (const mode of recoveryModes) {
              const recoveryRound = await runNoToolsSynthesisAttempt(lastSynthesisContext, mode)
              throwIfAborted()
              const needsRetry =
                recoveryRound.roundFinishReason === 'tool_calls' ||
                recoveryRound.suppressedInlineToolMarkup ||
                shouldRecoverSearchSynthesis(accumulatedContent)

              if (!needsRetry) {
                break
              }

              logResearchLoop('final-synthesis-retry-needed', {
                mode,
                totalSearchCount: lastSynthesisContext.totalSearchCount,
                researchRound: lastSynthesisContext.researchRound,
                finishReason: recoveryRound.roundFinishReason,
                hasContent: Boolean(accumulatedContent.trim()),
                stillUngrounded: shouldRetryUngroundedSearchSynthesis(accumulatedContent),
              })

              if (shouldRecoverSearchSynthesis(accumulatedContent)) {
                resetAccumulatedAnswerForRetry()
              }
            }

            if (shouldRecoverSearchSynthesis(accumulatedContent)) {
              const failureContent = buildSearchSynthesisFailureMessage(savedToolResults)
              if (failureContent) {
                accumulatedContent = failureContent
                finalAnswerForcedFailure = true
                updateStreamingState({
                  content: accumulatedContent,
                  phase: 'answering',
                })
                updatePersistedStreamingMessage(options.sessionId, options.messageId, {
                  content: accumulatedContent,
                })
              }
            }

            updateStreamingState({
              phase: 'answering',
              researchStatus: buildResearchStatus(
                lastSynthesisContext.researchRound,
                options.researchMaxRounds,
                false
              ),
            })
            updatePersistedStreamingMessage(options.sessionId, options.messageId, {
              researchStatus: buildResearchStatus(
                lastSynthesisContext.researchRound,
                options.researchMaxRounds,
                false
              ),
            })
          }
        }
      }

      const visibleAnswerRound: VisibleAnswerRound = finalVisibleAnswerRound ?? {
        content: '',
        usage: emptyUsage(),
        firstTokenTime: null,
      }
      const visibleAnswerUsage = visibleAnswerRound.usage
      const basicUsage = fillMissingUsage(
        {
          inputTokens: visibleAnswerUsage?.inputTokens ?? 0,
          outputTokens: visibleAnswerUsage?.outputTokens ?? 0,
          totalTokens: visibleAnswerUsage?.totalTokens ?? 0,
        },
        visibleAnswerRound.content,
        { deriveInputFromTotal: provider === 'alibaba' }
      )
      const metrics = computeStreamMetrics(
        options.startTime,
        visibleAnswerRound.firstTokenTime,
        basicUsage.outputTokens
      )
      const finalContent = hasSearchResults(savedToolResults)
        ? stripStandaloneHorizontalRule(accumulatedContent)
        : accumulatedContent
      const finalFinishReason = finalAnswerForcedFailure ? undefined : finishReason || undefined
      const finalUsage = {
        ...basicUsage,
        thinkingTokens: visibleAnswerUsage?.thinkingTokens,
        cachedInputTokens: visibleAnswerUsage?.cachedInputTokens,
        cachedOutputTokens: visibleAnswerUsage?.cachedOutputTokens,
        cacheMissInputTokens: visibleAnswerUsage?.cacheMissInputTokens,
        cacheWriteInputTokens: visibleAnswerUsage?.cacheWriteInputTokens,
        tps:
          basicUsage.outputTokens > 0 && metrics.latency > 0
            ? basicUsage.outputTokens / (metrics.latency / 1000)
            : undefined,
        ttft: metrics.ttft,
      }

      const finalMessageUpdates = {
        content: finalContent,
        model: `${provider}/${model}`,
        latency: metrics.latency,
        usage: finalUsage,
        toolResults: savedToolResults,
        files: generatedFiles,
        ...(localThinkingBlocks.length > 0 ? { thinkingBlocks: localThinkingBlocks } : {}),
      }

      throwIfAborted()
      updatePersistedStreamingMessage(options.sessionId, options.messageId, finalMessageUpdates)
      logDiagnostic({
        phase: 'finish',
        latency: metrics.latency,
        finishReason: finalFinishReason,
        usage: finalUsage,
      })

      return {
        content: finalMessageUpdates.content,
        model: `${provider}/${model}`,
        toolResults: savedToolResults,
        thinkingBlocks: localThinkingBlocks.length > 0 ? localThinkingBlocks : undefined,
        usage: finalUsage,
        latency: metrics.latency,
        files: generatedFiles,
        finishReason: finalFinishReason,
      }
    },
    [
      settings,
      toolCalling,
      updateStreamingMessage,
      flushThrottledUpdates,
      throttledUpdateStreamingMessage,
      updateStreaming,
      updateInterval,
    ]
  )

  return { runProviderStream }
}

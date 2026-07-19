import { useCallback } from 'react'
import { useStreamingActions } from '../../../../../contexts/StreamingContext'
import type { FileAttachment, ThinkingBlock, ToolCallResult } from '../../../../../chat/types'
import type { ReasoningDetail, ServiceAssistantMessage } from '../../../../../services/types'
import { providerSupportsTools, type ActiveProviderId } from '../../../../../providers'
import { extractInlineToolCallsFromContent } from '../../../../../tools/adapters/openrouterToolCalls'
import { emptyUsage } from '../../../../../providers/providerRuntimeTypes'
import { mergeProviderUsage } from '@zura/provider-core'
import {
  SAFETY_CAP,
  MAX_RESEARCH_ROUNDS,
  buildAgentVerificationMessages,
  buildFollowUpMessages,
  buildResponseWithFallback,
  buildThinkingBlocksFromResults,
  getThinkingTranscript,
  mergeSavedToolResults,
  processInitialToolResults,
  publishStreamingToolResults,
  reconstructToolCallMessage,
  shouldRetryUngroundedSearchSynthesis,
  type DeltaToolCall,
} from './streamingUtils'
import {
  didVerificationSucceed,
  selectVerificationStrategy,
  type AgentVerificationStrategy,
} from '../../../../../agent/reliability'
import { createProviderStreamClient } from './providerStreamClient'
import { resolveStreamPhase as resolveStreamPhaseForContent } from './streamingContentPlacement'
import {
  appendChatDiagnosticEvent,
  summarizeDiagnosticMessages,
  summarizeDiagnosticToolResult,
} from '../../../../../diagnostics/chatDiagnosticsClient'
import { evaluateResearchContinuation, getEffectiveSearchBudget } from './researchLoopPolicy'
import {
  TOOL_FOLLOW_UP_SPLIT_MARKER,
  createToolFollowUpSplitMarker,
  endsWithToolFollowUpSplitMarker,
  removeToolFollowUpSplitMarker,
} from '../../messageTimeline'
import type {
  HandleToolCallsOptions,
  StreamingResult,
  StreamingSettings,
  ToolCallingHook,
  UpdateStreamingCallback,
} from './types'
import { createStreamChunkCoalescer } from '../../../../../diagnostics/streamChunkCoalescer'
import type { ResearchState } from '../../../../../research/types'
import {
  TOOL_MARKUP_PREVIEW_LIMIT,
  addToolInventoryMessage,
  buildRequestShape,
  buildResearchStatus,
  detectMidStreamMarkup,
  extractWebSearchQueries,
  findMidStreamMarkupStart,
  getUserContextText,
  hasNonWebToolResults,
  logToolMarkupLeak,
  resolveCommittedRoundContent,
  resolveFollowUpSplitMarkerBlockCount,
  type ProviderStreamingMessages,
  type VisibleAnswerRound,
} from './providerStreamingSupport'
import { runFinalSynthesisWithRetries } from './providerSynthesis'
import { finalizeProviderStream } from './providerStreamFinalization'
import {
  SystemicToolFailureTracker,
  buildSystemicToolFailureMessage,
  type SystemicToolFailure,
} from '../../../../../tools/systemicToolFailure'
import {
  accumulateDeltaToolCalls,
  appendCompletedThinkingBlock,
  mergeGeneratedFiles,
  shouldSkipStrayReasoningDelta,
} from './providerEventAccumulator'

export interface ProviderStreamingRunOptions {
  runId?: string
  provider: ActiveProviderId
  model: string
  settingsOverride?: StreamingSettings
  sessionId: string
  messageId: string
  messages: ProviderStreamingMessages
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
  /** DeepSeek reasoning effort; only applied when enableThinking is true. */
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh'
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

export function useProviderStreaming({
  settings,
  toolCalling,
  updateStreamingMessage,
  flushThrottledUpdates,
  throttledUpdateStreamingMessage,
}: UseProviderStreamingOptions): UseProviderStreamingReturn {
  const { updateStreaming } = useStreamingActions()
  const shouldLogResearchLoop = import.meta.env.DEV

  const logResearchLoop = (event: string, details?: Record<string, unknown>) => {
    if (!shouldLogResearchLoop) return

    console.debug('[research-loop]', event, details || {})
  }

  const runProviderStream = useCallback(
    async (options: ProviderStreamingRunOptions): Promise<StreamingResult> => {
      const provider = options.provider
      const model = options.model
      const runtimeSettings = options.settingsOverride ?? settings
      const client = createProviderStreamClient(runtimeSettings, provider)
      const supportsExternalTools = providerSupportsTools(provider)
      const toolsAvailable =
        options.enableTools !== false && toolCalling.canUseTools && supportsExternalTools
      const tools = toolsAvailable
        ? toolCalling.getToolsForRequestAsync
          ? await toolCalling.getToolsForRequestAsync()
          : toolCalling.getToolsForRequest()
        : null
      const requestMessages = addToolInventoryMessage(options.messages, tools)
      const effectiveSearchBudget = getEffectiveSearchBudget(
        options.researchMaxRounds,
        SAFETY_CAP,
        MAX_RESEARCH_ROUNDS
      )

      const logDiagnostic = (
        event: Omit<
          Parameters<typeof appendChatDiagnosticEvent>[0],
          'sessionId' | 'messageId' | 'timestamp' | 'provider' | 'model'
        >
      ) => {
        appendChatDiagnosticEvent({
          sessionId: options.sessionId,
          messageId: options.messageId,
          timestamp: Date.now(),
          provider,
          model,
          ...event,
        })
      }
      const logResearchState = (
        researchState: ResearchState,
        details?: Omit<
          Parameters<typeof appendChatDiagnosticEvent>[0],
          'sessionId' | 'messageId' | 'timestamp' | 'provider' | 'model' | 'phase' | 'researchState'
        >
      ) => {
        logDiagnostic({
          phase: 'research-state',
          researchState,
          ...details,
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
        requestToolApproval: options.toolEventCallbacks?.requestToolApproval,
        onToolApprovalStart: (toolCall) => {
          logDiagnostic({
            phase: 'tool-start',
            tool: {
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.arguments,
            },
          })
          options.toolEventCallbacks?.onToolApprovalStart?.(toolCall)
        },
        onToolApprovalResolved: (toolCall, approved) => {
          options.toolEventCallbacks?.onToolApprovalResolved?.(toolCall, approved)
        },
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
      // In tool-enabled rounds, frozen clean prefix once inline tool-call
      // markup is detected mid-stream (prevents raw markup leaking to the UI).
      let frozenDisplayContent: string | null = null
      let generatedFiles: FileAttachment[] = []
      let finalVisibleAnswerRound: VisibleAnswerRound | null = null
      let totalUsage = emptyUsage()
      let savedToolResults: ToolCallResult[] | undefined
      let localThinkingBlocks: ThinkingBlock[] = []
      // Number of completed thinking/tool blocks that existed at the moment the
      // first visible (non-hidden) content delta started streaming. This is the
      // block count that precedes the assistant's pre-tool preamble text, and it
      // is what the tool follow-up split marker must record so the preamble stays
      // ABOVE the tool/search activity it triggered. Using localThinkingBlocks.length
      // at marker-creation time is wrong because that count already includes the
      // tool block(s) appended AFTER the preamble was emitted.
      let visibleContentBlockBaseline: number | null = null
      let finishReason: string | null = null
      let activeThinking = ''
      let activeThinkingStartTime: number | null = null
      let citations: string[] = []
      let preserveToolSplitMarkers = false

      const throwIfAborted = () => {
        if (options.signal?.aborted) {
          throw new DOMException('Streaming aborted', 'AbortError')
        }
      }

      const updateStreamingState = (updates: Record<string, unknown>) => {
        if (options.signal?.aborted) return
        if (options.syncToStreamingContext !== false) {
          updateStreaming(updates)
        }
      }

      const publishStreamingProgress = (updates: Record<string, unknown>) => {
        if (options.signal?.aborted) return
        throttledUpdateStreamingMessage(
          options.sessionId,
          options.messageId,
          updates as Parameters<UpdateStreamingCallback>[2]
        )
      }

      const updatePersistedStreamingMessage: UpdateStreamingCallback = (
        sessionId,
        messageId,
        updates
      ) => {
        if (options.signal?.aborted) return
        updateStreamingMessage(sessionId, messageId, updates)
      }

      const hasVisibleAnswerContent = () => accumulatedContent.trim().length > 0

      const resolveStreamPhase = (
        phase: 'reasoning' | 'searching' | 'tool' | 'answering'
      ): 'reasoning' | 'searching' | 'tool' | 'answering' =>
        resolveStreamPhaseForContent(phase, hasVisibleAnswerContent())

      const flushActiveThrottledUpdates = () => {
        if (options.signal?.aborted) return
        flushThrottledUpdates()
      }

      const persistProgress = () => {
        if (options.signal?.aborted) return
        publishStreamingProgress({
          content: frozenDisplayContent ?? accumulatedContent,
          thinking: activeThinking || undefined,
          thinkingDuration:
            activeThinkingStartTime !== null
              ? performance.now() - activeThinkingStartTime
              : undefined,
          thinkingBlocks: localThinkingBlocks,
          files: generatedFiles,
          toolResults: savedToolResults,
        })
      }

      const finalizeActiveThinking = (): {
        thinking: undefined
        thinkingDuration: undefined
        thinkingBlocks: ThinkingBlock[]
        files: FileAttachment[]
        toolResults: ToolCallResult[] | undefined
      } | null => {
        if (!activeThinking.trim()) return null

        const thinkingEndTime = performance.now()
        const thinkingDuration =
          activeThinkingStartTime !== null ? thinkingEndTime - activeThinkingStartTime : undefined

        localThinkingBlocks = appendCompletedThinkingBlock(
          localThinkingBlocks,
          activeThinking,
          thinkingDuration
        )
        activeThinking = ''
        activeThinkingStartTime = null
        return {
          thinking: undefined,
          thinkingDuration: undefined,
          thinkingBlocks: localThinkingBlocks,
          files: generatedFiles,
          toolResults: savedToolResults,
        }
      }

      const runRound = async (
        roundMessages: ProviderStreamingRunOptions['messages'],
        roundOptions?: {
          round?: number
          toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
          tools?: ReturnType<ToolCallingHook['getToolsForRequest']>
        }
      ) => {
        const roundTools = roundOptions?.tools === undefined ? tools : roundOptions.tools
        const roundAllowsTools =
          Array.isArray(roundTools) && roundTools.length > 0 && roundOptions?.toolChoice !== 'none'
        const isToolFollowUpRound = roundAllowsTools && (roundOptions?.round ?? 0) > 0

        if (
          roundOptions?.round !== undefined &&
          roundOptions.round > 0 &&
          accumulatedContent.trim().length > 0 &&
          !endsWithToolFollowUpSplitMarker(accumulatedContent)
        ) {
          const splitMarker = isToolFollowUpRound
            ? createToolFollowUpSplitMarker(
                resolveFollowUpSplitMarkerBlockCount(
                  roundOptions.round,
                  visibleContentBlockBaseline,
                  localThinkingBlocks.length
                )
              )
            : TOOL_FOLLOW_UP_SPLIT_MARKER
          accumulatedContent = `${accumulatedContent.trimEnd()}${splitMarker}`
          updateStreamingState({ content: accumulatedContent })
          publishStreamingProgress({ content: accumulatedContent })
        }

        const roundStartContent = accumulatedContent
        const roundType = roundAllowsTools ? 'tool-enabled' : 'no-tools'
        const roundResearchState: ResearchState = roundAllowsTools ? 'search' : 'synthesize'
        let roundContent = ''
        const roundToolCalls: DeltaToolCall[] = []
        const roundReasoningDetails: ReasoningDetail[] = []
        let roundFinishReason: string | null = null
        let roundUsage = emptyUsage()
        let roundFirstTokenTime: number | null = null
        let suppressedInlineToolMarkup = false
        frozenDisplayContent = null

        throwIfAborted()
        logDiagnostic({
          phase: 'round-start',
          round: roundOptions?.round,
          roundType,
          messageCount: roundMessages.length,
          researchState: roundResearchState,
          searchBudgetRemaining: effectiveSearchBudget,
        })
        logResearchState(roundResearchState, {
          round: roundOptions?.round,
          roundType,
          messageCount: roundMessages.length,
          searchBudgetRemaining: effectiveSearchBudget,
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

        try {
          for await (const event of client.stream({
            provider,
            model,
            messages: roundMessages,
            temperature: runtimeSettings.temperature,
            maxTokens: runtimeSettings.maxTokens,
            streamResponses: runtimeSettings.streamResponses,
            tools: roundTools,
            toolChoice: roundOptions?.toolChoice,
            modalities: options.modalities,
            reasoning: options.reasoning,
            enableThinking: options.enableThinking,
            reasoningEffort: options.reasoningEffort,
            imageConfig: options.imageConfig,
            sessionId: options.sessionId,
            signal: options.signal,
          })) {
            throwIfAborted()

            switch (event.type) {
              case 'text-delta': {
                if (!roundFirstTokenTime && event.delta) {
                  roundFirstTokenTime = performance.now()
                }

                let finalizedThinkingUpdates: ReturnType<typeof finalizeActiveThinking> = null
                if (event.delta && activeThinking) {
                  finalizedThinkingUpdates = finalizeActiveThinking()
                }

                roundContent += event.delta
                accumulatedContent += event.delta
                // Record the block count at the start of the first visible
                // content. The preamble text streams AFTER this round's
                // reasoning is finalized but BEFORE its tool block is appended,
                // so this baseline excludes the tool activity the preamble
                // triggers and keeps the preamble above it in the timeline.
                if (event.delta && visibleContentBlockBaseline === null) {
                  visibleContentBlockBaseline = localThinkingBlocks.length
                }
                if (event.delta) {
                  if (!roundAllowsTools) {
                    const detectedFormat = detectMidStreamMarkup(roundContent)
                    if (detectedFormat && !suppressedInlineToolMarkup) {
                      suppressedInlineToolMarkup = true
                      frozenDisplayContent = roundStartContent
                      logToolMarkupLeak('suppressed-during-no-tools-pass', {
                        provider,
                        model,
                        roundType,
                        format: detectedFormat,
                        toolNames: [],
                        cleanedContentLength: 0,
                        rawPreview: roundContent.slice(0, TOOL_MARKUP_PREVIEW_LIMIT),
                      })
                      logResearchState('synthesize', {
                        round: roundOptions?.round,
                        roundType,
                        leakedMarkupFormat: detectedFormat,
                      })
                    }
                  } else if (frozenDisplayContent === null) {
                    // Tool-enabled round: once inline tool-call markup starts,
                    // freeze the visible content at the clean prefix so raw
                    // markup never streams to the user. The tool calls are
                    // recovered from the round transcript at end-of-round.
                    const markupStart = findMidStreamMarkupStart(roundContent)
                    if (markupStart !== null) {
                      frozenDisplayContent =
                        roundStartContent + roundContent.slice(0, markupStart).trimEnd()
                    }
                  }
                  streamChunkCoalescer.recordTextDelta(
                    event.delta,
                    roundStartContent.length + roundContent.length,
                    event.smoothing
                  )
                  const answeringProgress = {
                    phase: 'answering' as const,
                    content: frozenDisplayContent ?? accumulatedContent,
                    ...(finalizedThinkingUpdates ?? {}),
                  }
                  publishStreamingProgress(answeringProgress)
                }
                break
              }
              case 'reasoning-delta':
                if (
                  shouldSkipStrayReasoningDelta(
                    event.delta,
                    localThinkingBlocks,
                    activeThinking,
                    roundContent.length > 0
                  )
                ) {
                  break
                }
                if (!roundFirstTokenTime && event.delta) {
                  roundFirstTokenTime = performance.now()
                }
                if (activeThinkingStartTime === null) {
                  activeThinkingStartTime = performance.now()
                }
                activeThinking += event.delta
                {
                  const thinkingDuration =
                    activeThinkingStartTime !== null
                      ? performance.now() - activeThinkingStartTime
                      : undefined
                  const reasoningProgress = {
                    phase: resolveStreamPhase('reasoning'),
                    thinking: activeThinking,
                    thinkingDuration,
                    thinkingBlocks: localThinkingBlocks,
                    files: generatedFiles,
                  }
                  publishStreamingProgress(reasoningProgress)
                }
                break
              case 'reasoning-details':
                roundReasoningDetails.push(...event.details)
                break
              case 'tool-call-delta': {
                let finalizedThinkingForTool: ReturnType<typeof finalizeActiveThinking> = null
                if (activeThinking) {
                  finalizedThinkingForTool = finalizeActiveThinking()
                }
                if (!roundAllowsTools) {
                  suppressedInlineToolMarkup = true
                  frozenDisplayContent = roundStartContent
                  roundFinishReason = null
                  accumulatedContent = roundStartContent
                  roundContent = ''
                  logToolMarkupLeak('suppressed-during-no-tools-pass', {
                    provider,
                    model,
                    roundType,
                    format: 'native-tool-call-delta',
                    toolNames: event.delta
                      .map((toolCall) => toolCall.function?.name)
                      .filter(Boolean),
                    cleanedContentLength: 0,
                    rawPreview: JSON.stringify(event.delta).slice(0, TOOL_MARKUP_PREVIEW_LIMIT),
                  })
                  logResearchState('synthesize', {
                    round: roundOptions?.round,
                    roundType,
                    leakedMarkupFormat: 'native-tool-call-delta',
                    recoveredQueryCount: 0,
                  })
                  updateStreamingState({ content: accumulatedContent })
                  persistProgress()
                  break
                }
                if (
                  roundContent.trim().length > 0 &&
                  !endsWithToolFollowUpSplitMarker(accumulatedContent)
                ) {
                  const splitMarker = createToolFollowUpSplitMarker(localThinkingBlocks.length)
                  accumulatedContent = `${accumulatedContent.trimEnd()}${splitMarker}`
                  roundContent = `${roundContent.trimEnd()}${splitMarker}`
                  updateStreamingState({ content: accumulatedContent })
                  publishStreamingProgress({ content: accumulatedContent })
                }
                accumulateDeltaToolCalls(roundToolCalls, event.delta)
                streamChunkCoalescer.recordToolCallDelta(
                  Array.isArray(event.delta) ? event.delta.length : 1
                )
                // Early signal that tool calls are coming
                updateStreamingState({
                  phase: resolveStreamPhase('tool'),
                  ...(finalizedThinkingForTool ?? {
                    thinking: undefined,
                    thinkingDuration: undefined,
                    thinkingBlocks: localThinkingBlocks,
                  }),
                })
                if (finalizedThinkingForTool) {
                  publishStreamingProgress({
                    phase: resolveStreamPhase('tool'),
                    ...finalizedThinkingForTool,
                  })
                }
                break
              }
              case 'file-delta':
                generatedFiles = mergeGeneratedFiles(generatedFiles, event.files)
                updateStreamingState({ files: generatedFiles })
                persistProgress()
                break
              case 'usage':
                roundUsage = mergeProviderUsage(roundUsage, event.usage)
                logDiagnostic({
                  phase: 'usage',
                  round: roundOptions?.round,
                  roundType,
                  usage: event.usage,
                  rawUsage: event.rawUsage,
                })
                break
              case 'finish':
                if (!roundAllowsTools && event.finishReason === 'tool_calls') {
                  suppressedInlineToolMarkup = true
                  roundFinishReason = null
                } else {
                  roundFinishReason = event.finishReason || null
                }
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
          const finalizedThinkingUpdates = finalizeActiveThinking()
          if (finalizedThinkingUpdates) {
            updateStreamingState(finalizedThinkingUpdates)
            publishStreamingProgress(finalizedThinkingUpdates)
          }
        }

        flushActiveThrottledUpdates()
        throwIfAborted()
        const hasValidRoundToolCalls = roundToolCalls.some((toolCall) => toolCall?.id)
        const roundTranscriptContent = roundStartContent + roundContent
        let finalRoundContent = roundTranscriptContent

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
            logResearchState(roundResearchState, {
              round: roundOptions?.round,
              roundType,
              leakedMarkupFormat: extracted.format || undefined,
              recoveredQueryCount: 0,
            })

            finalRoundContent = extracted.cleanedContent
            suppressedInlineToolMarkup = true

            if (!roundAllowsTools) {
              logToolMarkupLeak('suppressed-during-no-tools-pass', {
                provider,
                model,
                roundType,
                format: extracted.format,
                toolNames: [],
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

        const committedVisibleContent = resolveCommittedRoundContent({
          isToolFollowUpRound,
          roundFinishReason,
          roundStartContent,
          roundContent,
          finalRoundContent,
          suppressedInlineToolMarkup,
        })

        const roundCommitProgress = {
          content: committedVisibleContent,
          phase: 'answering' as const,
          thinking: undefined,
          thinkingDuration: undefined,
          thinkingBlocks: localThinkingBlocks,
          files: generatedFiles,
          toolResults: savedToolResults,
        }
        updateStreamingState(roundCommitProgress)
        publishStreamingProgress(roundCommitProgress)

        accumulatedContent = committedVisibleContent
        if (roundFinishReason) {
          finishReason = roundFinishReason
        }

        if (
          roundFinishReason !== 'tool_calls' &&
          finalRoundContent.trim() &&
          !suppressedInlineToolMarkup
        ) {
          finalVisibleAnswerRound = {
            content: finalRoundContent,
            usage: roundUsage,
            firstTokenTime: roundFirstTokenTime,
          }
        }

        const rawReturnedRoundContent = finalRoundContent.startsWith(roundStartContent)
          ? finalRoundContent.slice(roundStartContent.length)
          : finalRoundContent
        const returnedRoundContent = removeToolFollowUpSplitMarker(rawReturnedRoundContent)

        streamChunkCoalescer.flush()
        logDiagnostic({
          phase: 'round-finish',
          round: roundOptions?.round,
          roundType,
          finishReason: roundFinishReason || undefined,
          usage: roundUsage,
        })
        totalUsage = mergeProviderUsage(totalUsage, {
          ...roundUsage,
          requestCount: (roundUsage.requestCount ?? 0) + 1,
        })

        return {
          roundContent: returnedRoundContent,
          roundToolCalls,
          roundReasoningDetails,
          roundFinishReason,
          suppressedInlineToolMarkup,
        }
      }

      /**
       * Run a final no-tools synthesis pass with bounded retries. DSML/XML
       * tool markup is treated as leaked invalid output here: the search phase
       * is over, so final synthesis must write plain text instead of recovering
       * or executing additional searches.
       */
      const runFinalSynthesis = async (
        baseRound: number,
        totalSearchCount: number,
        lastAssistantMessage: ServiceAssistantMessage,
        formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
      ): Promise<void> => {
        await runFinalSynthesisWithRetries({
          baseRound,
          totalSearchCount,
          lastAssistantMessage,
          formattedResults,
          requestMessages,
          researchMaxRounds: options.researchMaxRounds,
          effectiveSearchBudget,
          savedToolResults,
          getAccumulatedContent: () => accumulatedContent,
          setAccumulatedContent: (content) => {
            accumulatedContent = content
          },
          setFinishReason: (value) => {
            finishReason = value
          },
          runRound,
          updateStreamingState,
          publishStreamingProgress,
          throwIfAborted,
          logResearchLoop,
        })
      }

      const systemicToolFailureTracker = new SystemicToolFailureTracker()
      const stopForSystemicToolFailure = (failure: SystemicToolFailure): void => {
        accumulatedContent = buildSystemicToolFailureMessage(failure)
        finishReason = 'tool_error'
        const updates = {
          content: accumulatedContent,
          phase: resolveStreamPhase('answering'),
        }
        updateStreamingState(updates)
        publishStreamingProgress(updates)
        logResearchLoop('systemic-tool-failure', {
          error: failure.error.slice(0, 240),
          toolNames: failure.toolNames,
          occurrenceCount: failure.occurrenceCount,
        })
      }

      const initialToolChoice =
        options.forceWebSearch && tools?.some((tool) => tool.function?.name === 'web_search')
          ? { type: 'function' as const, function: { name: 'web_search' } }
          : undefined

      logDiagnostic({
        phase: 'request-start',
        messageCount: requestMessages.length,
        messages: summarizeDiagnosticMessages(requestMessages),
      })
      if (options.contextTrace) {
        logDiagnostic({
          phase: 'context-optimized',
          context: options.contextTrace,
        })
      }

      throwIfAborted()
      const initialRound = await runRound(requestMessages, {
        round: 0,
        toolChoice: initialToolChoice,
      })
      throwIfAborted()
      const userContextText = getUserContextText(requestMessages)

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

        // Signal that we are now waiting on / executing tool calls
        updateStreamingState({ phase: resolveStreamPhase('tool') })
        publishStreamingProgress({ phase: resolveStreamPhase('tool') })

        let toolResult = await toolCalling.handleToolCalls(
          buildResponseWithFallback(
            reconstructedMessage,
            requestMessages,
            getThinkingTranscript(localThinkingBlocks)
          ),
          {
            ...buildToolDiagnosticsCallbacks({
              runId: options.runId,
              remainingWebSearchBudget: effectiveSearchBudget,
              priorWebSearchQueries: [],
              userContextText,
              sessionId: options.sessionId,
              messageId: options.messageId,
            }),
          }
        )
        throwIfAborted()
        const initialAttemptedSearchQueries = extractWebSearchQueries(toolResult.toolResults)
        const initialHasNonWebTools = hasNonWebToolResults(toolResult.toolResults)
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

        const processed = processInitialToolResults(
          toolResult.toolResults || [],
          localThinkingBlocks
        )
        localThinkingBlocks = processed.updatedThinkingBlocks
        savedToolResults = processed.savedToolResults
        publishStreamingToolResults(
          updateStreamingState,
          publishStreamingProgress,
          savedToolResults,
          localThinkingBlocks
        )

        const initialSystemicFailure = systemicToolFailureTracker.record(
          toolResult.toolResults || []
        )
        if (initialSystemicFailure) {
          stopForSystemicToolFailure(initialSystemicFailure)
          toolResult = { ...toolResult, needsFollowUp: false }
        }

        if (processed.hasSearchCalls) {
          const researchStatus = buildResearchStatus(
            1,
            options.researchMaxRounds,
            false,
            initialExecutedSearchQueries
          )
          const searchProgress = {
            phase: resolveStreamPhase('reasoning'),
            researchStatus,
            thinkingBlocks: localThinkingBlocks,
          }
          updateStreamingState(searchProgress)
          publishStreamingProgress(searchProgress)
        }

        if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
          preserveToolSplitMarkers = true
          let totalSearchCount = toolResult.executionSummary.executedWebSearchCount || 0
          const searchQueryHistory = [...initialExecutedSearchQueries]
          let lastAssistantMessage = reconstructedMessage
          let researchRound = 1
          let pendingVerificationStrategy: AgentVerificationStrategy | null =
            options.toolEventCallbacks ? selectVerificationStrategy(toolResult.toolResults) : null
          let verificationStepStarted = false
          let verificationRecoveryUsed = false
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

          // Only force final synthesis for reasons other than budget.
          // Budget is now surfaced as a normal (synthetic) tool result so the model
          // can see it like any other web_search outcome and the loop isn't interrupted.
          const forceFinalForInitial =
            initialLoopDecision.shouldForceFinalSynthesis && initialLoopDecision.reason !== 'budget'

          const shouldStopAfterInitialBatch = !initialHasNonWebTools && forceFinalForInitial

          if (shouldStopAfterInitialBatch && toolResult.needsFollowUp) {
            logResearchLoop('tool-loop-stopped', {
              reason: initialLoopDecision.reason || 'tool-result-complete',
              totalSearchCount,
              researchRound,
            })
            // Run a no-tools synthesis pass with bounded retries. Without
            // this the orchestrator would exit straight to `finish` with
            // empty content (only the round-0 tool_call response). The
            // retry pipeline handles blank, leaked-markup, and ungrounded
            // outputs and falls back to deterministic evidence when possible.
            await runFinalSynthesis(
              researchRound,
              totalSearchCount,
              lastAssistantMessage,
              toolResult.formattedResults
            )
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
            const activeVerificationStrategy = pendingVerificationStrategy
            if (activeVerificationStrategy && !verificationStepStarted) {
              verificationStepStarted = true
              options.toolEventCallbacks?.onVerificationStart?.(activeVerificationStrategy)
            }
            const researchContextMsg = toolCalling.getResearchContext(
              totalSearchCount,
              options.researchMaxRounds
            )
            const followUpMessages = activeVerificationStrategy
              ? buildAgentVerificationMessages(
                  activeVerificationStrategy,
                  researchContextMsg,
                  researchRound,
                  totalSearchCount,
                  requestMessages,
                  lastAssistantMessage,
                  toolResult.formattedResults,
                  { recoveryAttempt: verificationRecoveryUsed }
                )
              : buildFollowUpMessages(
                  researchContextMsg,
                  researchRound,
                  totalSearchCount,
                  requestMessages,
                  lastAssistantMessage,
                  toolResult.formattedResults
                )

            updateStreamingState({
              phase: resolveStreamPhase('reasoning'),
              researchStatus: buildResearchStatus(researchRound, options.researchMaxRounds, false),
            })

            const followUpRoundStart = accumulatedContent
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
              if (activeVerificationStrategy) {
                accumulatedContent = followUpRoundStart
                updateStreamingState({ content: accumulatedContent })

                if (!verificationRecoveryUsed) {
                  verificationRecoveryUsed = true
                  continue
                }

                options.toolEventCallbacks?.onVerificationComplete?.(
                  activeVerificationStrategy,
                  false
                )
                accumulatedContent =
                  followUpRoundStart +
                  'I made a change, but I could not verify the outcome after one recovery attempt, so I stopped instead of continuing blind.'
                updateStreamingState({ content: accumulatedContent })
                publishStreamingProgress({ content: accumulatedContent })
                break
              }
              const followUpClassifiable = {
                roundContent: followUpRound.roundContent,
                suppressedInlineToolMarkup: followUpRound.suppressedInlineToolMarkup,
              }
              const followUpIsBlank = !followUpRound.roundContent.trim()
              const followUpLeakedMarkup = followUpRound.suppressedInlineToolMarkup
              const followUpUngrounded = shouldRetryUngroundedSearchSynthesis(
                followUpClassifiable.roundContent
              )

              if (
                (followUpIsBlank || followUpLeakedMarkup || followUpUngrounded) &&
                toolResult.formattedResults.length > 0
              ) {
                logResearchLoop('tool-loop-stopped', {
                  reason: followUpIsBlank
                    ? 'empty-follow-up-answer'
                    : followUpLeakedMarkup
                      ? 'leaked-markup-follow-up-answer'
                      : 'ungrounded-follow-up-answer',
                  totalSearchCount,
                  researchRound,
                })
                // Roll back accumulatedContent before kicking the synthesis
                // pipeline so attempts start from a clean slate.
                accumulatedContent = followUpRoundStart
                updateStreamingState({ content: accumulatedContent })
                await runFinalSynthesis(
                  researchRound,
                  totalSearchCount,
                  lastAssistantMessage,
                  toolResult.formattedResults
                )
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

            updateStreamingState({ phase: resolveStreamPhase('tool') })

            const nextToolResult = await toolCalling.handleToolCalls(
              buildResponseWithFallback(
                reconstructedFollowUp,
                requestMessages,
                getThinkingTranscript(localThinkingBlocks)
              ),
              {
                ...buildToolDiagnosticsCallbacks({
                  runId: options.runId,
                  remainingWebSearchBudget: Math.max(0, effectiveSearchBudget - totalSearchCount),
                  priorWebSearchQueries: [...searchQueryHistory],
                  userContextText,
                  sessionId: options.sessionId,
                  messageId: options.messageId,
                }),
              }
            )
            throwIfAborted()
            if (!nextToolResult || !nextToolResult.toolResults) {
              break
            }
            const wasVerificationRound = Boolean(activeVerificationStrategy)
            const verificationSucceeded =
              wasVerificationRound &&
              activeVerificationStrategy !== null &&
              didVerificationSucceed(activeVerificationStrategy, nextToolResult.toolResults)

            const attemptedSearchQueries = extractWebSearchQueries(nextToolResult.toolResults)
            const hasNonWebTools = hasNonWebToolResults(nextToolResult.toolResults)
            const executedSearchQueries =
              nextToolResult.executionSummary.executedWebSearchQueries || []
            const newWebSearches = nextToolResult.executionSummary.executedWebSearchCount || 0
            totalSearchCount += newWebSearches

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
              publishStreamingProgress,
              savedToolResults,
              localThinkingBlocks
            )

            const systemicFailure = systemicToolFailureTracker.record(nextToolResult.toolResults)
            if (systemicFailure) {
              stopForSystemicToolFailure(systemicFailure)
              break
            }

            updateStreamingState({
              phase: resolveStreamPhase('reasoning'),
              thinkingBlocks: localThinkingBlocks,
              researchStatus: buildResearchStatus(
                researchRound,
                options.researchMaxRounds,
                false,
                executedSearchQueries
              ),
            })

            researchRound += 1
            if (activeVerificationStrategy) {
              if (verificationSucceeded) {
                options.toolEventCallbacks?.onVerificationComplete?.(
                  activeVerificationStrategy,
                  true
                )
                pendingVerificationStrategy = null
                verificationStepStarted = false
                verificationRecoveryUsed = false
              } else if (!verificationRecoveryUsed) {
                verificationRecoveryUsed = true
                pendingVerificationStrategy = activeVerificationStrategy
              } else {
                options.toolEventCallbacks?.onVerificationComplete?.(
                  activeVerificationStrategy,
                  false
                )
                accumulatedContent +=
                  '\n\nI made a change, but verification did not succeed after one recovery attempt, so I stopped instead of continuing blind.'
                updateStreamingState({ content: accumulatedContent })
                publishStreamingProgress({ content: accumulatedContent })
                break
              }
            } else {
              pendingVerificationStrategy = options.toolEventCallbacks
                ? selectVerificationStrategy(nextToolResult.toolResults)
                : null
            }
            const continuationDecision = evaluateResearchContinuation({
              searchCount: totalSearchCount,
              maxRounds: options.researchMaxRounds,
              priorQueries: searchQueryHistory,
              nextQueries: attemptedSearchQueries,
              safetyCap: SAFETY_CAP,
              practicalCap: MAX_RESEARCH_ROUNDS,
            })
            searchQueryHistory.push(...executedSearchQueries)

            const shouldStopAfterFollowUpBatch =
              !hasNonWebTools &&
              continuationDecision.shouldForceFinalSynthesis &&
              continuationDecision.reason !== 'budget'

            if (shouldStopAfterFollowUpBatch && nextToolResult.needsFollowUp) {
              logResearchLoop('tool-loop-stopped', {
                reason: continuationDecision.reason || 'tool-result-complete',
                totalSearchCount,
                researchRound,
              })
              // Same gap as the post-initial-batch path: run a bounded
              // synthesis pass before breaking so the user gets an answer.
              await runFinalSynthesis(
                researchRound,
                totalSearchCount,
                lastAssistantMessage,
                nextToolResult.formattedResults
              )
              break
            }

            toolResult = nextToolResult
          }
        }
      }

      const finalized = finalizeProviderStream({
        provider,
        model,
        startTime: options.startTime,
        finalVisibleAnswerRound,
        totalUsage,
        accumulatedContent,
        preserveToolSplitMarkers,
        finishReason,
        savedToolResults,
        generatedFiles,
        thinkingBlocks: localThinkingBlocks,
      })

      throwIfAborted()
      publishStreamingProgress(finalized.updates)
      flushActiveThrottledUpdates()
      updatePersistedStreamingMessage(options.sessionId, options.messageId, finalized.updates)
      logDiagnostic({
        phase: 'finish',
        latency: finalized.updates.latency,
        finishReason: finalized.finishReason,
        usage: finalized.updates.usage,
      })

      return finalized.result
    },
    [
      settings,
      toolCalling,
      updateStreamingMessage,
      flushThrottledUpdates,
      throttledUpdateStreamingMessage,
      updateStreaming,
    ]
  )

  return { runProviderStream }
}

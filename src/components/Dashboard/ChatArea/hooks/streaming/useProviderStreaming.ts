import { useCallback } from 'react'
import { useStreamingActions } from '../../../../../contexts/StreamingContext'
import type {
  FileAttachment,
  ThinkingBlock,
  ToolCallResult,
} from '../../../../../contexts/ChatHistoryContext'
import type { ReasoningDetail } from '../../../../../services/types'
import { cleanSonarResponse } from '../../../../../services/perplexity'
import {
  providerSupportsTools,
  providerUsesNativeSearch,
  type ActiveProviderId,
} from '../../../../../providers'
import { extractXmlToolCallsFromContent } from '../../../../../tools/adapters/openrouterToolCalls'
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

export interface ProviderStreamingRunOptions {
  provider: ActiveProviderId
  model: string
  sessionId: string
  messageId: string
  messages: Array<{
    role: string
    content: string | { type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }[]
    images?: string[]
    tool_calls?: unknown[]
    thinking?: string
    reasoning?: string
    reasoning_details?: ReasoningDetail[]
  }>
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

const emptyUsage = (): NormalizedUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
})

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
  }
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
  lastAssistantMessage: {
    role: 'assistant'
    content: string
    tool_calls?: unknown[]
    reasoning?: string
    reasoning_details?: ReasoningDetail[]
  }
  formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
  totalSearchCount: number
  researchRound: number
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
      const client = createProviderStreamClient(settings, provider)
      const supportsExternalTools = providerSupportsTools(provider)
      const toolsAvailable = options.enableTools !== false && toolCalling.canUseTools && supportsExternalTools
      const tools = toolsAvailable ? toolCalling.getToolsForRequest() : null
      const effectiveSearchBudget = getEffectiveSearchBudget(
        options.researchMaxRounds,
        SAFETY_CAP,
        MAX_RESEARCH_ROUNDS
      )

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

      const shouldRecoverSearchSynthesis = (content: string) =>
        !content.trim() || shouldRetryUngroundedSearchSynthesis(content)

      const updateStreamingState = (updates: Record<string, unknown>) => {
        if (options.syncToStreamingContext !== false) {
          updateStreaming(updates)
        }
      }

      const persistProgress = () => {
        const now = Date.now()
        if (now - lastUpdateTime < updateInterval) return

        throttledUpdateStreamingMessage(options.sessionId, options.messageId, {
          content: accumulatedContent,
          thinking: activeThinking || undefined,
          thinkingBlocks: localThinkingBlocks,
          files: generatedFiles,
          toolResults: savedToolResults,
        })
        lastUpdateTime = now
      }

      const finalizeActiveThinking = () => {
        if (!activeThinking.trim()) return false

        const thinkingEndTime = performance.now()
        const thinkingDuration = activeThinkingStartTime
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

      const resetAccumulatedAnswerForRetry = () => {
        accumulatedContent = ''
        finalVisibleAnswerRound = null
        updateStreamingState({
          content: '',
          phase: 'reasoning',
        })
        updateStreamingMessage(options.sessionId, options.messageId, {
          content: '',
        })
      }

      const runRound = async (
        roundMessages: ProviderStreamingRunOptions['messages'],
        roundOptions?: {
          toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
          tools?: ReturnType<ToolCallingHook['getToolsForRequest']>
        }
      ) => {
        const roundStartContent = accumulatedContent
        const roundStartTime = performance.now()
        let roundContent = ''
        let roundToolCalls: DeltaToolCall[] = []
        let roundReasoningDetails: ReasoningDetail[] = []
        let roundFinishReason: string | null = null
        let roundUsage = emptyUsage()
        let roundFirstTokenTime: number | null = null
        let strippedToolPrelude = false

        const persistToolPreludeAsThinkingBlock = () => {
          if (accumulatedContent === roundStartContent) return

          const toolPrelude = accumulatedContent.slice(roundStartContent.length).trim()
          if (!toolPrelude) return

          localThinkingBlocks = appendCompletedThinkingBlock(localThinkingBlocks, toolPrelude)
        }

        for await (const event of client.stream({
          provider,
          model,
          messages: roundMessages,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          streamResponses: settings.streamResponses,
          tools: roundOptions?.tools === undefined ? tools : roundOptions.tools,
          toolChoice: roundOptions?.toolChoice,
          modalities: options.modalities,
          reasoning: options.reasoning,
          enableThinking: options.enableThinking,
          imageConfig: options.imageConfig,
          signal: options.signal,
        })) {
          switch (event.type) {
            case 'text-delta':
              if (!roundFirstTokenTime && event.delta) {
                roundFirstTokenTime = performance.now()
              }

              if (event.delta && activeThinking) {
                finalizeActiveThinking()
                const completedThinkingUpdate = {
                  thinking: undefined,
                  thinkingDuration: undefined,
                  thinkingBlocks: localThinkingBlocks,
                }
                updateStreamingState(completedThinkingUpdate)
                updateStreamingMessage(options.sessionId, options.messageId, completedThinkingUpdate)
              }

              accumulatedContent += event.delta
              roundContent += event.delta
              if (event.delta) {
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
              if (!activeThinkingStartTime) {
                activeThinkingStartTime = performance.now()
              }
              activeThinking += event.delta
              updateStreamingState({
                phase: 'reasoning',
                thinking: activeThinking,
                thinkingBlocks: localThinkingBlocks,
                files: generatedFiles,
              })
              persistProgress()
              break
            case 'reasoning-details':
              roundReasoningDetails.push(...event.details)
              break
            case 'tool-call-delta':
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
                updateStreamingMessage(options.sessionId, options.messageId, {
                  content: accumulatedContent,
                  thinking: undefined,
                  thinkingDuration: undefined,
                  thinkingBlocks: localThinkingBlocks,
                })
              }
              accumulateDeltaToolCalls(roundToolCalls, event.delta)
              break
            case 'file-delta':
              generatedFiles = mergeGeneratedFiles(generatedFiles, event.files)
              updateStreamingState({ files: generatedFiles })
              persistProgress()
              break
            case 'usage':
              roundUsage = mergeUsage(roundUsage, event.usage)
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

        if (activeThinking) {
          finalizeActiveThinking()
        }

        flushThrottledUpdates()
        const hasValidRoundToolCalls = roundToolCalls.some((toolCall) => toolCall?.id)
        if (roundFinishReason === 'tool_calls' && hasValidRoundToolCalls) {
          accumulatedContent = roundStartContent
        }
        let finalRoundContent = providerUsesNativeSearch(provider)
          ? cleanSonarResponse(accumulatedContent, citations)
          : accumulatedContent

        if (
          provider === 'openrouter' &&
          toolsAvailable &&
          !hasValidRoundToolCalls &&
          finalRoundContent.includes('<tool_call>')
        ) {
          const extracted = extractXmlToolCallsFromContent(finalRoundContent, {
            lastUserMessage: getUserContextText(roundMessages),
            reasoning: getThinkingTranscript(localThinkingBlocks),
          })

          if (extracted.toolCalls.length > 0) {
            logOpenRouterDebug('xml-tool-call-recovered', {
              model,
              toolNames: extracted.toolCalls.map((toolCall) => toolCall.name),
              cleanedContentLength: extracted.cleanedContent.length,
              rawContentPreview: finalRoundContent.slice(0, 240),
            })
            roundToolCalls = extracted.toolCalls.map((toolCall, index) => ({
              index,
              id: toolCall.id,
              type: 'function',
              function: {
                name: toolCall.name,
                arguments: JSON.stringify(toolCall.arguments),
              },
            }))
            finalRoundContent = extracted.cleanedContent
            roundFinishReason = 'tool_calls'
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
        updateStreamingMessage(options.sessionId, options.messageId, {
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

        if (roundFinishReason !== 'tool_calls' && finalRoundContent.trim()) {
          finalVisibleAnswerRound = {
            content: finalRoundContent,
            usage: roundUsage,
            firstTokenTime: roundFirstTokenTime,
          }
        }

        return { roundContent, roundToolCalls, roundReasoningDetails, roundFinishReason }
      }

      const runNoToolsSynthesisAttempt = async (
        synthesisContext: SynthesisContext,
        mode: 'final' | 'recovery' | 'plain-text-only'
      ) => {
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
                synthesisContext.formattedResults
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

        updateStreamingState({ phase: 'reasoning' })
        return await runRound(synthesisMessages, { tools: null, toolChoice: 'none' })
      }

      const initialToolChoice =
        options.forceWebSearch &&
        tools?.some((tool) => tool.function?.name === 'web_search')
          ? { type: 'function' as const, function: { name: 'web_search' } }
          : undefined

      const initialRound = await runRound(options.messages, {
        toolChoice: initialToolChoice,
      })
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
            ...options.toolEventCallbacks,
            executionPolicy: {
              remainingWebSearchBudget: effectiveSearchBudget,
              priorWebSearchQueries: [],
              userContextText,
            },
          }
        )
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
          updateStreamingMessage,
          options.sessionId,
          options.messageId,
          savedToolResults,
          localThinkingBlocks
        )

        if (processed.hasSearchCalls) {
          const researchStatus = buildResearchStatus(
            1,
            options.researchMaxRounds,
            true,
            initialExecutedSearchQueries
          )
          updateStreamingState({ phase: 'searching', researchStatus, thinkingBlocks: localThinkingBlocks })
          updateStreamingMessage(options.sessionId, options.messageId, {
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

          if (
            initialLoopDecision.shouldForceFinalSynthesis &&
            toolResult.needsFollowUp &&
            toolResult.formattedResults.length > 0
          ) {
            pendingFinalSynthesis = {
              lastAssistantMessage: reconstructedMessage,
              formattedResults: toolResult.formattedResults,
              totalSearchCount,
              researchRound,
            }
            logResearchLoop('final-synthesis-scheduled', {
              reason: initialLoopDecision.reason || 'unknown',
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

            const followUpRound = await runRound(followUpMessages)
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
                ...options.toolEventCallbacks,
                executionPolicy: {
                  remainingWebSearchBudget: Math.max(0, effectiveSearchBudget - totalSearchCount),
                  priorWebSearchQueries: [...searchQueryHistory],
                  userContextText,
                },
              }
            )

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
              updateStreamingMessage,
              options.sessionId,
              options.messageId,
              savedToolResults,
              localThinkingBlocks
            )

            updateStreamingState({
              phase: 'searching',
              thinkingBlocks: localThinkingBlocks,
              researchStatus: buildResearchStatus(
                researchRound,
                options.researchMaxRounds,
                executedSearchQueries.length > 0,
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

            if (
              continuationDecision.shouldForceFinalSynthesis &&
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
                reason: continuationDecision.reason || 'unknown',
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
            await runNoToolsSynthesisAttempt(pendingFinalSynthesis, 'final')
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
            updateStreamingMessage(options.sessionId, options.messageId, {
              researchStatus: buildResearchStatus(
                pendingFinalSynthesis.researchRound,
                options.researchMaxRounds,
                false
              ),
            })
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
              const needsRetry =
                recoveryRound.roundFinishReason === 'tool_calls' ||
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
                updateStreamingMessage(options.sessionId, options.messageId, {
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
            updateStreamingMessage(options.sessionId, options.messageId, {
              researchStatus: buildResearchStatus(
                lastSynthesisContext.researchRound,
                options.researchMaxRounds,
                false
              ),
            })
          }
        }
      }

      const basicUsage = fillMissingUsage(
        finalVisibleAnswerRound
          ? {
              inputTokens: finalVisibleAnswerRound.usage.inputTokens || 0,
              outputTokens: finalVisibleAnswerRound.usage.outputTokens || 0,
              totalTokens: finalVisibleAnswerRound.usage.totalTokens || 0,
            }
          : {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
            },
        finalVisibleAnswerRound?.content || '',
        { deriveInputFromTotal: provider === 'alibaba' }
      )
      const metrics = computeStreamMetrics(
        finalVisibleAnswerRound ? options.startTime : options.startTime,
        finalVisibleAnswerRound?.firstTokenTime ?? null,
        basicUsage.outputTokens
      )
      const finalContent = hasSearchResults(savedToolResults)
        ? stripStandaloneHorizontalRule(accumulatedContent)
        : accumulatedContent
      const finalFinishReason = finalAnswerForcedFailure ? undefined : finishReason || undefined
      const finalUsage = {
        ...basicUsage,
        thinkingTokens: finalVisibleAnswerRound?.usage.thinkingTokens,
        cachedInputTokens: finalVisibleAnswerRound?.usage.cachedInputTokens,
        cachedOutputTokens: finalVisibleAnswerRound?.usage.cachedOutputTokens,
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

      updateStreamingMessage(options.sessionId, options.messageId, finalMessageUpdates)

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

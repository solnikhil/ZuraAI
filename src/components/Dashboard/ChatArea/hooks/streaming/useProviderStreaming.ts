import { useCallback } from 'react'
import { useStreamingActions } from '../../../../../contexts/StreamingContext'
import type {
  FileAttachment,
  ThinkingBlock,
  ToolCallResult,
} from '../../../../../contexts/ChatHistoryContext'
import { cleanSonarResponse } from '../../../../../services/perplexity'
import {
  providerSupportsTools,
  providerUsesNativeSearch,
  type ActiveProviderId,
} from '../../../../../providers'
import {
  SAFETY_CAP,
  MAX_RESEARCH_ROUNDS,
  accumulateDeltaToolCalls,
  appendCompletedThinkingBlock,
  buildFinalSynthesisMessages,
  buildFollowUpMessages,
  buildResponseWithFallback,
  buildThinkingBlocksFromResults,
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
import { evaluateResearchContinuation } from './researchLoopPolicy'
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
  }>
  startTime: number
  researchMaxRounds: number
  forceWebSearch?: boolean
  signal?: AbortSignal
  enableTools?: boolean
  syncToStreamingContext?: boolean
  modalities?: Array<'text' | 'image'>
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

export function useProviderStreaming({
  settings,
  toolCalling,
  updateStreamingMessage,
  flushThrottledUpdates,
  throttledUpdateStreamingMessage,
}: UseProviderStreamingOptions): UseProviderStreamingReturn {
  const { updateStreaming } = useStreamingActions()
  const updateInterval = getStreamingUpdateInterval()

  const runProviderStream = useCallback(
    async (options: ProviderStreamingRunOptions): Promise<StreamingResult> => {
      const provider = options.provider
      const model = options.model
      const client = createProviderStreamClient(settings, provider)
      const supportsExternalTools = providerSupportsTools(provider)
      const toolsAvailable = options.enableTools !== false && toolCalling.canUseTools && supportsExternalTools
      const tools = toolsAvailable ? toolCalling.getToolsForRequest() : null

      let accumulatedContent = ''
      let generatedFiles: FileAttachment[] = []
      let lastUpdateTime = Date.now()
      let usage = emptyUsage()
      let savedToolResults: ToolCallResult[] | undefined
      let localThinkingBlocks: ThinkingBlock[] = []
      let firstTokenTime: number | null = null
      let finishReason: string | null = null
      let activeThinking = ''
      let activeThinkingStartTime: number | null = null
      let citations: string[] = []

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

      const runRound = async (
        roundMessages: ProviderStreamingRunOptions['messages'],
        roundOptions?: {
          toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
          tools?: ReturnType<ToolCallingHook['getToolsForRequest']>
        }
      ) => {
        const roundStartContent = accumulatedContent
        let roundContent = ''
        let roundToolCalls: DeltaToolCall[] = []
        let roundFinishReason: string | null = null
        let roundUsage = emptyUsage()
        let strippedToolPrelude = false

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
          signal: options.signal,
        })) {
          switch (event.type) {
            case 'text-delta':
              if (!firstTokenTime && event.delta) {
                firstTokenTime = performance.now()
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
                updateStreamingState({ phase: 'answering' })
              }
              persistProgress()
              break
            case 'reasoning-delta':
              if (!firstTokenTime && event.delta) {
                firstTokenTime = performance.now()
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
            case 'tool-call-delta':
              if (!strippedToolPrelude && accumulatedContent !== roundStartContent) {
                strippedToolPrelude = true
                accumulatedContent = roundStartContent
                updateStreamingState({ content: accumulatedContent })
                updateStreamingMessage(options.sessionId, options.messageId, {
                  content: accumulatedContent,
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
        const finalRoundContent = providerUsesNativeSearch(provider)
          ? cleanSonarResponse(accumulatedContent, citations)
          : accumulatedContent

        updateStreamingState({
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
        usage = mergeUsage(usage, roundUsage)

        if (roundFinishReason) {
          finishReason = roundFinishReason
        }

        return { roundContent, roundToolCalls, roundFinishReason }
      }

      const initialToolChoice =
        options.forceWebSearch &&
        tools?.some((tool) => tool.function?.name === 'web_search')
          ? { type: 'function' as const, function: { name: 'web_search' } }
          : undefined

      const initialRound = await runRound(options.messages, {
        toolChoice: initialToolChoice,
      })

      if (
        toolsAvailable &&
        finishReason === 'tool_calls' &&
        initialRound.roundToolCalls.filter((toolCall) => toolCall?.id).length > 0
      ) {
        const reconstructedMessage = reconstructToolCallMessage(
          initialRound.roundContent,
          initialRound.roundToolCalls
        )
        let toolResult = await toolCalling.handleToolCalls(
          buildResponseWithFallback(
            reconstructedMessage,
            options.messages,
            getThinkingTranscript(localThinkingBlocks)
          ),
          options.toolEventCallbacks
        )

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
          const researchStatus = {
            currentRound: 1,
            maxRounds: options.researchMaxRounds,
            currentSearch: processed.searchQuery,
            isSearching: true,
          }
          updateStreamingState({ phase: 'searching', researchStatus, thinkingBlocks: localThinkingBlocks })
          updateStreamingMessage(options.sessionId, options.messageId, {
            researchStatus,
            thinkingBlocks: localThinkingBlocks,
          })
        }

        if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
          let totalSearchCount =
            toolResult.toolResults?.filter((result) => result.toolCall.name === 'web_search').length || 0
          const searchQueryHistory = extractWebSearchQueries(toolResult.toolResults)
          let lastAssistantMessage = reconstructedMessage
          let researchRound = 1
          let pendingFinalSynthesis:
            | {
                lastAssistantMessage: { role: 'assistant'; content: string; tool_calls?: unknown[] }
                formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
                totalSearchCount: number
                researchRound: number
              }
            | null = null
          const initialLoopDecision = evaluateResearchContinuation({
            searchCount: totalSearchCount,
            maxRounds: options.researchMaxRounds,
            priorQueries: [],
            nextQueries: searchQueryHistory,
            safetyCap: SAFETY_CAP,
            practicalCap: MAX_RESEARCH_ROUNDS,
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
            toolResult = {
              ...toolResult,
              needsFollowUp: false,
            }
          }

          while (toolResult.needsFollowUp && researchRound < SAFETY_CAP) {
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
              researchStatus: {
                currentRound: researchRound,
                maxRounds: options.researchMaxRounds,
                isSearching: false,
              },
            })

            const followUpRound = await runRound(followUpMessages)
            const hasValidToolCalls =
              followUpRound.roundToolCalls.length > 0 &&
              followUpRound.roundToolCalls.some((toolCall) => toolCall?.function?.name)

            if (!hasValidToolCalls) {
              break
            }

            const reconstructedFollowUp = reconstructToolCallMessage(
              followUpRound.roundContent,
              followUpRound.roundToolCalls
            )
            lastAssistantMessage = reconstructedFollowUp
            const nextToolResult = await toolCalling.handleToolCalls(
              buildResponseWithFallback(
                reconstructedFollowUp,
                options.messages,
                getThinkingTranscript(localThinkingBlocks)
              ),
              options.toolEventCallbacks
            )

            const newWebSearches =
              nextToolResult.toolResults?.filter((result) => result.toolCall.name === 'web_search')
                .length || 0
            const nextSearchQueries = extractWebSearchQueries(nextToolResult.toolResults)
            totalSearchCount += newWebSearches

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

            updateStreamingState({ phase: 'searching', thinkingBlocks: localThinkingBlocks })

            researchRound += 1
            const continuationDecision = evaluateResearchContinuation({
              searchCount: totalSearchCount,
              maxRounds: options.researchMaxRounds,
              priorQueries: searchQueryHistory,
              nextQueries: nextSearchQueries,
              safetyCap: SAFETY_CAP,
              practicalCap: MAX_RESEARCH_ROUNDS,
            })
            searchQueryHistory.push(...nextSearchQueries)

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
              toolResult = {
                ...nextToolResult,
                needsFollowUp: false,
              }
              break
            }

            toolResult = nextToolResult
          }

          if (pendingFinalSynthesis) {
            const synthesisMessages = buildFinalSynthesisMessages(
              toolCalling.getResearchContext(
                pendingFinalSynthesis.totalSearchCount,
                options.researchMaxRounds
              ),
              pendingFinalSynthesis.researchRound,
              pendingFinalSynthesis.totalSearchCount,
              options.messages,
              pendingFinalSynthesis.lastAssistantMessage,
              pendingFinalSynthesis.formattedResults
            )

            updateStreamingState({ phase: 'reasoning' })
            await runRound(synthesisMessages, { tools: null, toolChoice: 'none' })

            updateStreamingState({
              phase: 'answering',
              researchStatus: {
                currentRound: pendingFinalSynthesis.researchRound,
                maxRounds: options.researchMaxRounds,
                isSearching: false,
              },
            })
            updateStreamingMessage(options.sessionId, options.messageId, {
              researchStatus: {
                currentRound: pendingFinalSynthesis.researchRound,
                maxRounds: options.researchMaxRounds,
                isSearching: false,
              },
            })
          }
        }
      }

      const basicUsage = fillMissingUsage(
        {
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          totalTokens: usage.totalTokens || 0,
        },
        accumulatedContent,
        { deriveInputFromTotal: provider === 'alibaba' }
      )
      const metrics = computeStreamMetrics(
        options.startTime,
        firstTokenTime,
        basicUsage.outputTokens
      )
      const finalContent = hasSearchResults(savedToolResults)
        ? stripStandaloneHorizontalRule(accumulatedContent)
        : accumulatedContent
      const finalUsage = {
        ...basicUsage,
        thinkingTokens: usage.thinkingTokens,
        cachedInputTokens: usage.cachedInputTokens,
        cachedOutputTokens: usage.cachedOutputTokens,
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
        finishReason: finishReason || undefined,
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

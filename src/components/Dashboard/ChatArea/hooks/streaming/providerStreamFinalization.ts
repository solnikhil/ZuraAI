import type { FileAttachment, ThinkingBlock, ToolCallResult } from '../../../../../chat/types'
import type { ProviderUsage } from '@zura/provider-core'
import type { ActiveProviderId } from '../../../../../providers'
import { emptyUsage } from '../../../../../providers/providerRuntimeTypes'
import {
  hasSearchResults,
  computeStreamMetrics,
  fillMissingUsage,
  stripStandaloneHorizontalRule,
} from './streamingUtils'
import { removeToolFollowUpSplitMarker } from '../../messageTimeline'
import type { StreamingResult } from './types'
import type { VisibleAnswerRound } from './providerStreamingSupport'

interface FinalizeProviderStreamOptions {
  provider: ActiveProviderId
  model: string
  startTime: number
  finalVisibleAnswerRound: VisibleAnswerRound | null
  totalUsage: ProviderUsage
  accumulatedContent: string
  preserveToolSplitMarkers: boolean
  finishReason: string | null
  savedToolResults: ToolCallResult[] | undefined
  generatedFiles: FileAttachment[]
  thinkingBlocks: ThinkingBlock[]
}

type FinalProviderUsage = ProviderUsage & { tps?: number; ttft?: number }

export interface FinalizedProviderStream {
  updates: {
    content: string
    model: string
    latency: number
    usage: FinalProviderUsage
    toolResults: ToolCallResult[] | undefined
    files: FileAttachment[]
    thinkingBlocks?: ThinkingBlock[]
  }
  result: StreamingResult
  finishReason: string | undefined
}

/** Lossless, side-effect-free final result calculation shared by all provider paths. */
export function finalizeProviderStream({
  provider,
  model,
  startTime,
  finalVisibleAnswerRound,
  totalUsage,
  accumulatedContent,
  preserveToolSplitMarkers,
  finishReason,
  savedToolResults,
  generatedFiles,
  thinkingBlocks,
}: FinalizeProviderStreamOptions): FinalizedProviderStream {
  const visibleAnswerRound = finalVisibleAnswerRound ?? {
    content: '',
    usage: emptyUsage(),
    firstTokenTime: null,
  }
  const visibleAnswerUsage = visibleAnswerRound.usage
  const basicUsage = fillMissingUsage(
    {
      inputTokens: visibleAnswerUsage.inputTokens,
      outputTokens: visibleAnswerUsage.outputTokens,
      totalTokens: visibleAnswerUsage.totalTokens,
    },
    visibleAnswerRound.content,
    { deriveInputFromTotal: provider === 'alibaba' }
  )
  const metrics = computeStreamMetrics(
    startTime,
    visibleAnswerRound.firstTokenTime,
    basicUsage.outputTokens
  )
  const contentWithTimeline = preserveToolSplitMarkers
    ? accumulatedContent
    : removeToolFollowUpSplitMarker(accumulatedContent)
  const content = hasSearchResults(savedToolResults)
    ? stripStandaloneHorizontalRule(contentWithTimeline)
    : contentWithTimeline
  const totalBasicUsage = fillMissingUsage(
    {
      inputTokens: totalUsage.inputTokens,
      outputTokens: totalUsage.outputTokens,
      totalTokens: totalUsage.totalTokens,
    },
    visibleAnswerRound.content,
    { deriveInputFromTotal: provider === 'alibaba' }
  )
  const usage: FinalProviderUsage = {
    ...totalUsage,
    ...totalBasicUsage,
    tps:
      basicUsage.outputTokens > 0 && metrics.latency > 0
        ? basicUsage.outputTokens / (metrics.latency / 1000)
        : undefined,
    ttft: metrics.ttft,
  }
  const modelName = `${provider}/${model}`
  const finalFinishReason = finishReason || undefined
  const updates = {
    content,
    model: modelName,
    latency: metrics.latency,
    usage,
    toolResults: savedToolResults,
    files: generatedFiles,
    ...(thinkingBlocks.length > 0 ? { thinkingBlocks } : {}),
  }

  return {
    updates,
    finishReason: finalFinishReason,
    result: {
      content,
      model: modelName,
      toolResults: savedToolResults,
      thinkingBlocks: thinkingBlocks.length > 0 ? thinkingBlocks : undefined,
      usage,
      latency: metrics.latency,
      files: generatedFiles,
      finishReason: finalFinishReason,
    },
  }
}

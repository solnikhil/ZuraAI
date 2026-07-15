import type { ToolCallResult } from '../../../../../chat/types'
import type { ServiceAssistantMessage } from '../../../../../services/types'
import {
  SEARCH_SYNTHESIS_FAILURE_MESSAGE,
  buildDeterministicSearchSynthesis,
  buildFollowUpMessages,
  buildPlainTextOnlySynthesisMessages,
  buildRecoverySynthesisMessages,
  shouldRetryUngroundedSearchSynthesis,
} from './streamingUtils'
import { buildResearchStatus, type ProviderStreamingMessages } from './providerStreamingSupport'

type SynthesisOutcome = 'good' | 'blank' | 'leaked-or-ungrounded'

interface SynthesisRoundResult {
  roundContent: string
  suppressedInlineToolMarkup: boolean
}

interface FinalSynthesisOptions {
  baseRound: number
  totalSearchCount: number
  lastAssistantMessage: ServiceAssistantMessage
  formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
  requestMessages: ProviderStreamingMessages
  researchMaxRounds: number
  effectiveSearchBudget: number
  savedToolResults: ToolCallResult[] | undefined
  getAccumulatedContent: () => string
  setAccumulatedContent: (content: string) => void
  setFinishReason: (finishReason: string | null) => void
  runRound: (
    messages: ProviderStreamingMessages,
    options: { round: number; toolChoice: 'none'; tools: [] }
  ) => Promise<SynthesisRoundResult>
  updateStreamingState: (updates: Record<string, unknown>) => void
  publishStreamingProgress: (updates: Record<string, unknown>) => void
  throwIfAborted: () => void
  logResearchLoop: (event: string, details?: Record<string, unknown>) => void
}

function classifySynthesisRound(round: SynthesisRoundResult): SynthesisOutcome {
  if (round.suppressedInlineToolMarkup) return 'leaked-or-ungrounded'
  const trimmed = round.roundContent.trim()
  if (!trimmed) return 'blank'
  if (shouldRetryUngroundedSearchSynthesis(trimmed)) return 'leaked-or-ungrounded'
  return 'good'
}

export async function runFinalSynthesisWithRetries(options: FinalSynthesisOptions): Promise<void> {
  const {
    baseRound,
    totalSearchCount,
    lastAssistantMessage,
    formattedResults,
    requestMessages,
    researchMaxRounds,
    effectiveSearchBudget,
    savedToolResults,
    getAccumulatedContent,
    setAccumulatedContent,
    setFinishReason,
    runRound,
    updateStreamingState,
    publishStreamingProgress,
    throwIfAborted,
    logResearchLoop,
  } = options
  const noToolsResearchContext = ''
  const baselineContent = getAccumulatedContent()

  const resetToBaseline = () => {
    setAccumulatedContent(baselineContent)
    updateStreamingState({ content: baselineContent })
  }

  const attempt = async (
    messages: ProviderStreamingMessages,
    round: number
  ): Promise<SynthesisOutcome> => {
    const result = await runRound(messages, { round, toolChoice: 'none', tools: [] })
    throwIfAborted()
    return classifySynthesisRound(result)
  }

  const attempt1Messages = buildFollowUpMessages(
    noToolsResearchContext,
    baseRound,
    totalSearchCount,
    requestMessages,
    lastAssistantMessage,
    formattedResults
  )
  updateStreamingState({
    phase: 'answering',
    researchStatus: buildResearchStatus(baseRound, researchMaxRounds, false),
  })
  throwIfAborted()
  const outcome1 = await attempt(attempt1Messages, baseRound)
  if (outcome1 === 'good') return

  logResearchLoop('synthesis-retry', { attempt: 1, outcome: outcome1, baseRound })
  resetToBaseline()

  const attempt2Messages =
    outcome1 === 'blank'
      ? buildRecoverySynthesisMessages(
          noToolsResearchContext,
          baseRound + 1,
          totalSearchCount,
          requestMessages,
          lastAssistantMessage,
          formattedResults
        )
      : buildPlainTextOnlySynthesisMessages(
          noToolsResearchContext,
          baseRound + 1,
          totalSearchCount,
          requestMessages,
          lastAssistantMessage,
          formattedResults
        )
  const outcome2 = await attempt(attempt2Messages, baseRound + 1)
  if (outcome2 === 'good') return

  logResearchLoop('synthesis-retry', { attempt: 2, outcome: outcome2, baseRound })
  resetToBaseline()

  const attempt3Messages = buildPlainTextOnlySynthesisMessages(
    noToolsResearchContext,
    baseRound + 2,
    totalSearchCount,
    requestMessages,
    lastAssistantMessage,
    formattedResults
  )
  const outcome3 = await attempt(attempt3Messages, baseRound + 2)
  if (outcome3 === 'good') return

  logResearchLoop('synthesis-retry', { attempt: 3, outcome: outcome3, baseRound })
  const deterministicAnswer = buildDeterministicSearchSynthesis(savedToolResults)
  logResearchLoop('synthesis-failed', {
    deterministicAnswerUsed: Boolean(deterministicAnswer),
    searchBudgetRemaining: Math.max(0, effectiveSearchBudget - totalSearchCount),
  })
  const failureContent = baselineContent + (deterministicAnswer || SEARCH_SYNTHESIS_FAILURE_MESSAGE)
  setAccumulatedContent(failureContent)
  setFinishReason(null)
  updateStreamingState({ content: failureContent, phase: 'answering' })
  publishStreamingProgress({ content: failureContent, phase: 'answering' })
}

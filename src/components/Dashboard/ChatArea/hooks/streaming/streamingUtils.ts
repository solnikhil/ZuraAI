/**
 * Shared utilities for provider-specific streaming hooks
 *
 * Centralizes duplicated logic (tool call accumulation, thinking blocks,
 * research callbacks, token estimation, metrics, etc.) so each provider
 * hook only contains provider-specific stream invocation and options.
 */

import type { ThinkingBlock, ToolCallResult, Message } from '../../../../../contexts/ChatHistoryContext'
import type { OpenRouterResponse } from '../../../../../tools/types'
import type { UpdateStreamingCallback } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const UPDATE_INTERVAL = 120 // ms – normal update cadence
export const SAFETY_CAP = 50 // absolute max research rounds
export const MAX_RESEARCH_ROUNDS = 6 // practical cap before forcing final answer

/** Compute per-chunk UI update cadence. */
export function getStreamingUpdateInterval(): number {
  return UPDATE_INTERVAL
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeltaToolCall {
  index?: number
  id?: string
  type?: string
  function?: { name?: string; arguments?: string }
}

// ---------------------------------------------------------------------------
// Token estimation (Groq / Alibaba)
// ---------------------------------------------------------------------------

/** ~4 chars per token heuristic when API doesn't return usage */
export function estimateOutputTokens(content: string): number {
  if (!content || content.length === 0) return 0
  return Math.ceil(content.length / 4)
}

/**
 * Fill missing usage with estimates when API returns no usage data.
 *
 * When `deriveInputFromTotal` is true (Alibaba), derives inputTokens
 * from totalTokens − outputTokens when the API only returns those two.
 */
export function fillMissingUsage(
  usage: { inputTokens: number; outputTokens: number; totalTokens: number },
  content: string,
  options?: { deriveInputFromTotal?: boolean }
): { inputTokens: number; outputTokens: number; totalTokens: number } {
  let { inputTokens, outputTokens, totalTokens } = usage

  // Alibaba: derive input from total − output
  if (options?.deriveInputFromTotal && inputTokens === 0 && totalTokens > 0 && outputTokens > 0) {
    inputTokens = Math.max(0, totalTokens - outputTokens)
  }

  // Early return when we have sufficient data
  if (outputTokens > 0 && totalTokens > 0 && (!options?.deriveInputFromTotal || inputTokens > 0)) {
    return { inputTokens, outputTokens, totalTokens }
  }

  const estimatedOutput = outputTokens > 0 ? outputTokens : estimateOutputTokens(content)
  if (estimatedOutput === 0) return { inputTokens, outputTokens, totalTokens }
  return {
    inputTokens,
    outputTokens: estimatedOutput,
    totalTokens: totalTokens > 0 ? totalTokens : inputTokens + estimatedOutput,
  }
}

// ---------------------------------------------------------------------------
// Tool call accumulation
// ---------------------------------------------------------------------------

/** Accumulate delta tool calls from a streaming chunk into an accumulator array (mutates in place) */
export function accumulateDeltaToolCalls(
  accumulator: DeltaToolCall[],
  deltaToolCalls: DeltaToolCall[]
): void {
  for (const tc of deltaToolCalls) {
    const index = tc.index ?? 0
    if (!accumulator[index]) {
      accumulator[index] = { id: tc.id || '', type: tc.type || 'function', function: { name: '', arguments: '' } }
    }
    if (tc.function?.name) accumulator[index].function!.name += tc.function.name
    if (tc.function?.arguments) accumulator[index].function!.arguments += tc.function.arguments
  }
}

// ---------------------------------------------------------------------------
// Reconstructing assistant messages / responses
// ---------------------------------------------------------------------------

/** Reconstruct an assistant message with tool calls from accumulated data */
export function reconstructToolCallMessage(
  content: string,
  toolCallsAccumulator: DeltaToolCall[]
) {
  return {
    role: 'assistant' as const,
    content,
    tool_calls: toolCallsAccumulator.filter(tc => tc?.id).map(tc => ({
      id: tc.id || '',
      type: 'function' as const,
      function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' },
    })),
  }
}

/** Build a response object with fallback context for tool call handling */
export function buildResponseWithFallback(
  reconstructedMessage: { role: string; content: string; tool_calls?: unknown[] },
  messages: Array<{ role: string; content?: string | unknown; [key: string]: unknown }>,
  reasoning?: string
): OpenRouterResponse & { _fallbackContext?: { lastUserMessage?: string; reasoning?: string } } {
  const lastUserMsg = [...messages].reverse().find(m => m?.role === 'user')
  const lastUserContent = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : undefined
  return {
    choices: [{ message: reconstructedMessage as OpenRouterResponse['choices'][0]['message'] }],
    _fallbackContext: {
      lastUserMessage: lastUserContent,
      reasoning: reasoning || undefined,
    },
  } as OpenRouterResponse & { _fallbackContext?: { lastUserMessage?: string; reasoning?: string } }
}

// ---------------------------------------------------------------------------
// Thinking blocks
// ---------------------------------------------------------------------------

/** Build thinking blocks from web_search and research_plan tool results (returns a new array) */
export function buildThinkingBlocksFromResults(
  toolResults: ToolCallResult[],
  existingBlocks: ThinkingBlock[]
): ThinkingBlock[] {
  const blocks = [...existingBlocks]
  for (const tr of toolResults) {
    if (tr.toolCall.name === 'web_search') {
      const args = tr.toolCall.arguments
      const q = typeof args === 'object' ? (args as Record<string, unknown>)?.query : args
      blocks.push({
        type: 'searching',
        query: String(q || ''),
        timestamp: Date.now(),
        toolInput: typeof args === 'object' ? args : { query: args },
        toolOutput: { success: tr.result.success, data: tr.result.data, error: tr.result.error, executionTime: tr.result.executionTime },
      })
    } else if (tr.toolCall.name === 'research_plan' && Array.isArray(tr.toolCall.arguments?.steps)) {
      for (const step of tr.toolCall.arguments.steps) {
        blocks.push({
          type: 'searching',
          query: String(step?.query || ''),
          timestamp: Date.now(),
          toolInput: { query: step?.query },
          toolOutput: { success: tr.result.success, data: tr.result.data, error: tr.result.error, executionTime: tr.result.executionTime },
        })
      }
    }
  }
  return blocks
}

// ---------------------------------------------------------------------------
// Tool result mapping
// ---------------------------------------------------------------------------

/** Map tool results for persistent storage (strips internal data) */
export function mapToolResultsForStorage(toolResults: ToolCallResult[]): ToolCallResult[] {
  return toolResults.map(tr => ({
    toolCall: { id: tr.toolCall.id, name: tr.toolCall.name, arguments: tr.toolCall.arguments },
    result: { success: tr.result.success, data: tr.result.data, error: tr.result.error, executionTime: tr.result.executionTime },
  }))
}

/** Merge new tool results into existing saved results */
export function mergeSavedToolResults(
  existing: ToolCallResult[] | undefined,
  newResults: ToolCallResult[]
): ToolCallResult[] {
  const mapped = mapToolResultsForStorage(newResults)
  return existing ? [...existing, ...mapped] : mapped
}

// ---------------------------------------------------------------------------
// Search query extraction
// ---------------------------------------------------------------------------

/** Extract search query string from the first web_search or research_plan result */
export function extractSearchQuery(
  webSearchCalls: ToolCallResult[],
  researchPlanCalls: ToolCallResult[]
): string {
  const firstSearch = webSearchCalls[0] || researchPlanCalls[0]
  if (!firstSearch) return ''
  if (firstSearch.toolCall.name === 'research_plan') {
    return (
      ((firstSearch.toolCall.arguments as Record<string, unknown>)?.steps as Array<{ query?: string }> | undefined)?.[0]?.query ?? ''
    )
  }
  const args = firstSearch.toolCall.arguments
  return String(typeof args === 'object' ? (args as Record<string, unknown>)?.query : args) || ''
}

/** Check if tool results contain web search or research plan calls */
export function hasSearchResults(toolResults: ToolCallResult[] | undefined): boolean {
  return (toolResults || []).some(r => r?.toolCall?.name === 'web_search' || r?.toolCall?.name === 'research_plan')
}

// ---------------------------------------------------------------------------
// Research plan callbacks
// ---------------------------------------------------------------------------

/** Create the research plan callbacks passed to handleToolCalls */
export function createResearchPlanCallbacks(
  updateStreaming: (updates: Record<string, unknown>) => void,
  throttledUpdateStreamingMessage: UpdateStreamingCallback,
  sessionId: string,
  messageId: string
) {
  return {
    onToolStart: (toolCall: { id: string; name: string; arguments: Record<string, unknown> }) => {
      if (toolCall?.name === 'research_plan') {
        const args = toolCall.arguments as { topic?: string; steps?: Array<{ stepNumber: number; query: string; rationale?: string }> }
        if (args?.topic && Array.isArray(args?.steps)) {
          const plan = { topic: args.topic, steps: args.steps }
          updateStreaming({ researchPlan: plan })
          throttledUpdateStreamingMessage(sessionId, messageId, { researchPlan: plan } as Partial<Message>)
        }
      }
    },
    onResearchPlanProgress: (currentStep: number, totalSteps: number, query?: string) => {
      updateStreaming({ researchProgress: { currentStep, totalSteps, currentQuery: query } })
      throttledUpdateStreamingMessage(sessionId, messageId, {
        researchProgress: { currentStep, totalSteps, currentQuery: query },
      } as Partial<Message>)
    },
  }
}

// ---------------------------------------------------------------------------
// Research plan persistence
// ---------------------------------------------------------------------------

/** Extract research plan data from saved tool results for final message update */
export function extractResearchPlanData(savedToolResults: ToolCallResult[] | undefined): Record<string, unknown> {
  const researchPlanResult = (savedToolResults || []).find(r => r?.toolCall?.name === 'research_plan')
  const rpArgs = researchPlanResult?.toolCall?.arguments as
    | { topic?: string; steps?: Array<{ stepNumber: number; query: string; rationale?: string }> }
    | undefined
  if (rpArgs?.topic && Array.isArray(rpArgs?.steps)) {
    return {
      researchPlan: { topic: rpArgs.topic, steps: rpArgs.steps },
      researchProgress: { currentStep: rpArgs.steps.length, totalSteps: rpArgs.steps.length },
    }
  }
  return {}
}

// ---------------------------------------------------------------------------
// Initial tool result processing
// ---------------------------------------------------------------------------

/**
 * Process the first round of tool results after the initial stream completes.
 *
 * Returns search-related UI updates (research status, thinking blocks) and
 * the mapped tool results for storage.
 */
export function processInitialToolResults(
  toolResults: ToolCallResult[],
  localThinkingBlocks: ThinkingBlock[],
  _researchMaxRounds?: number,
): {
  updatedThinkingBlocks: ThinkingBlock[]
  savedToolResults: ToolCallResult[]
  hasSearchCalls: boolean
  searchQuery: string
} {
  const webSearchCalls = toolResults.filter(tr => tr.toolCall.name === 'web_search')
  const researchPlanCalls = toolResults.filter(tr => tr.toolCall.name === 'research_plan')
  const hasSearchCalls = webSearchCalls.length > 0 || researchPlanCalls.length > 0
  const searchQuery = hasSearchCalls ? extractSearchQuery(webSearchCalls, researchPlanCalls) : ''
  const updatedThinkingBlocks = hasSearchCalls ? buildThinkingBlocksFromResults(toolResults, localThinkingBlocks) : localThinkingBlocks
  const savedToolResults = mapToolResultsForStorage(toolResults)

  return { updatedThinkingBlocks, savedToolResults, hasSearchCalls, searchQuery }
}

// ---------------------------------------------------------------------------
// Stream metrics
// ---------------------------------------------------------------------------

/** Compute stream performance metrics (latency, TTFT, TPS) */
export function computeStreamMetrics(
  startTime: number,
  firstTokenTime: number | null,
  outputTokens: number
): { latency: number; ttft?: number; tps?: number } {
  const endTime = performance.now()
  const latency = Math.round(endTime - startTime)
  const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : undefined
  const tps = outputTokens > 0 && latency > 0 ? (outputTokens / (latency / 1000)) : undefined
  return { latency, ttft, tps }
}

// ---------------------------------------------------------------------------
// Follow-up message building (research loop)
// ---------------------------------------------------------------------------

/** Build the follow-up message array for a research loop iteration */
export function buildFollowUpMessages(
  researchContextMsg: string,
  researchRound: number,
  totalSearchCount: number,
  optimizedHistory: Array<{ role: string; content: string; tool_calls?: unknown[] }>,
  lastAssistantMessage: { role: string; content: string; tool_calls?: unknown[] },
  formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
): Array<{ role: string; content: string; tool_calls?: unknown[] }> {
  const messages: Array<{ role: string; content: string; tool_calls?: unknown[] }> = []
  if (researchContextMsg) messages.push({ role: 'system', content: researchContextMsg })
  if (researchRound >= 4) {
    messages.push({
      role: 'system',
      content: `\n\n*** STOP SEARCHING *** You have ${totalSearchCount} search results. Your next response MUST be your final synthesized answer. Do NOT call web_search again. Provide your comparison now.\n\n`,
    })
  }
  messages.push(...optimizedHistory, lastAssistantMessage, ...formattedResults)
  return messages
}

// ---------------------------------------------------------------------------
// Horizontal rule stripping
// ---------------------------------------------------------------------------

/** Strip standalone --- (markdown horizontal rule) from content when web search was used */
export function stripStandaloneHorizontalRule(content: string): string {
  if (!content || !content.trim()) return content
  return content
    .replace(/\n\s*---\s*\n?\s*$/g, '\n') // trailing ---
    .replace(/^\s*---\s*\n?\s*/g, '') // leading ---
    .trimEnd()
}

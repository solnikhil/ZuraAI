/**
 * Shared utilities for provider-specific streaming hooks
 *
 * Centralizes duplicated logic (tool call accumulation, thinking blocks,
 * research callbacks, token estimation, metrics, etc.) so each provider
 * hook only contains provider-specific stream invocation and options.
 */

import type {
  ThinkingBlock,
  ToolCallResult,
  Message,
} from '../../../../../chat/types'
import type {
  ReasoningDetail,
  ServiceAssistantMessage,
} from '../../../../../services/types'
import type { ToolCallingResponse } from '../../../../../tools/types'
import { isSkippedBuiltinToolResult } from '../../../../../tools/types'
import type { AgentVerificationStrategy } from '../../../../../agent/reliability'
import { buildAgentVerificationPrompt } from '../../../../../agent/reliability'
import type { UpdateStreamingCallback } from './types'
import { normalizeInlineToolCallMarkup } from '../../../../../tools/adapters/openrouterToolCalls'
import type { SearchEvidenceItem } from '../../../../../research/types'
import {
  STREAM_MAX_RESEARCH_ROUNDS,
  STREAM_RESEARCH_SAFETY_CAP,
  STREAM_UPDATE_INTERVAL_MS,
} from '../../../../../providers'

// Constants

const UPDATE_INTERVAL = STREAM_UPDATE_INTERVAL_MS
export const SAFETY_CAP = STREAM_RESEARCH_SAFETY_CAP
export const MAX_RESEARCH_ROUNDS = STREAM_MAX_RESEARCH_ROUNDS
export const FINAL_SYNTHESIS_PROMPT =
  '\n\n*** FINAL SYNTHESIS REQUIRED *** You have enough search results. Do not call any more tools or web_search. Provide your final synthesized answer now using only the results already returned. If the results are inconclusive, say that clearly, summarize the strongest relevant evidence, and state what could not be verified. Never return an empty response.\n\n'
export const FINAL_SYNTHESIS_BUDGET_EXHAUSTED_PROMPT =
  '\n\n*** FINAL SYNTHESIS REQUIRED: WEB SEARCH BUDGET EXHAUSTED *** The available web_search budget for this response has been used. Do not call any more tools or web_search. Provide your final synthesized answer now using only the results already returned. If the gathered evidence is incomplete or conflicting, say so clearly, summarize the strongest relevant evidence, and state what could not be verified. Never return an empty response.\n\n'
export const FINAL_SYNTHESIS_EMPTY_BATCH_PROMPT =
  '\n\n*** FINAL SYNTHESIS REQUIRED: NO EXECUTABLE WEB SEARCH REMAINED *** The last attempted web_search batch did not contain an executable query. Do not call any more tools or web_search. Provide your final synthesized answer now using only the results already returned. If the gathered evidence is incomplete or conflicting, say so clearly, summarize the strongest relevant evidence, and state what could not be verified. Never return an empty response.\n\n'
export const FINAL_SYNTHESIS_RECOVERY_PROMPT =
  '\n\n*** FINAL ANSWER REQUIRED *** Your previous synthesis attempt returned no answer. Do not call any tools or web_search. Respond with at least one concise paragraph using only the results already returned. If the evidence is inconclusive, say so directly and summarize what was checked.\n\n'
const FINAL_SYNTHESIS_PLAIN_TEXT_ONLY_PROMPT =
  '\n\n*** PLAIN TEXT ONLY FINAL ANSWER REQUIRED *** You must respond with plain assistant text only. Do not emit tool_calls, function calls, JSON, XML, markdown code fences, or any request for more searching. Do not call any tools or web_search. Write at least one concise paragraph using only the returned search results. If the evidence is inconclusive, say so directly and summarize the strongest relevant findings.\n\n'
export const SEARCH_SYNTHESIS_FAILURE_MESSAGE =
  'I gathered web search results, but the provider failed to produce a final written answer. The search results are still available above.'

const UNGROUNDED_SEARCH_SYNTHESIS_PATTERNS = [
  /\bknowledge cutoff\b/i,
  /\bmy training data\b/i,
  /\bi (?:can't|cannot|do not|don't) (?:browse|access|verify) (?:the )?(?:web|internet|current|real-time|up-to-date)/i,
  /\bconsult official documentation\b/i,
  /\bconsult (?:official documentation|recent peer-reviewed literature)\b/i,
  /\bsearch results (?:returned|yielded|provided) no (?:information|results|evidence)\b/i,
  /\bskipped (?:the )?query as (?:a )?duplicate\b/i,
  /\bwithout successful retrieval\b/i,
  /<tool_call>[\s\S]*?<\/tool_call>/i,
  /<\s*\|\s*\|\s*DSML\s*\|\s*\|\s*tool_calls\s*>/i,
  /\btool_calls\b/i,
  /invoke\s+name="web_search"/i,
]

/** Compute per-chunk UI update cadence. */
export function getStreamingUpdateInterval(): number {
  return UPDATE_INTERVAL
}

// Types

export interface DeltaToolCall {
  index?: number
  id?: string
  type?: string
  function?: { name?: string; arguments?: string }
}

// Token estimation (Groq / Alibaba)

/** ~4 chars per token heuristic when API doesn't return usage */
function estimateOutputTokens(content: string): number {
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

// Tool call accumulation

/** Accumulate delta tool calls from a streaming chunk into an accumulator array (mutates in place) */
export function accumulateDeltaToolCalls(
  accumulator: DeltaToolCall[],
  deltaToolCalls: DeltaToolCall[]
): void {
  for (const tc of deltaToolCalls) {
    const index = tc.index ?? 0
    if (!accumulator[index]) {
      accumulator[index] = {
        id: tc.id || '',
        type: tc.type || 'function',
        function: { name: '', arguments: '' },
      }
    }
    if (tc.function?.name) accumulator[index].function!.name += tc.function.name
    if (tc.function?.arguments) accumulator[index].function!.arguments += tc.function.arguments
  }
}

// Reconstructing assistant messages / responses

/** Reconstruct an assistant message with tool calls from accumulated data */
export function reconstructToolCallMessage(
  content: string,
  toolCallsAccumulator: DeltaToolCall[],
  options?: {
    reasoning?: string
    reasoningDetails?: ReasoningDetail[]
  }
) {
  return {
    role: 'assistant' as const,
    content,
    tool_calls: toolCallsAccumulator
      .filter((tc) => tc?.id)
      .map((tc) => ({
        id: tc.id || '',
        type: 'function' as const,
        function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' },
      })),
    ...(options?.reasoning ? { reasoning: options.reasoning } : {}),
    ...(options?.reasoningDetails?.length ? { reasoning_details: options.reasoningDetails } : {}),
  }
}

/** Build a response object with fallback context for tool call handling */
export function buildResponseWithFallback(
  reconstructedMessage: ServiceAssistantMessage,
  messages: Array<ServiceAssistantMessage>,
  reasoning?: string
): ToolCallingResponse & { _fallbackContext?: { lastUserMessage?: string; reasoning?: string } } {
  const lastUserMsg = [...messages].reverse().find((m) => m?.role === 'user')
  const lastUserContent = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : undefined
  return {
    choices: [{ message: reconstructedMessage as ToolCallingResponse['choices'][0]['message'] }],
    _fallbackContext: {
      lastUserMessage: lastUserContent,
      reasoning: reasoning || undefined,
    },
  } as ToolCallingResponse & { _fallbackContext?: { lastUserMessage?: string; reasoning?: string } }
}

// Thinking blocks

/** Build persisted inline timeline blocks from completed tool results. */
export function buildThinkingBlocksFromResults(
  toolResults: ToolCallResult[],
  existingBlocks: ThinkingBlock[]
): ThinkingBlock[] {
  const blocks = [...existingBlocks]
  for (const tr of toolResults) {
    const args = tr.toolCall.arguments
    const normalizedArgs = typeof args === 'object' ? args : { query: args }
    const wasSkipped = isSkippedBuiltinToolResult(tr.result?.metadata)

    if (tr.toolCall.name === 'web_search') {
      if (wasSkipped) {
        continue
      }
      const q = typeof args === 'object' ? (args as Record<string, unknown>)?.query : args
      blocks.push({
        type: 'searching',
        toolName: tr.toolCall.name,
        query: String(q || ''),
        timestamp: Date.now(),
        toolInput: normalizedArgs,
        toolOutput: {
          success: tr.result?.success ?? false,
          data: tr.result?.data,
          error: tr.result?.error,
          executionTime: tr.result?.executionTime,
          metadata: tr.result?.metadata,
        },
      })
      continue
    }

    blocks.push({
      type: 'tool',
      toolName: tr.toolCall.name,
      timestamp: Date.now(),
      toolInput: normalizedArgs,
      toolOutput: {
        success: tr.result?.success ?? false,
        data: tr.result?.data,
        error: tr.result?.error,
        executionTime: tr.result?.executionTime,
        metadata: tr.result?.metadata,
      },
    })
  }
  return blocks
}

/** Create a persisted reasoning block from a completed active thinking segment. */
function createThinkingBlock(
  content: string | undefined,
  duration?: number
): ThinkingBlock | null {
  const normalizedContent = content?.trim()
  if (!normalizedContent) return null

  return {
    type: 'thinking',
    content: normalizedContent,
    ...(duration !== undefined ? { duration: Math.max(0, duration) } : {}),
    timestamp: Date.now(),
  }
}

/** Append a completed thinking segment as its own block. */
export function appendCompletedThinkingBlock(
  existingBlocks: ThinkingBlock[],
  content: string | undefined,
  duration?: number
): ThinkingBlock[] {
  const block = createThinkingBlock(content, duration)
  return block ? [...existingBlocks, block] : existingBlocks
}

/** Join completed reasoning blocks and any active segment for non-UI fallback context. */
export function getThinkingTranscript(
  blocks: ThinkingBlock[],
  activeThinking?: string
): string | undefined {
  const completedThinking = blocks
    .filter((block) => block.type === 'thinking' && block.content)
    .map((block) => block.content!.trim())
    .filter(Boolean)

  const active = activeThinking?.trim()
  const segments = active ? [...completedThinking, active] : completedThinking

  return segments.length > 0 ? segments.join('\n\n---\n\n') : undefined
}

// Tool result mapping

/** Map tool results for persistent storage (strips internal data) */
function mapToolResultsForStorage(toolResults: ToolCallResult[]): ToolCallResult[] {
  return toolResults.map((tr) => ({
    toolCall: { id: tr.toolCall.id, name: tr.toolCall.name, arguments: tr.toolCall.arguments },
    result: {
      success: tr.result?.success ?? false,
      data: tr.result?.data,
      error: tr.result?.error,
      executionTime: tr.result?.executionTime,
      metadata: tr.result?.metadata,
    },
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

/** Push persisted tool results into the active streaming state and message shell. */
export function publishStreamingToolResults(
  updateStreaming: (updates: Record<string, unknown>) => void,
  updateStreamingMessage: UpdateStreamingCallback,
  sessionId: string,
  messageId: string,
  savedToolResults: ToolCallResult[] | undefined,
  _thinkingBlocks?: ThinkingBlock[]
): void {
  if (!savedToolResults || savedToolResults.length === 0) {
    return
  }

  const updates: Partial<Message> = {
    toolResults: savedToolResults,
  }

  updateStreaming(updates as Record<string, unknown>)
  updateStreamingMessage(sessionId, messageId, updates)
}

// Search query extraction

/** Extract search query string from the first web_search result. */
function extractSearchQuery(webSearchCalls: ToolCallResult[]): string {
  const firstSearch = webSearchCalls[0]
  if (!firstSearch) return ''
  const args = firstSearch.toolCall.arguments
  return String(typeof args === 'object' ? (args as Record<string, unknown>)?.query : args) || ''
}

function isExecutedWebSearchResult(result: ToolCallResult): boolean {
  return (
    result.toolCall.name === 'web_search' &&
    !isSkippedBuiltinToolResult(result.result?.metadata)
  )
}

/** Check if tool results contain web search calls. */
export function hasSearchResults(toolResults: ToolCallResult[] | undefined): boolean {
  return (toolResults || []).some((r) => isExecutedWebSearchResult(r))
}

// Initial tool result processing

/**
 * Process the first round of tool results after the initial stream completes.
 *
 * Returns search-related UI updates (research status, thinking blocks) and
 * the mapped tool results for storage.
 */
export function processInitialToolResults(
  toolResults: ToolCallResult[],
  localThinkingBlocks: ThinkingBlock[]
): {
  updatedThinkingBlocks: ThinkingBlock[]
  savedToolResults: ToolCallResult[]
  hasSearchCalls: boolean
  searchQuery: string
} {
  const webSearchCalls = toolResults.filter((tr) => tr.toolCall.name === 'web_search')
  const executedWebSearchCalls = webSearchCalls.filter((tr) => isExecutedWebSearchResult(tr))
  const hasSearchCalls = executedWebSearchCalls.length > 0
  const searchQuery = hasSearchCalls ? extractSearchQuery(executedWebSearchCalls) : ''
  const updatedThinkingBlocks = toolResults.length > 0
    ? buildThinkingBlocksFromResults(toolResults, localThinkingBlocks)
    : localThinkingBlocks
  const savedToolResults = mapToolResultsForStorage(toolResults)

  return { updatedThinkingBlocks, savedToolResults, hasSearchCalls, searchQuery }
}

// Stream metrics

/** Compute stream performance metrics (latency, TTFT, TPS) */
export function computeStreamMetrics(
  startTime: number,
  firstTokenTime: number | null,
  outputTokens: number
): { latency: number; ttft?: number; tps?: number } {
  const endTime = performance.now()
  const latency = Math.round(endTime - startTime)
  const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : undefined
  const tps = outputTokens > 0 && latency > 0 ? outputTokens / (latency / 1000) : undefined
  return { latency, ttft, tps }
}

// Follow-up message building (research loop)

/** Build the follow-up message array for a research loop iteration */
export function buildFollowUpMessages(
  researchContextMsg: string,
  _researchRound: number,
  _totalSearchCount: number,
  optimizedHistory: Array<ServiceAssistantMessage>,
  lastAssistantMessage: ServiceAssistantMessage,
  formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
): Array<ServiceAssistantMessage> {
  const messages: Array<ServiceAssistantMessage> = []
  if (researchContextMsg) messages.push({ role: 'system', content: researchContextMsg })
  messages.push(...optimizedHistory, lastAssistantMessage, ...formattedResults)
  return messages
}

export function buildAgentVerificationMessages(
  strategy: AgentVerificationStrategy,
  researchContextMsg: string,
  researchRound: number,
  totalSearchCount: number,
  optimizedHistory: Array<ServiceAssistantMessage>,
  lastAssistantMessage: ServiceAssistantMessage,
  formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>,
  options?: { recoveryAttempt?: boolean }
): Array<ServiceAssistantMessage> {
  return [
    { role: 'system', content: buildAgentVerificationPrompt(strategy, options) },
    ...buildFollowUpMessages(
      researchContextMsg,
      researchRound,
      totalSearchCount,
      optimizedHistory,
      lastAssistantMessage,
      formattedResults
    ),
  ]
}

/** Build a final no-tools synthesis request after the research loop is capped. */
export function buildFinalSynthesisMessages(
  researchContextMsg: string,
  researchRound: number,
  totalSearchCount: number,
  optimizedHistory: Array<ServiceAssistantMessage>,
  lastAssistantMessage: ServiceAssistantMessage,
  formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>,
  stopReason?: 'budget' | 'empty-batch' | 'sufficient-results'
): Array<ServiceAssistantMessage> {
  const prompt =
    stopReason === 'budget'
      ? FINAL_SYNTHESIS_BUDGET_EXHAUSTED_PROMPT
      : stopReason === 'empty-batch'
        ? FINAL_SYNTHESIS_EMPTY_BATCH_PROMPT
        : FINAL_SYNTHESIS_PROMPT

  return [
    { role: 'system', content: prompt },
    ...buildFollowUpMessages(
      researchContextMsg,
      researchRound,
      totalSearchCount,
      optimizedHistory,
      lastAssistantMessage,
      formattedResults
    ),
  ]
}

export function buildRecoverySynthesisMessages(
  researchContextMsg: string,
  researchRound: number,
  totalSearchCount: number,
  optimizedHistory: Array<ServiceAssistantMessage>,
  lastAssistantMessage: ServiceAssistantMessage,
  formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
): Array<ServiceAssistantMessage> {
  return [
    { role: 'system', content: FINAL_SYNTHESIS_RECOVERY_PROMPT },
    ...buildFollowUpMessages(
      researchContextMsg,
      researchRound,
      totalSearchCount,
      optimizedHistory,
      lastAssistantMessage,
      formattedResults
    ),
  ]
}

export function buildPlainTextOnlySynthesisMessages(
  researchContextMsg: string,
  researchRound: number,
  totalSearchCount: number,
  optimizedHistory: Array<ServiceAssistantMessage>,
  lastAssistantMessage: ServiceAssistantMessage,
  formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
): Array<ServiceAssistantMessage> {
  return [
    { role: 'system', content: FINAL_SYNTHESIS_PLAIN_TEXT_ONLY_PROMPT },
    ...buildFollowUpMessages(
      researchContextMsg,
      researchRound,
      totalSearchCount,
      optimizedHistory,
      lastAssistantMessage,
      formattedResults
    ),
  ]
}

// Horizontal rule stripping

/** Strip standalone --- (markdown horizontal rule) from content when web search was used */
export function stripStandaloneHorizontalRule(content: string): string {
  if (!content || !content.trim()) return content
  return content
    .replace(/\n\s*---\s*\n?\s*$/g, '\n') // trailing ---
    .replace(/^\s*---\s*\n?\s*/g, '') // leading ---
    .trimEnd()
}

export function extractSearchEvidenceItems(
  toolResults: ToolCallResult[] | undefined
): SearchEvidenceItem[] {
  const evidence: SearchEvidenceItem[] = []
  const seen = new Set<string>()

  for (const result of toolResults || []) {
    if (result.toolCall.name !== 'web_search' || !result.result?.success) continue
    const args = result.toolCall.arguments
    const query = String(
      typeof args === 'object' ? (args as Record<string, unknown>)?.query : args
    ).trim()
    const data = result.result?.data
    const rawResults =
      data && typeof data === 'object' && Array.isArray((data as { results?: unknown[] }).results)
        ? (data as { results: unknown[] }).results
        : []

    for (const raw of rawResults) {
      if (!raw || typeof raw !== 'object') continue
      const item = raw as Record<string, unknown>
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      const url = typeof item.url === 'string' ? item.url.trim() : ''
      const snippet = typeof item.snippet === 'string'
        ? item.snippet.replace(/\s+/g, ' ').trim()
        : ''
      const source = typeof item.source === 'string' ? item.source.trim() : ''
      const date = typeof item.date === 'string' ? item.date.trim() : ''
      const score = typeof item.score === 'number' && Number.isFinite(item.score)
        ? item.score
        : undefined
      if (!title && !snippet) continue
      const key = `${query}\n${url || title}\n${snippet.slice(0, 80)}`
      if (seen.has(key)) continue
      seen.add(key)
      evidence.push({
        query,
        title: title || source || 'Search result',
        url,
        source,
        snippet,
        ...(date ? { date } : {}),
        ...(score !== undefined ? { score } : {}),
      })
    }
  }

  return evidence
}

export function shouldRetryUngroundedSearchSynthesis(content: string): boolean {
  const normalized = normalizeInlineToolCallMarkup(content).replace(/\s+/g, ' ').trim()
  if (!normalized) return false

  return UNGROUNDED_SEARCH_SYNTHESIS_PATTERNS.some((pattern) => pattern.test(normalized))
}

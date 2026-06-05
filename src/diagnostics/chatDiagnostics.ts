import type { NormalizedUsage } from '../providers/providerRuntimeTypes'
import type { ResearchState } from '../research/types'

export type ChatDiagnosticPhase =
  | 'context-optimized'
  | 'request-start'
  | 'request-shape'
  | 'round-start'
  | 'round-finish'
  | 'usage'
  | 'tool-start'
  | 'tool-complete'
  | 'provider-error'
  | 'finish'
  | 'stream-chunk'
  | 'research-state'

/**
 * Coalesced provider streaming chunk summary captured by the dev-only chat debug panel.
 *
 * Multiple provider deltas are aggregated client-side (~50 ms windows) before being
 * persisted as a single diagnostic event so the JSONL log doesn't explode token-by-token.
 */
export interface ChatDiagnosticStreamChunk {
  chunkIndex: number
  cumulativeTextLength: number
  textDelta?: string
  toolCallDeltaCount?: number
}

export interface ChatDiagnosticMessageSummary {
  role: string
  contentType: 'text' | 'parts' | 'empty'
  textLength: number
  textPreview?: string
  partTypes?: string[]
}

export interface ChatDiagnosticToolSummary {
  id?: string
  name: string
  arguments?: Record<string, unknown>
  success?: boolean
  executionTime?: number
  origin?: string
  error?: string
}

export interface ChatDiagnosticContextTrace {
  model: string
  maxTokens: number
  reserveForResponse: number
  availableTokens: number
  originalTokens: number
  finalTokens: number
  wasTruncated: boolean
  insertedSummary: boolean
  originalMessageCount: number
  finalMessageCount: number
  keptMessageIds?: string[]
  droppedMessageIds?: string[]
}

export interface ChatDiagnosticRequestShape {
  roleOrder: string[]
  textLengths: number[]
  contentTypes: Array<'text' | 'parts' | 'empty'>
  partTypes: string[][]
  hasReasoning: boolean[]
  hasThinking: boolean[]
  toolCount: number
  toolChoice?: string
  cacheMarkerCount: number
}

export interface ChatDiagnosticEvent {
  sessionId: string
  messageId: string
  timestamp?: number
  provider?: string
  model?: string
  phase: ChatDiagnosticPhase
  round?: number
  roundType?: string
  messageCount?: number
  messages?: ChatDiagnosticMessageSummary[]
  context?: ChatDiagnosticContextTrace
  requestShape?: ChatDiagnosticRequestShape
  usage?: NormalizedUsage
  rawUsage?: Record<string, unknown>
  latency?: number
  finishReason?: string
  tool?: ChatDiagnosticToolSummary
  streamChunk?: ChatDiagnosticStreamChunk
  researchState?: ResearchState
  leakedMarkupFormat?: 'dsml' | 'xml'
  recoveredQueryCount?: number
  deterministicAnswerUsed?: boolean
  searchBudgetRemaining?: number
  attemptedQueries?: string[]
  executedQueries?: string[]
  skippedReason?: string
  error?: string
}

export const CHAT_DIAGNOSTIC_MAX_EVENTS = 500
export const CHAT_DIAGNOSTIC_MAX_BYTES = 2 * 1024 * 1024

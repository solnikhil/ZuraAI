/**
 * Shared types for provider-specific streaming hooks
 *
 */

import type {
  FileAttachment,
  Message,
  ThinkingBlock,
  ToolCallResult,
} from '../../../../../contexts/ChatHistoryContext'
import type { ToolCallingResponse } from '../../../../../tools/types'
import type { MessageContent, ToolDefinition } from '../../../../../services/types'
import type { ActiveProviderId } from '../../../../../providers'

/**
 * Common streaming result returned by all provider hooks
 */
export interface StreamingResult {
  /** Final accumulated content */
  content: string
  /** Model identifier (e.g., 'openrouter/gpt-4') */
  model: string
  /** Thinking/reasoning content (if supported by provider) */
  thinking?: string
  /** Thinking duration in ms */
  thinkingDuration?: number
  /** Array of thinking blocks for research mode */
  thinkingBlocks?: ThinkingBlock[]
  /** Tool results from function calls */
  toolResults?: ToolCallResult[] | null
  /** Generated files returned by the provider */
  files?: FileAttachment[]
  /** Token usage statistics */
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    thinkingTokens?: number
    tps?: number
    ttft?: number
    cachedInputTokens?: number
    cachedOutputTokens?: number
  }
  /** Response latency in ms */
  latency?: number
  /** Finish reason from the API */
  finishReason?: string
}

export type { FileAttachment }

export interface NormalizedUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  thinkingTokens?: number
  cachedInputTokens?: number
  cachedOutputTokens?: number
}

export interface NormalizedToolCallDelta {
  index?: number
  id?: string
  type?: 'function'
  function?: {
    name?: string
    arguments?: string
  }
}

export type NormalizedStreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'reasoning-delta'; delta: string }
  | { type: 'tool-call-delta'; delta: NormalizedToolCallDelta[] }
  | { type: 'file-delta'; files: FileAttachment[] }
  | { type: 'usage'; usage: NormalizedUsage }
  | { type: 'citation'; citations: string[] }
  | { type: 'finish'; finishReason?: string | null }
  | { type: 'error'; error: Error }

export interface StreamRequest {
  provider: ActiveProviderId
  model: string
  messages: Array<{
    role: string
    content: string | MessageContent[]
    images?: string[]
    tool_calls?: unknown[]
    thinking?: string
  }>
  temperature?: number
  maxTokens?: number
  streamResponses?: boolean
  tools?: ToolDefinition[] | null
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  modalities?: Array<'text' | 'image'>
  signal?: AbortSignal
}

export interface ProviderStreamClient {
  stream: (request: StreamRequest) => AsyncGenerator<NormalizedStreamEvent, void, unknown>
}

/**
 * Common options for provider streaming functions
 */
export interface ProviderStreamingOptions {
  /** Target session ID */
  sessionId: string
  /** Streaming message ID */
  messageId: string
  /** Optimized conversation history */
  messages: Array<{
    role: string
    content: string | MessageContent[]
    images?: string[]
    tool_calls?: unknown[]
    thinking?: string
  }>
  /** Start time for latency calculation */
  startTime: number
  /** Abort signal for cancellation */
  signal?: AbortSignal
}

/**
 * Options for providers that support tool calling
 */
export interface ToolCallingOptions extends ProviderStreamingOptions {
  /** Maximum research rounds */
  researchMaxRounds: number
}

/**
 * Options for OpenRouter provider
 */
export interface OpenRouterStreamingOptions extends ToolCallingOptions {
  /** Force web search tool call */
  forceWebSearch: boolean
}

/**
 * Callback for updating streaming message content
 */
export type UpdateStreamingCallback = (
  sessionId: string,
  messageId: string,
  updates: Partial<Message>
) => void

/**
 * Callback for flushing throttled updates
 */
export type FlushCallback = () => void

export interface HandleToolCallsOptions {
  onToolStart?: (toolCall: { id: string; name: string; arguments: Record<string, unknown> }) => void
  onToolComplete?: (result: ToolCallResult) => void
}

/**
 * Tool calling hook interface
 */
export interface ToolCallingHook {
  canUseTools: boolean
  getToolsForRequest: () => ToolDefinition[] | null
  handleToolCalls: (
    response: ToolCallingResponse,
    options?: HandleToolCallsOptions
  ) => Promise<{
    hasTools: boolean
    toolResults: ToolCallResult[]
    formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
    needsFollowUp: boolean
  }>
  getResearchContext: (searchCount: number, maxRounds: number) => string
}

/**
 * Settings required for streaming
 */
export interface StreamingSettings {
  aiModel: string
  modelProvider: string
  temperature: number
  maxTokens: number
  streamResponses: boolean
  /** Web search prompt appended when Web Search is enabled */
  webSearchPrompt?: string
  // Provider-specific API keys
  alibabaApiKey?: string
  fireworksApiKey?: string
  groqApiKey?: string
  ollamaUrl?: string
  openRouterApiKey?: string
  perplexityApiKey?: string
  configuredModels?: import('../../../../../contexts/SettingsConfigContext').ConfiguredModel[]
}

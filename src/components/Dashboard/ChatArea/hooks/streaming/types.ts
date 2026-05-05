/**
 * Shared types for provider-specific streaming hooks
 *
 */

import type {
  FileAttachment,
  Message,
  ThinkingBlock,
  ToolCallResult,
} from '../../../../../chat/types'
import type {
  NormalizedStreamEvent,
  NormalizedToolCallDelta,
  NormalizedUsage,
  ProviderRuntimeSettings,
  ProviderRuntimeStreamRequest,
} from '../../../../../providers/providerRuntimeTypes'
import type { ToolCallingResponse } from '../../../../../tools/types'
import type { ToolExecutionPolicy, ToolExecutionSummary } from '../../../../../tools/types'
import type {
  ServiceAssistantMessage,
  ToolDefinition,
} from '../../../../../services/types'
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

export type { NormalizedStreamEvent, NormalizedToolCallDelta, NormalizedUsage }

export interface StreamRequest extends ProviderRuntimeStreamRequest {}

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
  messages: Array<ServiceAssistantMessage & { images?: string[]; thinking?: string }>
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
  executionPolicy?: ToolExecutionPolicy
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
    shouldContinueResearch: boolean
    executionSummary: ToolExecutionSummary
  }>
  getResearchContext: (searchCount: number, maxRounds: number) => string
}

/**
 * Settings required for streaming
 */
export interface StreamingSettings extends ProviderRuntimeSettings {
  aiModel: string
  modelProvider: ActiveProviderId
  /** Web search prompt appended when Web Search is enabled */
  webSearchPrompt?: string
  configuredModels?: import('../../../../../contexts/SettingsConfigContext').ConfiguredModel[]
  alibabaModels?: import('../../../../../contexts/SettingsConfigContext').ConfiguredModel[]
  deepseekModels?: import('../../../../../contexts/SettingsConfigContext').ConfiguredModel[]
}

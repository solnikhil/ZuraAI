/**
 * Shared types for provider-specific streaming hooks
 * 
 * Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
 */

import type { Message, ThinkingBlock, ToolCallResult } from '../../../../../contexts/ChatHistoryContext'
import type { OpenRouterResponse } from '../../../../../tools/types'
import type { ToolDefinition } from '../../../../../services/types'

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

/**
 * Common options for provider streaming functions
 */
export interface ProviderStreamingOptions {
  /** Target session ID */
  sessionId: string
  /** Streaming message ID */
  messageId: string
  /** Optimized conversation history */
  messages: Array<{ role: string; content: string; images?: string[]; tool_calls?: unknown[]; thinking?: string }>
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

/**
 * Options for handleToolCalls (research plan UI updates)
 */
export interface HandleToolCallsOptions {
  onToolStart?: (toolCall: { id: string; name: string; arguments: Record<string, unknown> }) => void
  onToolComplete?: (result: ToolCallResult) => void
  onResearchPlanProgress?: (currentStep: number, totalSteps: number, query?: string) => void
}

/**
 * Tool calling hook interface
 */
export interface ToolCallingHook {
  canUseTools: boolean
  getToolsForRequest: () => ToolDefinition[] | null
  handleToolCalls: (response: OpenRouterResponse, options?: HandleToolCallsOptions) => Promise<{
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
  ollamaUrl?: string
  openRouterApiKey?: string
  perplexityApiKey?: string
  groqApiKey?: string
  alibabaApiKey?: string
}

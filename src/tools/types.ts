import type { McpJsonSchema, McpToolExecutionMetadata, McpToolLookupRecord } from '../mcp/types'
import type { ReasoningDetail, ServiceToolCall } from '../services/types'

export type ToolOrigin = 'builtin-main' | 'builtin-renderer' | 'mcp'

export type ToolCategory = 'search' | 'utility' | 'system' | 'browser' | 'mcp' | 'computer-use'

export interface BuiltinToolExecutionMetadata {
  origin: 'builtin-main' | 'builtin-renderer'
  executionDisposition?: 'executed' | 'skipped'
  skippedReason?: 'budget'
}

export type ToolExecutionMetadata = BuiltinToolExecutionMetadata | McpToolExecutionMetadata

export function isSkippedBuiltinToolResult(metadata?: ToolExecutionMetadata): boolean {
  return Boolean(
    metadata &&
    (metadata.origin === 'builtin-main' || metadata.origin === 'builtin-renderer') &&
    metadata.executionDisposition === 'skipped'
  )
}

export interface ToolInputSchema extends McpJsonSchema {
  type: 'object'
  properties: Record<string, McpJsonSchema>
  required?: string[]
}

interface BaseToolDescriptor {
  name: string
  description: string
  parameters: ToolInputSchema
  category: ToolCategory
  origin: ToolOrigin
  requiresApproval?: boolean
}

export interface BuiltinToolDescriptor extends BaseToolDescriptor {
  origin: 'builtin-main' | 'builtin-renderer'
}

export type ToolDescriptor = BuiltinToolDescriptor | McpToolDescriptor

export interface McpToolDescriptor extends BaseToolDescriptor {
  origin: 'mcp'
  mcp: McpToolLookupRecord & {
    serverName: string
  }
}

export function isMcpToolDescriptor(tool: ToolDescriptor): tool is McpToolDescriptor {
  return tool.origin === 'mcp'
}

export function isMcpNamespacedToolName(toolName: string): boolean {
  return /^mcp__([a-z0-9_]+)__([a-z0-9_]+)$/.test(toolName)
}

// Tool System Types
// Centralized type definitions for the tools system

/**
 * Result of a tool execution
 */
export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
  executionTime?: number
  metadata?: ToolExecutionMetadata
}

/**
 * A tool call request
 */
export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  /** Prevents execution while preserving the native call id for a corrective tool result. */
  validationError?: string
}

/**
 * Result of executing a tool call
 */
export interface ToolCallResult {
  toolCall: ToolCall
  result: ToolResult
}

export type ToolApprovalOutcome =
  | 'approved_once'
  | 'approved_session'
  | 'approved_policy'
  | 'rejected'
  | 'timed_out'
  | 'unavailable'
  | 'cancelled'
  | 'error'

export interface ToolApprovalDecision {
  approved: boolean
  outcome: ToolApprovalOutcome
}

/**
 * Approval result returned only to the call site that requested it. The token is
 * main-issued and must be forwarded by that exact call's execution closure.
 */
export interface ToolApprovalAuthorization extends ToolApprovalDecision {
  approvalToken?: string
}

export interface ToolExecutionPolicy {
  /** Opaque ChatRunController identity propagated as trusted execution metadata. */
  runId?: string
  remainingWebSearchBudget?: number
  remainingToolCallBudget?: number
  priorWebSearchQueries?: string[]
  userContextText?: string
  /**
   * Active chat session id. Threaded down to memory tools so model-saved
   * memories can record `sessionId` for traceability.
   */
  sessionId?: string
  /** Active assistant message id, used by renderer tools such as artifacts. */
  messageId?: string
}

export interface ToolExecutionSummary {
  attemptedWebSearchCount: number
  executedWebSearchCount: number
  executedWebSearchQueries: string[]
}

// Provider-specific response types

/**
 * OpenRouter/OpenAI tool call format.
 * Canonical definition lives in `ServiceToolCall` (`../services/types`);
 * this alias preserves the name used throughout the tools layer.
 */
export type OpenRouterToolCall = ServiceToolCall

/**
 * OpenRouter/OpenAI message format
 */
export interface OpenRouterMessage {
  role: string
  content: string | null
  tool_calls?: OpenRouterToolCall[]
  reasoning?: string
  reasoning_details?: ReasoningDetail[]
}

/**
 * OpenRouter/OpenAI API response format
 */
export interface OpenRouterResponse {
  choices: Array<{
    message: OpenRouterMessage
    finish_reason?: string | null
  }>
}

/**
 * Alias kept for call-sites that use the provider-agnostic name.
 */
export type ToolCallingResponse = OpenRouterResponse

// Tool result formatting types

/**
 * OpenRouter tool result message format
 */
export interface OpenRouterToolResultMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

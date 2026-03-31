import type {
    McpJsonSchema,
    McpToolExecutionMetadata,
    McpToolLookupRecord,
} from '../mcp/types'

export type ToolOrigin = 'builtin-main' | 'builtin-renderer' | 'mcp'

export type ToolCategory = 'search' | 'utility' | 'system' | 'browser' | 'mcp'

export interface BuiltinToolExecutionMetadata {
    origin: 'builtin-main' | 'builtin-renderer'
    executionDisposition?: 'executed' | 'skipped'
    skippedReason?: 'budget' | 'duplicate-query' | 'duplicate-facet'
}

export type ToolExecutionMetadata = BuiltinToolExecutionMetadata | McpToolExecutionMetadata

export function isSkippedBuiltinToolResult(
    metadata?: ToolExecutionMetadata
): boolean {
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
}

/**
 * Result of executing a tool call
 */
export interface ToolCallResult {
    toolCall: ToolCall
    result: ToolResult
}

export interface ToolExecutionPolicy {
    remainingWebSearchBudget?: number
    priorWebSearchQueries?: string[]
}

export interface ToolExecutionSummary {
    attemptedWebSearchCount: number
    executedWebSearchCount: number
    executedWebSearchQueries: string[]
}

// ==================== Provider-specific response types ====================

/**
 * OpenRouter/OpenAI message format
 */
export interface OpenRouterMessage {
    role: string
    content: string | null
    tool_calls?: OpenRouterToolCall[]
}

export interface ToolCallingMessage extends OpenRouterMessage {}

/**
 * OpenRouter/OpenAI tool call format
 */
export interface OpenRouterToolCall {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string  // JSON string
    }
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

export interface ToolCallingResponse {
    choices: Array<{
        message: ToolCallingMessage
        finish_reason?: string | null
    }>
}

// ==================== Tool result formatting types ====================

/**
 * OpenRouter tool result message format
 */
export interface OpenRouterToolResultMessage {
    role: 'tool'
    tool_call_id: string
    content: string
}

// ==================== Search result types ====================

/**
 * Web search result data
 */
export interface WebSearchData {
    results?: Array<{
        title: string
        url: string
        snippet: string
    }>
}

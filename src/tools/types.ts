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

// ==================== Provider-specific response types ====================

/**
 * OpenRouter/OpenAI message format
 */
export interface OpenRouterMessage {
    role: string
    content: string | null
    tool_calls?: OpenRouterToolCall[]
}

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

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

/**
 * Gemini content part format
 */
export interface GeminiPart {
    text?: string
    functionCall?: {
        name: string
        args: Record<string, unknown>
    }
}

/**
 * Gemini API response format
 */
export interface GeminiResponse {
    candidates?: Array<{
        content?: {
            parts?: GeminiPart[]
        }
        finishReason?: string
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

/**
 * Gemini function response format
 */
export interface GeminiFunctionResponse {
    functionResponse: {
        name: string
        response: {
            result?: unknown
            error?: string
        }
    }
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

/**
 * URL fetch result data
 */
export interface UrlFetchData {
    content?: string
}

/**
 * Calculator result data
 */
export interface CalculatorData {
    result?: number | string
}

/**
 * DateTime result data
 */
export interface DateTimeData {
    datetime?: string
    formatted?: string
}

/**
 * Clipboard result data
 */
export interface ClipboardData {
    content?: string
}

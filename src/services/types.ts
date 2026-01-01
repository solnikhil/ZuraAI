/**
 * Shared types for AI service providers
 */

// Common message format used across providers
export interface ChatMessage {
    role: string  // Keep flexible for compatibility
    content: string | MessageContent[]
    name?: string
    tool_call_id?: string
}

export interface MessageContent {
    type: 'text' | 'image_url'
    text?: string
    image_url?: {
        url: string
    }
}

// Tool definition format (OpenAI-compatible)
export interface ToolDefinition {
    type: 'function'
    function: {
        name: string
        description?: string
        parameters?: Record<string, unknown>
    }
}

// Tool call format
export interface ToolCall {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string
    }
}

// Streaming tool call (partial)
export interface StreamingToolCall {
    index?: number
    id?: string
    type?: 'function'
    function?: {
        name?: string
        arguments?: string
    }
}

// Common error response structure
export interface APIErrorResponse {
    error?: {
        message?: string
        code?: string
        type?: string
        param?: string
        failed_generation?: string
    }
    detail?: string
}

// Request body base
export interface BaseRequestBody {
    model: string
    messages: ChatMessage[]
    temperature?: number
    stream?: boolean
}

// Parse error response safely
export function parseErrorResponse(text: string): APIErrorResponse {
    try {
        return JSON.parse(text) as APIErrorResponse
    } catch {
        return {}
    }
}

// Extract error message from response
export function extractErrorMessage(
    errorData: APIErrorResponse,
    fallbackText: string,
    status: number,
    statusText: string
): string {
    return (
        errorData.error?.message ||
        errorData.detail ||
        fallbackText ||
        `HTTP ${status}: ${statusText}`
    )
}

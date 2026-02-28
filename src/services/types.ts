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
        code?: string | number
        type?: string
        param?: string
        failed_generation?: string
        // OpenRouter includes upstream provider details in metadata
        metadata?: {
            raw?: string
            provider_name?: string
            [key: string]: unknown
        }
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
// Includes HTTP status code prefix and OpenRouter upstream metadata when available
export function extractErrorMessage(
    errorData: APIErrorResponse,
    fallbackText: string,
    status: number,
    statusText: string
): string {
    const baseMessage =
        errorData.error?.message ||
        errorData.detail ||
        fallbackText ||
        statusText

    // Build a descriptive error that always includes the HTTP status code
    // so callers can reliably detect 429/401/403 from the message string
    const parts: string[] = [`${status}`]
    parts.push(baseMessage)

    // Append upstream provider context from OpenRouter metadata
    const metadata = errorData.error?.metadata
    if (metadata) {
        if (metadata.provider_name) {
            parts.push(`(provider: ${metadata.provider_name})`)
        }
        if (metadata.raw && typeof metadata.raw === 'string' && metadata.raw !== baseMessage) {
            // Truncate raw upstream error to keep message readable
            const snippet = metadata.raw.slice(0, 200)
            parts.push(`— ${snippet}`)
        }
    }

    return parts.join(' ')
}

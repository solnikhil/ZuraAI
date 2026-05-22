/**
 * Shared types for AI service providers
 */

// Common message format used across providers
export interface ChatMessage {
    role: string  // Keep flexible for compatibility
    content: string | MessageContent[]
    name?: string
    tool_call_id?: string
    reasoning?: string
    reasoning_details?: ReasoningDetail[]
}

export interface MessageContent {
    type: 'text' | 'image_url'
    text?: string
    image_url?: {
        url: string
    }
    cache_control?: {
        type: 'ephemeral'
    }
}

export interface ServiceToolCall {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string
    }
}

export interface ServiceAssistantMessage {
    role: string
    content: string | MessageContent[]
    tool_calls?: ServiceToolCall[]
    reasoning?: string
    reasoning_details?: ReasoningDetail[]
}

export interface ReasoningDetail {
    id: string | null
    format: string
    index?: number
    type?: 'summary' | 'encrypted' | 'text' | 'reasoning.summary' | 'reasoning.encrypted' | 'reasoning.text'
    text?: string
    summary?: string
    content?: string
    [key: string]: unknown
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
            parts.push(`- ${snippet}`)
        }
    }

    return parts.join(' ')
}

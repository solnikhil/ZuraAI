/**
 * OpenAI Codex CLI Provider Service
 * 
 * Integrates with Codex backend for chat completions using ChatGPT OAuth authentication.
 * Follows the same patterns as other providers (OpenRouter, Gemini, etc.)
 */

import { ChatMessage } from './types'

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Authentication state for Codex provider
 */
export interface CodexAuthState {
    isAuthenticated: boolean
    userEmail?: string
    expiresAt?: number
    error?: string
}

/**
 * Token data stored securely
 */
export interface CodexTokenData {
    accessToken: string
    refreshToken?: string
    expiresAt: number  // Unix timestamp in milliseconds
    userEmail: string
    organization?: string
}

/**
 * Streaming response chunk from Codex
 */
export interface CodexStreamChunk {
    id: string
    choices: Array<{
        delta?: {
            content?: string
            role?: string
        }
        finish_reason?: string | null
    }>
    usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
    }
}

/**
 * Complete response from Codex
 */
export interface CodexResponse {
    id: string
    choices: Array<{
        message: {
            role: string
            content: string
        }
        finish_reason: string | null
    }>
    usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
    }
}

/**
 * Options for Codex API requests
 */
export interface CodexOptions {
    temperature?: number
    maxTokens?: number
    stream?: boolean
    reasoningSummary?: 'auto' | 'concise' | 'detailed' | 'none'
}

/**
 * Available Codex models with reasoning level support
 * Based on official Codex CLI - GPT-5.2 with reasoning levels as separate entries
 * Reference: https://github.com/openai/codex
 */
export interface CodexModelInfo {
    code: string
    displayName: string
    description: string
    baseModel: string
    reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    isDefault?: boolean
}

/**
 * Official Codex CLI models with reasoning effort levels
 * Reference: https://github.com/openai/codex/blob/main/docs/config.md
 * 
 * Models: gpt-5.1-codex-max (Pro default), gpt-5.1, gpt-5.2
 * xhigh reasoning available on gpt-5.1-codex-max and gpt-5.2
 */
export const CODEX_MODELS: CodexModelInfo[] = [
    // GPT-5.1 Codex Max (default for Pro users)
    {
        code: 'gpt-5.1-codex-max-medium',
        displayName: 'GPT-5.1 Codex Max',
        description: 'Best for Pro users, balanced reasoning (default)',
        baseModel: 'gpt-5.1-codex-max',
        reasoningEffort: 'medium',
        isDefault: true
    },
    {
        code: 'gpt-5.1-codex-max-high',
        displayName: 'GPT-5.1 Codex Max (High)',
        description: 'Greater reasoning depth for complex problems',
        baseModel: 'gpt-5.1-codex-max',
        reasoningEffort: 'high'
    },
    {
        code: 'gpt-5.1-codex-max-xhigh',
        displayName: 'GPT-5.1 Codex Max (XHigh)',
        description: 'Maximum reasoning for hardest tasks',
        baseModel: 'gpt-5.1-codex-max',
        reasoningEffort: 'xhigh'
    },
    // GPT-5.2 (latest, supports xhigh)
    {
        code: 'gpt-5.2-medium',
        displayName: 'GPT-5.2',
        description: 'Latest model, balanced reasoning',
        baseModel: 'gpt-5.2',
        reasoningEffort: 'medium'
    },
    {
        code: 'gpt-5.2-high',
        displayName: 'GPT-5.2 (High)',
        description: 'Latest model, greater reasoning',
        baseModel: 'gpt-5.2',
        reasoningEffort: 'high'
    },
    {
        code: 'gpt-5.2-xhigh',
        displayName: 'GPT-5.2 (XHigh)',
        description: 'Latest model, maximum reasoning',
        baseModel: 'gpt-5.2',
        reasoningEffort: 'xhigh'
    },
    // GPT-5.1 (faster options)
    {
        code: 'gpt-5.1-low',
        displayName: 'GPT-5.1 (Fast)',
        description: 'Fast responses with light reasoning',
        baseModel: 'gpt-5.1',
        reasoningEffort: 'low'
    },
]


/**
 * Parse model code to extract base model and reasoning effort
 * e.g., 'gpt-5.2-high' -> { baseModel: 'gpt-5.2', reasoningEffort: 'high' }
 */
export function parseCodexModelCode(modelCode: string): { baseModel: string; reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' } {
    const efforts = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const
    for (const effort of efforts) {
        if (modelCode.endsWith(`-${effort}`)) {
            return {
                baseModel: modelCode.replace(`-${effort}`, ''),
                reasoningEffort: effort
            }
        }
    }
    // Default fallback
    return { baseModel: modelCode, reasoningEffort: 'medium' }
}

/**
 * Reasoning effort levels matching official Codex CLI
 * Reference: https://github.com/openai/codex/blob/main/docs/config.md
 */
export const REASONING_EFFORTS = {
    minimal: { label: 'Minimal', description: 'Fastest responses, best for simple tasks' },
    low: { label: 'Low', description: 'Fast responses with lighter reasoning' },
    medium: { label: 'Medium', description: 'Balanced speed and reasoning depth' },
    high: { label: 'High', description: 'Greater reasoning depth for complex problems' },
    xhigh: { label: 'XHigh', description: 'Maximum reasoning depth for hardest tasks' },
} as const

/**
 * Reasoning summary options matching official Codex CLI
 * Reference: https://github.com/openai/codex/blob/main/docs/config.md
 */
export const REASONING_SUMMARIES = {
    auto: { label: 'Auto', description: 'Automatic (default)' },
    concise: { label: 'Concise', description: 'Brief summary' },
    detailed: { label: 'Detailed', description: 'Comprehensive summary' },
    none: { label: 'None', description: 'Disabled' },
} as const

export type ReasoningSummary = keyof typeof REASONING_SUMMARIES

/**
 * Get the default Codex model
 */
export function getDefaultCodexModel(): CodexModelInfo {
    return CODEX_MODELS.find(m => m.isDefault) || CODEX_MODELS[0]
}

/**
 * Check Codex usage/subscription info
 */
export async function checkCodexUsage(): Promise<{ success: boolean; usage?: any; error?: string }> {
    if (!window.codexAuth) {
        return { success: false, error: 'Codex auth not available' }
    }

    try {
        return await window.codexAuth.checkUsage()
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}


// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Sanitize error to remove sensitive data (tokens, keys)
 */
export function sanitizeError(error: any): any {
    if (!error) return error

    const sanitized = { ...error }

    // Remove any token-like strings from message
    if (typeof sanitized.message === 'string') {
        sanitized.message = sanitized.message
            .replace(/Bearer\s+[A-Za-z0-9\-_]+/gi, 'Bearer [REDACTED]')
            .replace(/sk-[A-Za-z0-9\-_]+/gi, '[REDACTED_KEY]')
            .replace(/eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/gi, '[REDACTED_TOKEN]')
    }

    // Remove sensitive headers
    if (sanitized.headers) {
        const { authorization, Authorization, ...safeHeaders } = sanitized.headers
        sanitized.headers = safeHeaders
    }

    return sanitized
}

/**
 * Parse Codex error response into user-friendly message
 */
export function parseCodexError(error: any, status?: number): string {
    // Handle rate limiting
    if (status === 429) {
        const retryAfter = error?.headers?.get?.('retry-after') || error?.retryAfter
        if (retryAfter) {
            return `Rate limit reached. Please wait ${retryAfter} seconds before trying again.`
        }
        return 'Rate limit reached. Please wait before trying again.'
    }

    // Handle authentication errors
    if (status === 401) {
        return 'Your session has expired. Please sign in again.'
    }

    // Handle service unavailable
    if (status === 503 || status === 502) {
        return 'Codex service is temporarily unavailable. Try another provider?'
    }

    // Handle invalid model
    if (status === 400 && error?.message?.includes('model')) {
        return 'Selected model is not available. Please choose another.'
    }

    // Generic error with message
    if (error?.message) {
        return error.message
    }

    return 'An unexpected error occurred. Please try again.'
}

// ============================================================================
// Authentication Functions
// ============================================================================

/**
 * Initiate Codex OAuth authentication flow
 * Opens browser for ChatGPT login
 */
export async function initiateCodexAuth(): Promise<{ success: boolean; error?: string }> {
    if (!window.codexAuth) {
        return { success: false, error: 'Codex authentication not available' }
    }

    try {
        return await window.codexAuth.initiateAuth()
    } catch (error: any) {
        console.error('[Codex] Auth initiation failed:', sanitizeError(error))
        return { success: false, error: parseCodexError(error) }
    }
}

/**
 * Get current Codex authentication state
 */
export async function getCodexAuthState(): Promise<CodexAuthState> {
    if (!window.codexAuth) {
        return { isAuthenticated: false, error: 'Codex authentication not available' }
    }

    try {
        return await window.codexAuth.getAuthState()
    } catch (error: any) {
        console.error('[Codex] Failed to get auth state:', sanitizeError(error))
        return { isAuthenticated: false, error: parseCodexError(error) }
    }
}

/**
 * Logout from Codex (clear stored credentials)
 */
export async function logoutCodex(): Promise<void> {
    if (!window.codexAuth) {
        throw new Error('Codex authentication not available')
    }

    try {
        await window.codexAuth.logout()
    } catch (error: any) {
        console.error('[Codex] Logout failed:', sanitizeError(error))
        throw new Error(parseCodexError(error))
    }
}

/**
 * Validate stored Codex token
 */
export async function validateCodexToken(): Promise<boolean> {
    if (!window.codexAuth) {
        return false
    }

    try {
        return await window.codexAuth.validateToken()
    } catch (error: any) {
        console.error('[Codex] Token validation failed:', sanitizeError(error))
        return false
    }
}

// ============================================================================
// Chat Completion Functions
// ============================================================================

/**
 * Generate a chat completion using Codex
 */
export async function generateCodexCompletion(
    model: string,
    messages: ChatMessage[],
    options?: CodexOptions
): Promise<CodexResponse> {
    // Validate authentication first
    const isValid = await validateCodexToken()
    if (!isValid) {
        throw new Error('Not authenticated with Codex. Please sign in first.')
    }

    // Get token for API request
    const authState = await getCodexAuthState()
    if (!authState.isAuthenticated) {
        throw new Error('Not authenticated with Codex. Please sign in first.')
    }

    // Parse model code to extract base model and reasoning effort
    // e.g., 'gpt-5.2-high' -> baseModel: 'gpt-5.2', reasoningEffort: 'high'
    const { baseModel, reasoningEffort } = parseCodexModelCode(model)

    // Build request body for Responses API
    // Reference: https://github.com/openai/codex - uses /v1/responses endpoint
    const requestBody: Record<string, any> = {
        model: baseModel,
        input: formatMessagesForCodex(messages),  // Responses API uses 'input' not 'messages'
        stream: false,
        // Reasoning object for Responses API
        reasoning: {
            effort: reasoningEffort,
            summary: options?.reasoningSummary || 'auto'
        }
    }

    if (options?.temperature !== undefined) {
        requestBody.temperature = options.temperature
    }
    if (options?.maxTokens !== undefined) {
        requestBody.max_tokens = options.maxTokens
    }

    try {
        // Make API request via IPC using Responses API endpoint
        const response = await window.codexAuth.sendRequest({
            endpoint: '/v1/responses',
            method: 'POST',
            body: requestBody
        })

        if (!response.ok) {
            let errorData: any = {}
            try {
                errorData = JSON.parse(response.body)
            } catch {
                errorData = { message: response.body }
            }
            throw new Error(parseCodexError(errorData, response.status))
        }

        return JSON.parse(response.body)
    } catch (error: any) {
        console.error('[Codex] Completion failed:', sanitizeError(error))
        throw new Error(parseCodexError(error))
    }
}

/**
 * Stream a chat completion using Codex
 * Note: Streaming is handled via non-streaming request with chunked response simulation
 * since IPC doesn't support true streaming. For real streaming, use direct fetch in renderer.
 */
export async function* streamCodexCompletion(
    model: string,
    messages: ChatMessage[],
    options?: CodexOptions & { onChunk?: (chunk: CodexStreamChunk) => void }
): AsyncGenerator<CodexStreamChunk, void, unknown> {
    // Validate authentication first
    const isValid = await validateCodexToken()
    if (!isValid) {
        throw new Error('Not authenticated with Codex. Please sign in first.')
    }

    // Parse model code to extract base model and reasoning effort
    // e.g., 'gpt-5.2-high' -> baseModel: 'gpt-5.2', reasoningEffort: 'high'
    const { baseModel, reasoningEffort } = parseCodexModelCode(model)

    // Build request body for Responses API
    const requestBody: Record<string, any> = {
        model: baseModel,
        input: formatMessagesForCodex(messages),  // Responses API uses 'input'
        stream: false,  // IPC doesn't support true streaming
        reasoning: {
            effort: reasoningEffort,
            summary: options?.reasoningSummary || 'auto'
        }
    }

    if (options?.temperature !== undefined) {
        requestBody.temperature = options.temperature
    }
    if (options?.maxTokens !== undefined) {
        requestBody.max_tokens = options.maxTokens
    }

    try {
        // Get response via IPC using Responses API
        const response = await window.codexAuth.sendRequest({
            endpoint: '/v1/responses',
            method: 'POST',
            body: requestBody
        })

        if (!response.ok) {
            let errorData: any = {}
            try {
                errorData = JSON.parse(response.body)
            } catch {
                errorData = { message: response.body }
            }
            throw new Error(parseCodexError(errorData, response.status))
        }

        const fullResponse: CodexResponse = JSON.parse(response.body)
        const content = fullResponse.choices?.[0]?.message?.content || ''

        // Simulate streaming by yielding the full content as a single chunk
        const chunk: CodexStreamChunk = {
            id: fullResponse.id,
            choices: [{
                delta: {
                    content: content,
                    role: 'assistant'
                },
                finish_reason: fullResponse.choices?.[0]?.finish_reason || 'stop'
            }],
            usage: fullResponse.usage
        }

        if (options?.onChunk) {
            options.onChunk(chunk)
        }
        yield chunk

    } catch (error: any) {
        console.error('[Codex] Streaming failed:', sanitizeError(error))
        throw new Error(parseCodexError(error))
    }
}

// ============================================================================
// Message Formatting
// ============================================================================

/**
 * Format messages for Codex API (OpenAI-compatible format)
 */
export function formatMessagesForCodex(messages: ChatMessage[]): any[] {
    return messages.map(msg => {
        // Handle image content
        if (Array.isArray(msg.content)) {
            return {
                role: msg.role,
                content: msg.content.map(part => {
                    if (part.type === 'image_url' && part.image_url) {
                        return {
                            type: 'image_url',
                            image_url: {
                                url: part.image_url.url
                            }
                        }
                    }
                    return part
                })
            }
        }

        // Simple text message
        return {
            role: msg.role,
            content: msg.content
        }
    })
}

/**
 * Format image for Codex vision request
 */
export function formatImageForCodex(base64Data: string, mimeType?: string): any {
    // Extract base64 if it includes data URL prefix
    const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data
    const detectedMimeType = mimeType || base64Data.match(/data:([^;]+)/)?.[1] || 'image/png'

    return {
        type: 'image_url',
        image_url: {
            url: `data:${detectedMimeType};base64,${base64}`
        }
    }
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse Codex response to extract content
 */
export function parseCodexResponse(response: CodexResponse): string {
    return response.choices?.[0]?.message?.content || ''
}

/**
 * Extract usage metadata from Codex response
 */
export function extractCodexUsage(response: CodexResponse | CodexStreamChunk): {
    inputTokens: number
    outputTokens: number
    totalTokens: number
} {
    const usage = response.usage
    return {
        inputTokens: usage?.prompt_tokens || 0,
        outputTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0
    }
}

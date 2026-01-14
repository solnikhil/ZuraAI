import { ChatMessage, ToolDefinition, parseErrorResponse, extractErrorMessage, ToolCall, StreamingToolCall } from './types'

/**
 * MiniMax API Service
 * Uses OpenAI-compatible API at https://api.minimax.io/v1/chat/completions
 * 
 * Supported models:
 * - MiniMax-M2.1: 230B parameters (10B activated), optimized for code generation
 * - MiniMax-M2.1-lightning: Same performance as M2.1 with faster inference (~100 tps)
 * - MiniMax-M2: 200k context, agentic capabilities, function calling
 */

/**
 * Accumulated tool call during streaming
 * Tracks partial tool call data across multiple chunks
 */
export interface AccumulatedToolCall {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string
    }
}

/**
 * Tool call accumulator for tracking partial tool calls across streaming chunks
 * 
 * Requirements: 2.3, 2.4, 2.5
 */
export class ToolCallAccumulator {
    private toolCalls: Map<number, AccumulatedToolCall> = new Map()

    /**
     * Accumulate partial tool call data from a streaming chunk
     * @param deltaToolCalls - Array of partial tool calls from the chunk
     */
    accumulate(deltaToolCalls: StreamingToolCall[] | undefined): void {
        if (!deltaToolCalls || !Array.isArray(deltaToolCalls)) return

        for (const tc of deltaToolCalls) {
            const index = tc.index ?? 0
            
            if (!this.toolCalls.has(index)) {
                // Initialize new tool call entry
                this.toolCalls.set(index, {
                    id: tc.id || '',
                    type: 'function',
                    function: {
                        name: tc.function?.name || '',
                        arguments: tc.function?.arguments || ''
                    }
                })
            } else {
                // Accumulate to existing entry
                const existing = this.toolCalls.get(index)!
                
                // Update id if provided (usually only in first chunk)
                if (tc.id) {
                    existing.id = tc.id
                }
                
                // Accumulate function name (usually complete in first chunk)
                if (tc.function?.name) {
                    existing.function.name += tc.function.name
                }
                
                // Accumulate function arguments (streamed across chunks)
                if (tc.function?.arguments) {
                    existing.function.arguments += tc.function.arguments
                }
            }
        }
    }

    /**
     * Check if any tool calls have been accumulated
     */
    hasToolCalls(): boolean {
        return this.toolCalls.size > 0
    }

    /**
     * Get all accumulated tool calls as an array
     * Filters out incomplete tool calls (missing id or name)
     */
    getToolCalls(): ToolCall[] {
        return Array.from(this.toolCalls.values())
            .filter(tc => tc.id && tc.function.name)
            .map(tc => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments
                }
            }))
    }

    /**
     * Clear all accumulated tool calls
     */
    clear(): void {
        this.toolCalls.clear()
    }
}

/**
 * Check if a finish_reason indicates tool calls
 * 
 * Requirements: 2.5
 * @param finishReason - The finish_reason from a streaming chunk or response
 * @returns true if the finish_reason indicates tool calls
 */
export function isToolCallsFinishReason(finishReason: string | null | undefined): boolean {
    return finishReason === 'tool_calls'
}

/**
 * Normalized usage metrics interface
 * Maps MiniMax API usage fields to a standard format
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */
export interface NormalizedUsageMetrics {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    reasoningTokens?: number
}

/**
 * MiniMax API usage structure
 * Supports both OpenAI-style (prompt_tokens/completion_tokens) and
 * alternative naming (input_tokens/output_tokens) for compatibility
 */
export interface MiniMaxUsage {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    // Alternative field names for compatibility
    input_tokens?: number
    output_tokens?: number
    completion_tokens_details?: {
        reasoning_tokens?: number
    }
}

/**
 * Extract and normalize usage metrics from MiniMax API response
 *
 * Maps MiniMax API fields to standard format:
 * - prompt_tokens → inputTokens
 * - completion_tokens → outputTokens
 * - total_tokens → totalTokens (or calculated as inputTokens + outputTokens)
 * - completion_tokens_details.reasoning_tokens → reasoningTokens
 *
 * Also handles alternative field names (input_tokens/output_tokens) for compatibility
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 *
 * @param usage - MiniMax API usage object from response
 * @returns Normalized usage metrics or undefined if no usage data
 */
export function extractUsageMetrics(usage: MiniMaxUsage | undefined | null): NormalizedUsageMetrics | undefined {
    if (!usage) {
        return undefined
    }

    // Handle both OpenAI-style (prompt_tokens/completion_tokens) and
    // alternative naming (input_tokens/output_tokens) for compatibility
    const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0
    const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0

    // Calculate totalTokens - use provided value or sum of input + output
    const totalTokens = usage.total_tokens ?? (inputTokens + outputTokens)

    // Extract reasoning tokens from completion_tokens_details
    const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens

    return {
        inputTokens,
        outputTokens,
        totalTokens,
        reasoningTokens: reasoningTokens !== undefined && reasoningTokens > 0 ? reasoningTokens : undefined
    }
}

/**
 * Accumulate usage metrics from multiple API calls
 * Used when making follow-up requests in research mode
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4
 * 
 * @param existing - Existing accumulated usage metrics
 * @param newUsage - New usage metrics to add
 * @returns Combined usage metrics
 */
export function accumulateUsageMetrics(
    existing: NormalizedUsageMetrics | undefined,
    newUsage: NormalizedUsageMetrics | undefined
): NormalizedUsageMetrics {
    const existingInput = existing?.inputTokens || 0
    const existingOutput = existing?.outputTokens || 0
    const existingTotal = existing?.totalTokens || 0
    const existingReasoning = existing?.reasoningTokens || 0

    const newInput = newUsage?.inputTokens || 0
    const newOutput = newUsage?.outputTokens || 0
    const newTotal = newUsage?.totalTokens || 0
    const newReasoning = newUsage?.reasoningTokens || 0

    const combinedReasoning = existingReasoning + newReasoning

    return {
        inputTokens: existingInput + newInput,
        outputTokens: existingOutput + newOutput,
        totalTokens: existingTotal + newTotal,
        reasoningTokens: combinedReasoning > 0 ? combinedReasoning : undefined
    }
}

/**
 * Calculate tokens per second (TPS) metric
 * 
 * Requirements: 10.5
 * 
 * @param outputTokens - Number of output tokens generated
 * @param latencyMs - Total latency in milliseconds
 * @returns TPS value or undefined if cannot be calculated
 */
export function calculateTPS(outputTokens: number, latencyMs: number): number | undefined {
    if (outputTokens <= 0 || latencyMs <= 0) {
        return undefined
    }
    return outputTokens / (latencyMs / 1000)
}

/**
 * Extract tool calls from a streaming chunk's delta
 * 
 * Requirements: 2.3
 * @param chunk - A MiniMax streaming chunk
 * @returns Array of streaming tool calls or undefined
 */
export function extractToolCallsFromChunk(chunk: MiniMaxStreamChunk): StreamingToolCall[] | undefined {
    return chunk.choices?.[0]?.delta?.tool_calls
}

/**
 * Check if a chunk has tool calls in its delta
 * 
 * @param chunk - A MiniMax streaming chunk
 * @returns true if the chunk contains tool calls
 */
export function chunkHasToolCalls(chunk: MiniMaxStreamChunk): boolean {
    const toolCalls = extractToolCallsFromChunk(chunk)
    return toolCalls !== undefined && toolCalls.length > 0
}

/**
 * Extract reasoning details from a streaming chunk
 * MiniMax M2.1 returns reasoning in delta.reasoning_details during streaming
 * 
 * Requirements: 3.2, 3.3
 * @param chunk - A MiniMax streaming chunk
 * @returns Array of reasoning details or undefined
 */
export function extractReasoningFromChunk(chunk: MiniMaxStreamChunk): MiniMaxReasoningDetail[] | undefined {
    const choice = chunk.choices?.[0]
    if (!choice) return undefined
    
    // Primary location: delta.reasoning_details (streaming format per MiniMax API docs)
    const deltaReasoningDetails = choice.delta?.reasoning_details
    if (deltaReasoningDetails && Array.isArray(deltaReasoningDetails) && deltaReasoningDetails.length > 0) {
        return deltaReasoningDetails
    }
    
    // Fallback: message.reasoning_details (some responses may use this format)
    const messageReasoningDetails = choice.message?.reasoning_details
    if (messageReasoningDetails && Array.isArray(messageReasoningDetails) && messageReasoningDetails.length > 0) {
        return messageReasoningDetails
    }
    
    return undefined
}

/**
 * Extract reasoning text from reasoning details
 * Maps reasoning_details[].text to a single reasoning string
 * 
 * Requirements: 3.3
 * @param reasoningDetails - Array of reasoning detail objects
 * @returns Combined reasoning text or undefined
 */
export function extractReasoningText(reasoningDetails: MiniMaxReasoningDetail[] | undefined): string | undefined {
    if (!reasoningDetails || !Array.isArray(reasoningDetails) || reasoningDetails.length === 0) {
        return undefined
    }
    
    // Sort by index to ensure correct order
    const sorted = [...reasoningDetails].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    
    // Extract and join text from each reasoning detail
    const texts = sorted
        .filter(detail => detail.text !== undefined && detail.text !== null)
        .map(detail => detail.text)
    
    if (texts.length === 0) {
        return undefined
    }
    
    return texts.join('')
}

/**
 * Check if a chunk has reasoning content
 * 
 * @param chunk - A MiniMax streaming chunk
 * @returns true if the chunk contains reasoning details
 */
export function chunkHasReasoning(chunk: MiniMaxStreamChunk): boolean {
    const reasoning = extractReasoningFromChunk(chunk)
    return reasoning !== undefined && reasoning.length > 0
}

/**
 * Reasoning accumulator for tracking reasoning content across streaming chunks
 * Appends text incrementally as chunks arrive (delta mode)
 * 
 * Requirements: 3.4
 */
export class ReasoningAccumulator {
    private reasoningParts: Map<number, string> = new Map()
    private accumulatedText: string = ''

    /**
     * Accumulate reasoning details from a streaming chunk
     * Always appends new text (delta mode) - each chunk contains incremental text
     * @param reasoningDetails - Array of reasoning details from the chunk
     */
    accumulate(reasoningDetails: MiniMaxReasoningDetail[] | undefined): void {
        if (!reasoningDetails || !Array.isArray(reasoningDetails)) return

        for (const detail of reasoningDetails) {
            const index = detail.index ?? 0
            const text = detail.text ?? ''
            
            if (!text) continue
            
            const existing = this.reasoningParts.get(index) || ''
            // Always append - MiniMax sends deltas (incremental text)
            this.reasoningParts.set(index, existing + text)
        }
        
        // Update accumulated text
        this.updateAccumulatedText()
    }

    /**
     * Update the accumulated text from all parts
     */
    private updateAccumulatedText(): void {
        // Sort parts by index and join
        const sortedIndices = Array.from(this.reasoningParts.keys()).sort((a, b) => a - b)
        this.accumulatedText = sortedIndices
            .map(index => this.reasoningParts.get(index) || '')
            .join('')
    }

    /**
     * Check if any reasoning has been accumulated
     */
    hasReasoning(): boolean {
        return this.accumulatedText.length > 0
    }

    /**
     * Get the accumulated reasoning text
     */
    getReasoning(): string {
        return this.accumulatedText
    }

    /**
     * Get the latest reasoning text (for incremental updates)
     * Returns the current accumulated text
     */
    getLatestReasoning(): string {
        return this.accumulatedText
    }

    /**
     * Clear all accumulated reasoning
     */
    clear(): void {
        this.reasoningParts.clear()
        this.accumulatedText = ''
    }
}

// MiniMax-specific reasoning detail structure
export interface MiniMaxReasoningDetail {
    type: string           // e.g., 'reasoning.text'
    id: string             // e.g., 'reasoning-text-1'
    format: string         // e.g., 'MiniMax-response-v1'
    index: number
    text: string           // The actual reasoning content
}

// MiniMax streaming chunk response
export interface MiniMaxStreamChunk {
    id: string
    object?: string
    created?: number
    model?: string
    choices: Array<{
        index: number
        delta?: {
            content?: string
            role?: string
            tool_calls?: Array<{
                index?: number
                id?: string
                type?: 'function'
                function?: {
                    name?: string
                    arguments?: string
                }
            }>
            // MiniMax-specific: reasoning details in delta during streaming
            reasoning_details?: MiniMaxReasoningDetail[]
        }
        finish_reason?: string | null
        // Legacy: some responses may still include message field
        message?: {
            reasoning_details?: MiniMaxReasoningDetail[]
        }
    }>
    usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
        completion_tokens_details?: {
            reasoning_tokens?: number
        }
    }
    // MiniMax-specific error response
    base_resp?: {
        status_code: number
        status_msg: string
    }
}

// MiniMax non-streaming response
export interface MiniMaxResponse {
    id: string
    object?: string
    created?: number
    model?: string
    choices: Array<{
        index: number
        message: {
            role: string
            content: string
            tool_calls?: Array<{
                id: string
                type: 'function'
                function: {
                    name: string
                    arguments: string
                }
            }>
            reasoning_details?: MiniMaxReasoningDetail[]
        }
        finish_reason: string | null
    }>
    usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
        completion_tokens_details?: {
            reasoning_tokens?: number
        }
    }
    // MiniMax-specific error response
    base_resp?: {
        status_code: number
        status_msg: string
    }
}

// MiniMax request body structure
export interface MiniMaxRequestBody {
    model: string
    messages: ChatMessage[]
    stream?: boolean
    temperature?: number
    max_tokens?: number
    tools?: ToolDefinition[]
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
    // MiniMax-specific: enable separated reasoning output
    reasoning_split?: boolean
}


/**
 * Extract error message from MiniMax response
 * MiniMax uses base_resp.status_msg for error messages
 */
function extractMiniMaxError(
    errorData: MiniMaxResponse | MiniMaxStreamChunk | Record<string, unknown>,
    fallbackText: string,
    status: number,
    statusText: string
): string {
    // Check for MiniMax-specific error format
    const baseResp = (errorData as { base_resp?: { status_msg?: string } }).base_resp
    if (baseResp?.status_msg) {
        return baseResp.status_msg
    }
    
    // Fall back to standard error extraction
    return extractErrorMessage(errorData as Parameters<typeof extractErrorMessage>[0], fallbackText, status, statusText)
}

/**
 * Stream MiniMax completion responses
 * 
 * @param apiKey - MiniMax API key
 * @param model - Model identifier (e.g., 'MiniMax-M2.1', 'MiniMax-M2.1-lightning', 'MiniMax-M2')
 * @param messages - Array of chat messages
 * @param options - Optional parameters for the request
 * @yields MiniMaxStreamChunk objects as they arrive
 */
export async function* streamMiniMaxCompletion(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    options?: {
        temperature?: number
        maxTokens?: number
        tools?: ToolDefinition[]
        toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
        onChunk?: (chunk: MiniMaxStreamChunk) => void
    }
): AsyncGenerator<MiniMaxStreamChunk, void, unknown> {
    if (!apiKey) {
        throw new Error("MiniMax API Key is missing")
    }

    const requestBody: MiniMaxRequestBody = {
        model,
        messages,
        stream: true,
        reasoning_split: true  // Enable separated reasoning output for M2.1
    }

    // Add optional parameters if defined
    if (options?.temperature !== undefined) {
        requestBody.temperature = options.temperature
    }
    if (options?.maxTokens !== undefined) {
        requestBody.max_tokens = options.maxTokens
    }
    if (options?.tools && Array.isArray(options.tools) && options.tools.length > 0) {
        requestBody.tools = options.tools
        requestBody.tool_choice = options.toolChoice || 'auto'
    }

    const response = await fetch("https://api.minimax.io/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
        const errorText = await response.text()
        const errorData = parseErrorResponse(errorText)
        
        // Handle specific HTTP status codes
        if (response.status === 401) {
            throw new Error("Invalid MiniMax API key. Please check your credentials.")
        }
        if (response.status === 429) {
            throw new Error("MiniMax rate limit exceeded. Please wait and try again.")
        }
        if (response.status >= 500) {
            throw new Error("MiniMax server error. Please try again later.")
        }
        
        const errorMessage = extractMiniMaxError(errorData, errorText, response.status, response.statusText)
        throw new Error(errorMessage)
    }

    const reader = response.body?.getReader()
    if (!reader) {
        throw new Error("Failed to get response reader")
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.trim() === '') continue
                if (line.startsWith('data: ')) {
                    const data = line.slice(6)
                    if (data === '[DONE]') {
                        return
                    }
                    try {
                        const chunk: MiniMaxStreamChunk = JSON.parse(data)
                        
                        // Check for MiniMax-specific error in chunk
                        if (chunk.base_resp && chunk.base_resp.status_code !== 0) {
                            throw new Error(chunk.base_resp.status_msg || 'MiniMax API error')
                        }
                        
                        if (options?.onChunk) {
                            options.onChunk(chunk)
                        }
                        yield chunk
                    } catch (e) {
                        // Re-throw if it's our error
                        if (e instanceof Error && e.message.includes('MiniMax')) {
                            throw e
                        }
                        // Skip invalid JSON
                        console.warn('Failed to parse MiniMax chunk:', data)
                    }
                }
            }
        }
    } finally {
        reader.releaseLock()
    }
}


/**
 * Generate a non-streaming MiniMax completion
 * 
 * @param apiKey - MiniMax API key
 * @param model - Model identifier (e.g., 'MiniMax-M2.1', 'MiniMax-M2.1-lightning', 'MiniMax-M2')
 * @param messages - Array of chat messages
 * @param options - Optional parameters for the request
 * @returns Promise resolving to MiniMaxResponse
 */
export async function generateMiniMaxCompletion(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    options?: {
        temperature?: number
        maxTokens?: number
        tools?: ToolDefinition[]
        toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
    }
): Promise<MiniMaxResponse> {
    if (!apiKey) {
        throw new Error("MiniMax API Key is missing")
    }

    const requestBody: MiniMaxRequestBody = {
        model,
        messages,
        reasoning_split: true  // Enable separated reasoning output for M2.1
    }

    // Add optional parameters if defined
    if (options?.temperature !== undefined) {
        requestBody.temperature = options.temperature
    }
    if (options?.maxTokens !== undefined) {
        requestBody.max_tokens = options.maxTokens
    }
    if (options?.tools && Array.isArray(options.tools) && options.tools.length > 0) {
        requestBody.tools = options.tools
        requestBody.tool_choice = options.toolChoice || 'auto'
    }

    try {
        const response = await fetch("https://api.minimax.io/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
            const errorText = await response.text()
            const errorData = parseErrorResponse(errorText)
            
            // Handle specific HTTP status codes
            if (response.status === 401) {
                throw new Error("Invalid MiniMax API key. Please check your credentials.")
            }
            if (response.status === 429) {
                throw new Error("MiniMax rate limit exceeded. Please wait and try again.")
            }
            if (response.status >= 500) {
                throw new Error("MiniMax server error. Please try again later.")
            }
            
            const errorMessage = extractMiniMaxError(errorData, errorText, response.status, response.statusText)
            throw new Error(errorMessage)
        }

        const result = await response.json() as MiniMaxResponse
        
        // Check for MiniMax-specific error in response
        if (result.base_resp && result.base_resp.status_code !== 0) {
            throw new Error(result.base_resp.status_msg || 'MiniMax API error')
        }
        
        return result
    } catch (error) {
        // Re-throw errors with proper context
        if (error instanceof Error) {
            throw error
        }
        throw new Error(`MiniMax API error: ${String(error)}`)
    }
}

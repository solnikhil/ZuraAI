/**
 * StreamingManager - Unified streaming interface for all AI providers
 * Delegates to provider-specific handlers while providing a consistent API
 * 
 * Requirements: 1.1, 7.1
 */

import type { ThinkingBlock } from '../../../../contexts/ChatHistoryContext'
import type { ToolDefinition, ToolCall } from '../../../../services/types'

export type ProviderType = 'ollama' | 'perplexity' | 'gemini' | 'groq' | 'openrouter'

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  thinkingTokens?: number
  cachedInputTokens?: number
  cachedOutputTokens?: number
  ttft?: number
  tps?: number
}

export interface StreamChunk {
  content?: string
  reasoning?: string
  toolCalls?: ToolCall[]
  usage?: Partial<TokenUsage>
  done?: boolean
  finishReason?: string
}

export interface StreamResponse {
  content: string
  reasoning?: string
  toolCalls?: ToolCall[]
  usage: TokenUsage
  finishReason: string
  thinkingBlocks?: ThinkingBlock[]
}

export interface StreamingOptions {
  provider: ProviderType
  model: string
  messages: Array<{ role: string; content: string; [key: string]: any }>
  systemPrompt?: string
  apiKey?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
  tools?: ToolDefinition[] | { function_declarations: any[] }
  toolChoice?: 'auto' | 'required' | { type: 'function'; function: { name: string } }
  onChunk: (chunk: StreamChunk) => void
  onComplete: (response: StreamResponse) => void
  onError: (error: Error) => void
  signal?: AbortSignal
}

export interface ProviderHandler {
  stream(options: Omit<StreamingOptions, 'provider'>): AsyncGenerator<StreamChunk, void, unknown>
}

/**
 * Unified streaming manager that delegates to provider-specific handlers
 */
export class StreamingManager {
  private abortController: AbortController | null = null
  private handlers: Map<ProviderType, ProviderHandler> = new Map()

  /**
   * Register a provider handler
   */
  registerHandler(provider: ProviderType, handler: ProviderHandler): void {
    this.handlers.set(provider, handler)
  }

  /**
   * Get a registered handler
   */
  getHandler(provider: ProviderType): ProviderHandler | undefined {
    return this.handlers.get(provider)
  }

  /**
   * Start streaming completion from the specified provider
   */
  async stream(options: StreamingOptions): Promise<void> {
    const { provider, onChunk, onComplete, onError, signal } = options

    // Create abort controller for this stream
    this.abortController = new AbortController()
    
    // Link external signal if provided
    if (signal) {
      signal.addEventListener('abort', () => this.abort())
    }

    const handler = this.handlers.get(provider)
    if (!handler) {
      onError(new Error(`No handler registered for provider: ${provider}`))
      return
    }

    try {
      let accumulatedContent = ''
      let accumulatedReasoning = ''
      let accumulatedToolCalls: ToolCall[] = []
      let finalUsage: TokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      }
      let finishReason = ''

      const streamOptions = {
        ...options,
        signal: this.abortController.signal
      }

      for await (const chunk of handler.stream(streamOptions)) {
        // Check for abort
        if (this.abortController?.signal.aborted) {
          break
        }

        // Accumulate content
        if (chunk.content) {
          accumulatedContent += chunk.content
        }
        if (chunk.reasoning) {
          accumulatedReasoning += chunk.reasoning
        }
        if (chunk.toolCalls) {
          accumulatedToolCalls = chunk.toolCalls
        }
        if (chunk.usage) {
          finalUsage = { ...finalUsage, ...chunk.usage }
        }
        if (chunk.finishReason) {
          finishReason = chunk.finishReason
        }

        // Emit chunk to callback
        onChunk(chunk)
      }

      // Emit completion
      onComplete({
        content: accumulatedContent,
        reasoning: accumulatedReasoning || undefined,
        toolCalls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
        usage: finalUsage,
        finishReason
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Stream was aborted, don't treat as error
        return
      }
      onError(error instanceof Error ? error : new Error(String(error)))
    } finally {
      this.abortController = null
    }
  }

  /**
   * Abort current streaming operation
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  /**
   * Check if currently streaming
   */
  isStreaming(): boolean {
    return this.abortController !== null
  }
}

// Export singleton instance for convenience
export const streamingManager = new StreamingManager()

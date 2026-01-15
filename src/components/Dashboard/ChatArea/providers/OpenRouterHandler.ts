/**
 * OpenRouterHandler - Provider-specific streaming handler for OpenRouter
 * 
 * Requirements: 1.4, 7.2
 */

import { streamOpenRouterCompletion, type OpenRouterStreamChunk } from '../../../../services/openrouter'
import type { ProviderHandler, StreamChunk, StreamingOptions } from './StreamingManager'

/**
 * OpenRouter-specific streaming handler
 */
export class OpenRouterHandler implements ProviderHandler {
  async *stream(options: Omit<StreamingOptions, 'provider'>): AsyncGenerator<StreamChunk, void, unknown> {
    const { 
      model, 
      messages, 
      apiKey,
      temperature,
      maxTokens,
      tools,
      toolChoice
    } = options

    if (!apiKey) {
      throw new Error('OpenRouter API key is required')
    }

    // Convert tools to OpenRouter format (OpenAI-compatible)
    const openRouterTools = tools && Array.isArray(tools) ? tools : undefined

    try {
      for await (const chunk of streamOpenRouterCompletion(
        apiKey,
        model,
        messages,
        {
          temperature,
          maxTokens,
          tools: openRouterTools,
          toolChoice: toolChoice as any
        }
      )) {
        yield this.convertChunk(chunk)
      }
    } catch (error) {
      throw error
    }
  }

  /**
   * Convert OpenRouter chunk to unified StreamChunk format
   */
  private convertChunk(chunk: OpenRouterStreamChunk): StreamChunk {
    const result: StreamChunk = {}

    // Extract content delta
    const delta = chunk.choices?.[0]?.delta?.content
    if (delta) {
      result.content = delta
    }

    // Extract reasoning/thinking delta
    const reasoning = chunk.choices?.[0]?.delta?.reasoning
    if (reasoning) {
      result.reasoning = reasoning
    }

    // Extract tool calls from delta
    const toolCallsDelta = chunk.choices?.[0]?.delta?.tool_calls
    if (toolCallsDelta && toolCallsDelta.length > 0) {
      result.toolCalls = toolCallsDelta.map(tc => ({
        id: tc.id || '',
        type: 'function' as const,
        function: {
          name: tc.function?.name || '',
          arguments: tc.function?.arguments || ''
        }
      }))
    }

    // Extract finish reason
    const finishReason = chunk.choices?.[0]?.finish_reason
    if (finishReason) {
      result.finishReason = finishReason
      result.done = finishReason === 'stop' || finishReason === 'tool_calls'
    }

    // Extract usage stats
    if (chunk.usage) {
      const reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens || 
                              chunk.usage.reasoning_tokens || 0
      
      result.usage = {
        inputTokens: chunk.usage.prompt_tokens || 0,
        outputTokens: chunk.usage.completion_tokens || 0,
        totalTokens: chunk.usage.total_tokens || 0,
        thinkingTokens: reasoningTokens > 0 ? reasoningTokens : undefined,
        cachedInputTokens: chunk.usage.prompt_cache_tokens || undefined,
        cachedOutputTokens: chunk.usage.completion_cache_tokens || undefined
      }
    }

    return result
  }
}

// Export singleton instance
export const openRouterHandler = new OpenRouterHandler()

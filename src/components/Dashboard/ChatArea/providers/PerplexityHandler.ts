/**
 * PerplexityHandler - Provider-specific streaming handler for Perplexity
 * 
 * Requirements: 1.4, 7.2
 */

import { streamPerplexityCompletion, cleanSonarResponse, type PerplexityStreamChunk } from '../../../../services/perplexity'
import type { ProviderHandler, StreamChunk, StreamingOptions } from './StreamingManager'

/**
 * Perplexity-specific streaming handler
 */
export class PerplexityHandler implements ProviderHandler {
  async *stream(options: Omit<StreamingOptions, 'provider'>): AsyncGenerator<StreamChunk, void, unknown> {
    const { 
      model, 
      messages, 
      apiKey,
      temperature,
      maxTokens
    } = options

    if (!apiKey) {
      throw new Error('Perplexity API key is required')
    }

    try {
      for await (const chunk of streamPerplexityCompletion(
        apiKey,
        model,
        messages,
        {
          temperature,
          max_tokens: maxTokens
        }
      )) {
        yield this.convertChunk(chunk)
      }
    } catch (error) {
      throw error
    }
  }

  /**
   * Convert Perplexity chunk to unified StreamChunk format
   */
  private convertChunk(chunk: PerplexityStreamChunk): StreamChunk {
    const result: StreamChunk = {}

    // Extract content delta
    const delta = chunk.choices?.[0]?.delta?.content
    if (delta) {
      result.content = delta
    }

    // Extract finish reason
    const finishReason = chunk.choices?.[0]?.finish_reason
    if (finishReason) {
      result.finishReason = finishReason
      result.done = true
    }

    // Extract usage stats
    if (chunk.usage) {
      result.usage = {
        inputTokens: chunk.usage.prompt_tokens || 0,
        outputTokens: chunk.usage.completion_tokens || 0,
        totalTokens: chunk.usage.total_tokens || 0
      }
    }

    return result
  }

  /**
   * Clean Sonar response content (remove XML citation markup)
   */
  cleanContent(content: string, citations?: string[]): string {
    return cleanSonarResponse(content, citations)
  }
}

// Export singleton instance
export const perplexityHandler = new PerplexityHandler()

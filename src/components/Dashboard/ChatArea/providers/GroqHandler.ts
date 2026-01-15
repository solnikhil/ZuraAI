/**
 * GroqHandler - Provider-specific streaming handler for Groq
 * 
 * Requirements: 1.4, 7.2
 */

import { streamGroqCompletion, type GroqStreamChunk } from '../../../../services/groq'
import type { ProviderHandler, StreamChunk, StreamingOptions } from './StreamingManager'

/**
 * Groq-specific streaming handler
 */
export class GroqHandler implements ProviderHandler {
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
      throw new Error('Groq API key is required')
    }

    // Convert tools to Groq format (OpenAI-compatible)
    const groqTools = tools && Array.isArray(tools) ? tools : undefined

    try {
      for await (const chunk of streamGroqCompletion(
        apiKey,
        model,
        messages,
        {
          temperature,
          max_tokens: maxTokens,
          tools: groqTools,
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
   * Convert Groq chunk to unified StreamChunk format
   */
  private convertChunk(chunk: GroqStreamChunk): StreamChunk {
    const result: StreamChunk = {}

    // Extract content delta
    const delta = chunk.choices?.[0]?.delta?.content
    if (delta) {
      result.content = delta
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
      result.usage = {
        inputTokens: chunk.usage.prompt_tokens || 0,
        outputTokens: chunk.usage.completion_tokens || 0,
        totalTokens: chunk.usage.total_tokens || 0
      }
    }

    return result
  }
}

// Export singleton instance
export const groqHandler = new GroqHandler()

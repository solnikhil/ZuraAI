/**
 * OllamaHandler - Provider-specific streaming handler for Ollama
 * 
 * Requirements: 1.4, 7.2
 */

import { streamOllamaCompletion, type OllamaStreamChunk } from '../../../../services/ollama'
import type { ProviderHandler, StreamChunk, StreamingOptions } from './StreamingManager'

/**
 * Ollama-specific streaming handler
 */
export class OllamaHandler implements ProviderHandler {
  async *stream(options: Omit<StreamingOptions, 'provider'>): AsyncGenerator<StreamChunk, void, unknown> {
    const { 
      model, 
      messages, 
      baseUrl = 'http://localhost:11434',
      temperature,
      tools
    } = options

    // Convert tools to Ollama format (OpenAI-compatible)
    const ollamaTools = tools && Array.isArray(tools) ? tools : undefined

    try {
      for await (const chunk of streamOllamaCompletion(
        baseUrl,
        model,
        messages,
        {
          temperature,
          tools: ollamaTools
        }
      )) {
        yield this.convertChunk(chunk)
      }
    } catch (error) {
      throw error
    }
  }

  /**
   * Convert Ollama chunk to unified StreamChunk format
   */
  private convertChunk(chunk: OllamaStreamChunk): StreamChunk {
    const result: StreamChunk = {}

    // Extract content
    if (chunk.message?.content) {
      result.content = chunk.message.content
    }

    // Extract tool calls
    if (chunk.message?.tool_calls && chunk.message.tool_calls.length > 0) {
      result.toolCalls = chunk.message.tool_calls.map(tc => ({
        id: tc.id || '',
        type: 'function' as const,
        function: {
          name: tc.function?.name || '',
          arguments: tc.function?.arguments || ''
        }
      }))
    }

    // Extract usage stats from final chunk
    if (chunk.done) {
      result.done = true
      result.usage = {
        inputTokens: chunk.prompt_eval_count || 0,
        outputTokens: chunk.eval_count || 0,
        totalTokens: (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0)
      }
    }

    return result
  }
}

// Export singleton instance
export const ollamaHandler = new OllamaHandler()

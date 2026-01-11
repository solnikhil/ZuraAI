/**
 * GeminiHandler - Provider-specific streaming handler for Google Gemini
 * 
 * Requirements: 1.4, 7.2
 */

import { streamGeminiCompletion, type GeminiStreamChunk } from '../../../../services/gemini'
import type { ProviderHandler, StreamChunk, StreamingOptions } from './StreamingManager'

/**
 * Gemini-specific streaming handler
 */
export class GeminiHandler implements ProviderHandler {
  async *stream(options: Omit<StreamingOptions, 'provider'>): AsyncGenerator<StreamChunk, void, unknown> {
    const { 
      model, 
      messages, 
      apiKey,
      temperature,
      maxTokens,
      tools
    } = options

    if (!apiKey) {
      throw new Error('Gemini API key is required')
    }

    // Convert tools to Gemini format if provided
    const geminiTools = tools && typeof tools === 'object' && 'function_declarations' in tools 
      ? tools 
      : undefined

    try {
      for await (const chunk of streamGeminiCompletion(
        apiKey,
        model,
        messages,
        {
          temperature,
          maxOutputTokens: maxTokens,
          tools: geminiTools
        }
      )) {
        yield this.convertChunk(chunk)
      }
    } catch (error) {
      throw error
    }
  }

  /**
   * Convert Gemini chunk to unified StreamChunk format
   */
  private convertChunk(chunk: GeminiStreamChunk): StreamChunk {
    const result: StreamChunk = {}

    // Extract content from parts
    const candidate = chunk.candidates?.[0]
    if (candidate?.content?.parts) {
      const textParts = candidate.content.parts
        .filter(part => part.text)
        .map(part => part.text)
      
      if (textParts.length > 0) {
        result.content = textParts.join('')
      }
    }

    // Extract finish reason
    if (candidate?.finishReason) {
      result.finishReason = candidate.finishReason
      result.done = true
    }

    // Extract usage metadata
    if (chunk.usageMetadata) {
      result.usage = {
        inputTokens: chunk.usageMetadata.promptTokenCount || 0,
        outputTokens: chunk.usageMetadata.candidatesTokenCount || 0,
        totalTokens: chunk.usageMetadata.totalTokenCount || 0
      }
    }

    return result
  }
}

// Export singleton instance
export const geminiHandler = new GeminiHandler()

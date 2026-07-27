import { generateOllamaCompletion, streamOllamaCompletion } from '../../services/ollama'
import {
  extractTitleTextFromMessage,
  getProviderCredential,
  normalizeProviderModel,
  normalizeToolCalls,
} from './shared'
import { titleMessages, type ProviderRuntimeAdapter } from './types'

export const ollamaAdapter: ProviderRuntimeAdapter<'ollama'> = {
  provider: 'ollama',
  async generateTitle({ settings, model, prompt, options }) {
    const response = await generateOllamaCompletion(
      getProviderCredential(settings, 'ollama'),
      normalizeProviderModel('ollama', model),
      titleMessages(prompt),
      { signal: options.signal, num_predict: options.maxTokens, think: false }
    )
    return extractTitleTextFromMessage(response.message)
  },
  async *stream({ settings, request }) {
    const baseUrl = getProviderCredential(settings, 'ollama')
    const model = normalizeProviderModel('ollama', request.model)
    const options = {
      temperature: request.temperature,
      num_predict: request.maxTokens,
      think: request.enableThinking,
      tools: request.tools || undefined,
      signal: request.signal,
    }
    if (request.streamResponses === false) {
      const response = await generateOllamaCompletion(baseUrl, model, request.messages, options)
      if (response.message?.thinking)
        yield { type: 'reasoning-delta', delta: response.message.thinking }
      if (response.message?.content) yield { type: 'text-delta', delta: response.message.content }
      const calls = normalizeToolCalls(response.message?.tool_calls)
      if (calls.length) yield { type: 'tool-call-delta', delta: calls }
      const inputTokens = response.prompt_eval_count || 0
      const outputTokens = response.eval_count || 0
      yield {
        type: 'usage',
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        rawUsage: {
          prompt_eval_count: response.prompt_eval_count,
          eval_count: response.eval_count,
        },
      }
      yield { type: 'finish', finishReason: response.done ? 'stop' : undefined }
      return
    }
    for await (const chunk of streamOllamaCompletion(baseUrl, model, request.messages, options)) {
      if (chunk.message?.thinking) yield { type: 'reasoning-delta', delta: chunk.message.thinking }
      if (chunk.message?.content) yield { type: 'text-delta', delta: chunk.message.content }
      const calls = normalizeToolCalls(chunk.message?.tool_calls)
      if (calls.length) yield { type: 'tool-call-delta', delta: calls }
      if (chunk.done) {
        const inputTokens = chunk.prompt_eval_count || 0
        const outputTokens = chunk.eval_count || 0
        yield {
          type: 'usage',
          usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
          rawUsage: { prompt_eval_count: chunk.prompt_eval_count, eval_count: chunk.eval_count },
        }
        yield { type: 'finish', finishReason: 'stop' }
      }
    }
  },
}

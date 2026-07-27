import { generateDeepSeekCompletion, streamDeepSeekCompletion } from '../../services/deepseek'
import {
  commonRequestOptions,
  emitOpenAiCompatibleResponse,
  emitStandardChunk,
  extractTitleTextFromMessage,
  getProviderCredential,
  normalizeProviderModel,
  type OpenAiCompatibleResponse,
} from './shared'
import { titleMessages, type ProviderRuntimeAdapter } from './types'

export const deepseekAdapter: ProviderRuntimeAdapter<'deepseek'> = {
  provider: 'deepseek',
  async generateTitle({ settings, model, prompt, options }) {
    const response = await generateDeepSeekCompletion(
      getProviderCredential(settings, 'deepseek'),
      normalizeProviderModel('deepseek', model),
      titleMessages(prompt),
      {
        signal: options.signal,
        max_tokens: options.maxTokens,
        enableThinking: false,
        jsonMode: options.jsonMode,
      }
    )
    return extractTitleTextFromMessage(response.choices?.[0]?.message)
  },
  async *stream({ settings, request }) {
    const key = getProviderCredential(settings, 'deepseek')
    const model = normalizeProviderModel('deepseek', request.model)
    const options = {
      ...commonRequestOptions(request),
      enableThinking: request.enableThinking,
      reasoningEffort: request.reasoningEffort,
    }
    if (request.streamResponses === false) {
      const response = await generateDeepSeekCompletion(key, model, request.messages, options)
      yield* emitOpenAiCompatibleResponse(response as unknown as OpenAiCompatibleResponse, {
        reasoningContentField: 'reasoning_content',
      })
      return
    }
    for await (const chunk of streamDeepSeekCompletion(key, model, request.messages, options)) {
      const reasoning = chunk.choices?.[0]?.delta?.reasoning_content
      if (reasoning) yield { type: 'reasoning-delta', delta: reasoning }
      yield* emitStandardChunk(chunk as Parameters<typeof emitStandardChunk>[0])
    }
  },
}

import { generateAlibabaCompletion, streamAlibabaCompletion } from '../../services/alibaba'
import { getAlibabaBaseUrl } from '../../services/alibabaEndpoints'
import { shapePromptCacheRequest } from '../promptCaching'
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

export const alibabaAdapter: ProviderRuntimeAdapter<'alibaba'> = {
  provider: 'alibaba',
  async generateTitle({ settings, model, prompt, options }) {
    const response = await generateAlibabaCompletion(
      getProviderCredential(settings, 'alibaba'),
      normalizeProviderModel('alibaba', model),
      titleMessages(prompt),
      {
        signal: options.signal,
        max_tokens: options.maxTokens,
        enableThinking: false,
        baseUrl: getAlibabaBaseUrl(settings.alibabaRegion),
      }
    )
    return extractTitleTextFromMessage(response.choices?.[0]?.message)
  },
  async *stream({ settings, request }) {
    const key = getProviderCredential(settings, 'alibaba')
    const model = normalizeProviderModel('alibaba', request.model)
    const options = {
      ...commonRequestOptions(request),
      enableThinking: request.enableThinking,
      baseUrl: getAlibabaBaseUrl(settings.alibabaRegion),
    }
    if (request.streamResponses === false) {
      const response = await generateAlibabaCompletion(key, model, request.messages, options)
      yield* emitOpenAiCompatibleResponse(response as unknown as OpenAiCompatibleResponse, {
        reasoningContentField: 'reasoning_content',
      })
      return
    }
    const cache = shapePromptCacheRequest({
      provider: 'alibaba',
      model,
      messages: request.messages,
      sessionId: request.sessionId,
    })
    for await (const chunk of streamAlibabaCompletion(key, model, cache.messages, options)) {
      const reasoning = chunk.choices?.[0]?.delta?.reasoning_content
      if (reasoning) yield { type: 'reasoning-delta', delta: reasoning }
      yield* emitStandardChunk(chunk as Parameters<typeof emitStandardChunk>[0])
    }
  },
}

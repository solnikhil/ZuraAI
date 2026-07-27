import { generateFireworksCompletion, streamFireworksCompletion } from '../../services/fireworks'
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

export const fireworksAdapter: ProviderRuntimeAdapter<'fireworks'> = {
  provider: 'fireworks',
  async generateTitle({ settings, model, prompt, options }) {
    const response = await generateFireworksCompletion(
      getProviderCredential(settings, 'fireworks'),
      normalizeProviderModel('fireworks', model),
      titleMessages(prompt),
      { signal: options.signal, max_tokens: options.maxTokens }
    )
    return extractTitleTextFromMessage(response.choices?.[0]?.message)
  },
  async *stream({ settings, request }) {
    const key = getProviderCredential(settings, 'fireworks')
    const model = normalizeProviderModel('fireworks', request.model)
    if (request.streamResponses === false) {
      const response = await generateFireworksCompletion(
        key,
        model,
        request.messages,
        commonRequestOptions(request)
      )
      yield* emitOpenAiCompatibleResponse(response as unknown as OpenAiCompatibleResponse)
      return
    }
    const cache = shapePromptCacheRequest({
      provider: 'fireworks',
      model,
      messages: request.messages,
      sessionId: request.sessionId,
    })
    for await (const chunk of streamFireworksCompletion(key, model, cache.messages, {
      ...commonRequestOptions(request),
      extraHeaders: cache.headers,
    })) {
      yield* emitStandardChunk(chunk as Parameters<typeof emitStandardChunk>[0])
    }
  },
}

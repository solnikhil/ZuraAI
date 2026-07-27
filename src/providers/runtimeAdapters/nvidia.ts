import { generateNvidiaCompletion, streamNvidiaCompletion } from '../../services/nvidia'
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

export const nvidiaAdapter: ProviderRuntimeAdapter<'nvidia'> = {
  provider: 'nvidia',
  async generateTitle({ settings, model, prompt, options }) {
    const response = await generateNvidiaCompletion(
      getProviderCredential(settings, 'nvidia'),
      normalizeProviderModel('nvidia', model),
      titleMessages(prompt),
      { signal: options.signal, max_tokens: options.maxTokens, enableThinking: false }
    )
    return extractTitleTextFromMessage(response.choices?.[0]?.message)
  },
  async *stream({ settings, request }) {
    const key = getProviderCredential(settings, 'nvidia')
    const model = normalizeProviderModel('nvidia', request.model)
    const options = { ...commonRequestOptions(request), enableThinking: request.enableThinking }
    if (request.streamResponses === false) {
      const response = await generateNvidiaCompletion(key, model, request.messages, options)
      yield* emitOpenAiCompatibleResponse(response as unknown as OpenAiCompatibleResponse, {
        reasoningContentField: 'reasoning_content',
      })
      return
    }
    for await (const chunk of streamNvidiaCompletion(key, model, request.messages, options)) {
      const choice = chunk.choices?.[0]
      const reasoning = choice?.delta?.reasoning_content || choice?.delta?.reasoning || ''
      if (reasoning) yield { type: 'reasoning-delta', delta: reasoning }
      yield* emitStandardChunk(chunk as Parameters<typeof emitStandardChunk>[0])
    }
  },
}

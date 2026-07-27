import { generateGroqCompletion, streamGroqCompletion } from '../../services/groq'
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

export const groqAdapter: ProviderRuntimeAdapter<'groq'> = {
  provider: 'groq',
  async generateTitle({ settings, model, prompt, options }) {
    const response = await generateGroqCompletion(
      getProviderCredential(settings, 'groq'),
      normalizeProviderModel('groq', model),
      titleMessages(prompt),
      { signal: options.signal, max_tokens: options.maxTokens }
    )
    return extractTitleTextFromMessage(response.choices?.[0]?.message)
  },
  async *stream({ settings, request }) {
    const key = getProviderCredential(settings, 'groq')
    const model = normalizeProviderModel('groq', request.model)
    if (request.streamResponses === false) {
      const response = await generateGroqCompletion(
        key,
        model,
        request.messages,
        commonRequestOptions(request)
      )
      yield* emitOpenAiCompatibleResponse(response as unknown as OpenAiCompatibleResponse)
      return
    }
    for await (const chunk of streamGroqCompletion(
      key,
      model,
      request.messages,
      commonRequestOptions(request)
    )) {
      yield* emitStandardChunk(chunk as Parameters<typeof emitStandardChunk>[0])
    }
  },
}

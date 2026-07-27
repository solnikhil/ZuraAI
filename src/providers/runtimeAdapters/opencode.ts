import {
  extractOpencodeStreamReasoningDelta,
  generateOpencodeCompletion,
  streamOpencodeCompletion,
} from '../../services/opencode'
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

export const opencodeAdapter: ProviderRuntimeAdapter<'opencode'> = {
  provider: 'opencode',
  async generateTitle({ settings, model, prompt, options }) {
    const response = await generateOpencodeCompletion(
      getProviderCredential(settings, 'opencode'),
      normalizeProviderModel('opencode', model),
      titleMessages(prompt),
      { signal: options.signal, max_tokens: options.maxTokens }
    )
    return extractTitleTextFromMessage(response.choices?.[0]?.message)
  },
  async *stream({ settings, request }) {
    const key = getProviderCredential(settings, 'opencode')
    const model = normalizeProviderModel('opencode', request.model)
    if (request.streamResponses === false) {
      const response = await generateOpencodeCompletion(
        key,
        model,
        request.messages,
        commonRequestOptions(request)
      )
      yield* emitOpenAiCompatibleResponse(response as unknown as OpenAiCompatibleResponse, {
        reasoningContentField: 'reasoning_content',
      })
      return
    }
    let emittedReasoning = ''
    for await (const chunk of streamOpencodeCompletion(
      key,
      model,
      request.messages,
      commonRequestOptions(request)
    )) {
      const reasoning = extractOpencodeStreamReasoningDelta(
        chunk.choices?.[0]?.delta,
        emittedReasoning
      )
      if (reasoning) {
        emittedReasoning = reasoning.nextEmitted
        yield { type: 'reasoning-delta', delta: reasoning.delta }
      }
      yield* emitStandardChunk(chunk as Parameters<typeof emitStandardChunk>[0])
    }
  },
}

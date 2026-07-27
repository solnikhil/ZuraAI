import { generateOpenRouterCompletion, streamOpenRouterCompletion } from '../../services/openrouter'
import { shapePromptCacheRequest } from '../promptCaching'
import {
  extractTitleTextFromMessage,
  getProviderCredential,
  mapDataUrlImagesToFiles,
  normalizeProviderModel,
  normalizeReasoningDetails,
  normalizeUsage,
} from './shared'
import { titleMessages, type ProviderRuntimeAdapter } from './types'

function extractReasoning(
  details: Array<{ type?: string; text?: string; summary?: string; content?: string }> | undefined,
  fallback = ''
): string {
  const parts = (details || [])
    .map((detail) => {
      if ((detail.type === 'reasoning.text' || detail.type === 'text') && detail.text)
        return detail.text
      if ((detail.type === 'reasoning.summary' || detail.type === 'summary') && detail.summary)
        return detail.summary
      return detail.content || ''
    })
    .filter(Boolean)
  return parts.length ? parts.join('') : fallback
}

export const openrouterAdapter: ProviderRuntimeAdapter<'openrouter'> = {
  provider: 'openrouter',
  async generateTitle({ settings, model, prompt, options }) {
    const response = await generateOpenRouterCompletion(
      getProviderCredential(settings, 'openrouter'),
      normalizeProviderModel('openrouter', model),
      titleMessages(prompt),
      { signal: options.signal, max_tokens: options.maxTokens, reasoning: { exclude: true } }
    )
    return extractTitleTextFromMessage(response.choices?.[0]?.message)
  },
  async *stream({ settings, request }) {
    const key = getProviderCredential(settings, 'openrouter')
    const model = normalizeProviderModel('openrouter', request.model)
    if (request.streamResponses === false)
      console.warn(
        '[ZuraAI] Ignoring streamResponses=false for OpenRouter chat requests; dashboard chat requires streaming.'
      )
    const cache = shapePromptCacheRequest({
      provider: 'openrouter',
      model,
      messages: request.messages,
      sessionId: request.sessionId,
    })
    for await (const chunk of streamOpenRouterCompletion(key, model, cache.messages, {
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      tools: request.tools || undefined,
      toolChoice: request.toolChoice,
      modalities: request.modalities,
      imageConfig: request.imageConfig,
      reasoning: request.reasoning,
      debug: settings.openRouterDebug,
      signal: request.signal,
    })) {
      const choice = chunk.choices?.[0]
      if (choice?.delta?.content) yield { type: 'text-delta', delta: choice.delta.content }
      const reasoning = extractReasoning(
        choice?.delta?.reasoning_details,
        choice?.delta?.reasoning || ''
      )
      if (reasoning) yield { type: 'reasoning-delta', delta: reasoning }
      const details = normalizeReasoningDetails(choice?.delta?.reasoning_details)
      if (details.length) yield { type: 'reasoning-details', details }
      if (choice?.delta?.tool_calls?.length)
        yield { type: 'tool-call-delta', delta: choice.delta.tool_calls }
      const files = mapDataUrlImagesToFiles(choice?.delta?.images, model)
      if (files.length) yield { type: 'file-delta', files }
      if (chunk.usage)
        yield { type: 'usage', usage: normalizeUsage(chunk.usage), rawUsage: chunk.usage }
      if (choice?.finish_reason) yield { type: 'finish', finishReason: choice.finish_reason }
    }
  },
}

import {
  generateAlibabaCompletion,
  streamAlibabaCompletion,
  type AlibabaResponse,
} from '../services/alibaba'
import {
  generateFireworksCompletion,
  streamFireworksCompletion,
  type FireworksResponse,
} from '../services/fireworks'
import {
  generateGroqCompletion,
  streamGroqCompletion,
  type GroqResponse,
} from '../services/groq'
import {
  generateOllamaCompletion,
  streamOllamaCompletion,
  type OllamaResponse,
} from '../services/ollama'
import {
  generateOpenRouterCompletion,
  streamOpenRouterCompletion,
  type OpenRouterResponse,
} from '../services/openrouter'
import {
  generatePerplexityCompletion,
  streamPerplexityCompletion,
  type PerplexityResponse,
} from '../services/perplexity'
import type { ChatMessage, ReasoningDetail } from '../services/types'
import { DEFAULT_OLLAMA_URL } from './providerRegistry'
import type { ActiveProviderId } from './providerTypes'
import type { FileAttachment } from '../chat/types'
import {
  emptyUsage,
  type NormalizedStreamEvent,
  type NormalizedToolCallDelta,
  type NormalizedUsage,
  type ProviderRuntimeSettings as StreamingSettings,
  type ProviderRuntimeStreamRequest as StreamRequest,
} from './providerRuntimeTypes'
import { getOpenRouterApiKey } from '../utils/openRouterKey'

function extractOpenRouterReasoningDelta(
  reasoningDetails:
    | Array<{
        type?: string
        text?: string
        summary?: string
        content?: string
      }>
    | undefined,
  fallbackReasoning?: string
): string {
  if (Array.isArray(reasoningDetails) && reasoningDetails.length > 0) {
    const parts = reasoningDetails
      .map((detail) => {
        if (!detail || typeof detail !== 'object') return ''

        if (
          (detail.type === 'reasoning.text' || detail.type === 'text') &&
          typeof detail.text === 'string'
        ) {
          return detail.text
        }

        if (
          (detail.type === 'reasoning.summary' || detail.type === 'summary') &&
          typeof detail.summary === 'string'
        ) {
          return detail.summary
        }

        if (typeof detail.content === 'string') {
          return detail.content
        }

        return ''
      })
      .filter((part) => part.length > 0)

    if (parts.length > 0) {
      return parts.join('')
    }
  }

  return fallbackReasoning || ''
}

type OpenAiCompatibleResponse =
  | OpenRouterResponse
  | GroqResponse
  | AlibabaResponse
  | PerplexityResponse
  | FireworksResponse

type TitleGenerationSettings = Partial<
  Pick<
    StreamingSettings,
    | 'alibabaApiKey'
    | 'fireworksApiKey'
    | 'groqApiKey'
    | 'ollamaUrl'
    | 'openRouterApiKey'
    | 'perplexityApiKey'
  >
>


function inferMimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;,]+)[;,]/i)
  return match?.[1] || 'image/png'
}

function mapDataUrlImagesToFiles(
  images: Array<{ image_url?: { url?: string } }> | undefined,
  prefix: string
): FileAttachment[] {
  return (images || [])
    .map((image) => image.image_url?.url?.trim() || '')
    .filter((url) => url.startsWith('data:image/'))
    .map((url, index) => {
      const mimeType = inferMimeTypeFromDataUrl(url)
      const extension = mimeType.split('/')[1] || 'png'
      return {
        id: `${prefix}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        name: `generated-image-${index + 1}.${extension}`,
        type: 'image',
        size: url.length,
        data: url,
        mimeType,
      } satisfies FileAttachment
    })
}

function normalizeToolCalls(
  toolCalls:
    | Array<{
        id?: string
        type?: 'function'
        function?: { name?: string; arguments?: string }
      }>
    | undefined
): NormalizedToolCallDelta[] {
  return (toolCalls || []).map((toolCall, index) => ({
    index,
    id: toolCall.id,
    type: 'function',
    function: {
      name: toolCall.function?.name,
      arguments: toolCall.function?.arguments,
    },
  }))
}

function normalizeReasoningDetails(details: ReasoningDetail[] | undefined): ReasoningDetail[] {
  return Array.isArray(details) ? details.filter((detail) => detail && typeof detail === 'object') : []
}

function normalizeUsage(
  usage:
    | {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
        prompt_cache_tokens?: number
        completion_cache_tokens?: number
        completion_tokens_details?: { reasoning_tokens?: number }
        reasoning_tokens?: number
        input_tokens?: number
        output_tokens?: number
      }
    | undefined
): NormalizedUsage {
  if (!usage) return emptyUsage()

  const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0
  const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage.total_tokens ?? inputTokens + outputTokens,
    thinkingTokens:
      usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? undefined,
    cachedInputTokens: usage.prompt_cache_tokens,
    cachedOutputTokens: usage.completion_cache_tokens,
  }
}

const smoothStreamingSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function splitForProgressiveStreaming(delta: string): string[] {
  if (!delta) return []
  if (delta.length <= 24) return [delta]

  const units = delta.match(/\S+\s*|\s+/g) || [delta]
  const pieces: string[] = []
  let buffer = ''

  for (const unit of units) {
    if ((buffer + unit).length > 12 && buffer.length > 0) {
      pieces.push(buffer)
      buffer = unit
      continue
    }

    buffer += unit
  }

  if (buffer) {
    pieces.push(buffer)
  }

  return pieces.length > 1 ? pieces : [delta]
}

async function* emitOpenAiCompatibleResponse(
  response: OpenAiCompatibleResponse,
  options?: { responsePrefix?: string; includeReasoning?: boolean; reasoningContentField?: string }
): AsyncGenerator<NormalizedStreamEvent, void, unknown> {
  const choice = response.choices?.[0]
  const message = choice?.message
  const content = message?.content || ''
  if (content) {
    yield { type: 'text-delta', delta: content }
  }

  if (options?.includeReasoning) {
    const reasoningField = options?.reasoningContentField || 'reasoning'
    const reasoningContent = (message as Record<string, unknown>)?.[reasoningField]
    if (typeof reasoningContent === 'string' && reasoningContent) {
      yield { type: 'reasoning-delta', delta: reasoningContent }
    } else {
      const reasoning = (
        message as OpenRouterResponse['choices'][0]['message'] & { reasoning?: string }
      )?.reasoning
      if (reasoning) {
        yield { type: 'reasoning-delta', delta: reasoning }
      }
    }
  }

  const toolCalls = normalizeToolCalls(
    (message as {
      tool_calls?: Array<{
        id?: string
        type?: 'function'
        function?: { name?: string; arguments?: string }
      }>
    })?.tool_calls
  )
  if (toolCalls.length > 0) {
    yield { type: 'tool-call-delta', delta: toolCalls }
  }

  const images = mapDataUrlImagesToFiles(
    (message as OpenRouterResponse['choices'][0]['message'])?.images,
    options?.responsePrefix || 'response'
  )
  if (images.length > 0) {
    yield { type: 'file-delta', files: images }
  }

  if ('usage' in response && response.usage) {
    yield { type: 'usage', usage: normalizeUsage(response.usage) }
  }

  if ('citations' in response && Array.isArray(response.citations) && response.citations.length > 0) {
    yield { type: 'citation', citations: response.citations }
  }

  yield { type: 'finish', finishReason: choice?.finish_reason }
}

async function* emitOllamaResponse(
  response: OllamaResponse
): AsyncGenerator<NormalizedStreamEvent, void, unknown> {
  if (response.message?.thinking) {
    yield { type: 'reasoning-delta', delta: response.message.thinking }
  }

  if (response.message?.content) {
    yield { type: 'text-delta', delta: response.message.content }
  }

  if (
    (
      response.message as {
        tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>
      }
    )?.tool_calls?.length
  ) {
    yield {
      type: 'tool-call-delta',
      delta: normalizeToolCalls(
        (
          response.message as {
            tool_calls?: Array<{
              id?: string
              function?: { name?: string; arguments?: string }
            }>
          }
        ).tool_calls
      ),
    }
  }

  yield {
    type: 'usage',
    usage: {
      inputTokens: response.prompt_eval_count || 0,
      outputTokens: response.eval_count || 0,
      totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
    },
  }
  yield { type: 'finish', finishReason: response.done ? 'stop' : undefined }
}

function getProviderCredential(
  settings: TitleGenerationSettings | StreamingSettings,
  provider: ActiveProviderId
): string {
  switch (provider) {
    case 'openrouter': {
      const apiKey = getOpenRouterApiKey(settings.openRouterApiKey)
      if (!apiKey) throw new Error('OpenRouter API Key is missing')
      return apiKey
    }
    case 'groq':
      if (!settings.groqApiKey) throw new Error('Groq API Key is missing')
      return settings.groqApiKey
    case 'alibaba':
      if (!settings.alibabaApiKey) throw new Error('Alibaba API Key is missing')
      return settings.alibabaApiKey
    case 'fireworks':
      if (!settings.fireworksApiKey) throw new Error('Fireworks API Key is missing')
      return settings.fireworksApiKey
    case 'perplexity':
      if (!settings.perplexityApiKey) throw new Error('Perplexity API Key is missing')
      return settings.perplexityApiKey
    case 'ollama':
      return settings.ollamaUrl?.trim() || DEFAULT_OLLAMA_URL
  }
}

function normalizeProviderModel(provider: ActiveProviderId, model: string): string {
  if (provider === 'openrouter' && model.startsWith('openrouter/')) {
    return model.slice('openrouter/'.length)
  }

  return model
}

export async function generateProviderTitleText(
  settings: TitleGenerationSettings,
  provider: ActiveProviderId,
  model: string,
  prompt: string
): Promise<string> {
  const normalizedModel = normalizeProviderModel(provider, model)
  const messages: ChatMessage[] = [{ role: 'user', content: prompt }]

  switch (provider) {
    case 'groq': {
      const result = await generateGroqCompletion(
        getProviderCredential(settings, provider),
        normalizedModel,
        messages,
        { temperature: 0.3 }
      )
      return result.choices?.[0]?.message?.content || ''
    }
    case 'perplexity': {
      const result = await generatePerplexityCompletion(
        getProviderCredential(settings, provider),
        normalizedModel,
        messages,
        { temperature: 0.3, max_tokens: 20 }
      )
      return result.choices?.[0]?.message?.content || ''
    }
    case 'ollama': {
      const result = await generateOllamaCompletion(
        getProviderCredential(settings, provider),
        normalizedModel,
        messages,
        { temperature: 0.3 }
      )
      return result.message?.content || ''
    }
    case 'alibaba': {
      const result = await generateAlibabaCompletion(
        getProviderCredential(settings, provider),
        normalizedModel,
        messages,
        { temperature: 0.3, max_tokens: 20 }
      )
      return result.choices?.[0]?.message?.content || ''
    }
    case 'fireworks': {
      const result = await generateFireworksCompletion(
        getProviderCredential(settings, provider),
        normalizedModel,
        messages,
        { temperature: 0.3, max_tokens: 20 }
      )
      return result.choices?.[0]?.message?.content || ''
    }
    case 'openrouter': {
      const result = await generateOpenRouterCompletion(
        getProviderCredential(settings, provider),
        normalizedModel,
        messages,
        { temperature: 0.3, max_tokens: 20 }
      )
      return result.choices?.[0]?.message?.content || ''
    }
  }
}

export async function* streamProviderEvents(
  settings: StreamingSettings,
  request: StreamRequest
): AsyncGenerator<NormalizedStreamEvent, void, unknown> {
  const normalizedModel = normalizeProviderModel(request.provider, request.model)

  switch (request.provider) {
    case 'openrouter': {
      const apiKey = getProviderCredential(settings, 'openrouter')
      if (request.streamResponses === false) {
        console.warn(
          '[ZuraAI] Ignoring streamResponses=false for OpenRouter chat requests; dashboard chat requires streaming.'
        )
      }

      for await (const chunk of streamOpenRouterCompletion(apiKey, normalizedModel, request.messages, {
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
        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (delta) {
          const progressiveDeltas = splitForProgressiveStreaming(delta)
          for (let index = 0; index < progressiveDeltas.length; index += 1) {
            yield { type: 'text-delta', delta: progressiveDeltas[index] }
            if (progressiveDeltas.length > 1 && index < progressiveDeltas.length - 1) {
              await smoothStreamingSleep(10)
            }
          }
        }

        const reasoningDetails = chunk.choices?.[0]?.delta?.reasoning_details
        const reasoningDelta = extractOpenRouterReasoningDelta(
          reasoningDetails,
          chunk.choices?.[0]?.delta?.reasoning || ''
        )
        const normalizedReasoningDetails = normalizeReasoningDetails(reasoningDetails)
        if (reasoningDelta) {
          yield { type: 'reasoning-delta', delta: reasoningDelta }
        }
        if (normalizedReasoningDetails.length > 0) {
          yield { type: 'reasoning-details', details: normalizedReasoningDetails }
        }

        const toolCalls = chunk.choices?.[0]?.delta?.tool_calls
        if (toolCalls?.length) {
          yield { type: 'tool-call-delta', delta: toolCalls }
        }

        const files = mapDataUrlImagesToFiles(chunk.choices?.[0]?.delta?.images, normalizedModel)
        if (files.length > 0) {
          yield { type: 'file-delta', files }
        }

        if (chunk.usage) {
          yield { type: 'usage', usage: normalizeUsage(chunk.usage) }
        }

        if (chunk.choices?.[0]?.finish_reason) {
          yield { type: 'finish', finishReason: chunk.choices[0].finish_reason }
        }
      }
      return
    }
    case 'groq': {
      const apiKey = getProviderCredential(settings, 'groq')
      if (request.streamResponses === false) {
        const response = await generateGroqCompletion(apiKey, normalizedModel, request.messages, {
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          tools: request.tools || undefined,
          toolChoice: request.toolChoice,
          signal: request.signal,
        })
        yield* emitOpenAiCompatibleResponse(response)
        return
      }

      for await (const chunk of streamGroqCompletion(apiKey, normalizedModel, request.messages, {
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        tools: request.tools || undefined,
        toolChoice: request.toolChoice,
        signal: request.signal,
      })) {
        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (delta) yield { type: 'text-delta', delta }
        if (chunk.choices?.[0]?.delta?.tool_calls?.length) {
          yield { type: 'tool-call-delta', delta: chunk.choices[0].delta.tool_calls }
        }
        if (chunk.usage) yield { type: 'usage', usage: normalizeUsage(chunk.usage) }
        if (chunk.choices?.[0]?.finish_reason) {
          yield { type: 'finish', finishReason: chunk.choices[0].finish_reason }
        }
      }
      return
    }
    case 'alibaba': {
      const apiKey = getProviderCredential(settings, 'alibaba')
      if (request.streamResponses === false) {
        const response = await generateAlibabaCompletion(apiKey, normalizedModel, request.messages, {
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          tools: request.tools || undefined,
          toolChoice: request.toolChoice,
          signal: request.signal,
          enableThinking: request.enableThinking,
        })
        yield* emitOpenAiCompatibleResponse(response, { includeReasoning: true, reasoningContentField: 'reasoning_content' })
        return
      }

      for await (const chunk of streamAlibabaCompletion(apiKey, normalizedModel, request.messages, {
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        tools: request.tools || undefined,
        toolChoice: request.toolChoice,
        signal: request.signal,
        enableThinking: request.enableThinking,
      })) {
        const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning_content
        if (reasoningDelta) {
          yield { type: 'reasoning-delta', delta: reasoningDelta }
        }

        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (delta) yield { type: 'text-delta', delta }
        if (chunk.choices?.[0]?.delta?.tool_calls?.length) {
          yield { type: 'tool-call-delta', delta: chunk.choices[0].delta.tool_calls }
        }
        if (chunk.usage) yield { type: 'usage', usage: normalizeUsage(chunk.usage) }
        if (chunk.choices?.[0]?.finish_reason) {
          yield { type: 'finish', finishReason: chunk.choices[0].finish_reason }
        }
      }
      return
    }
    case 'fireworks': {
      const apiKey = getProviderCredential(settings, 'fireworks')
      if (request.streamResponses === false) {
        const response = await generateFireworksCompletion(apiKey, normalizedModel, request.messages, {
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          tools: request.tools || undefined,
          toolChoice: request.toolChoice,
          signal: request.signal,
        })
        yield* emitOpenAiCompatibleResponse(response)
        return
      }

      for await (const chunk of streamFireworksCompletion(apiKey, normalizedModel, request.messages, {
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        tools: request.tools || undefined,
        toolChoice: request.toolChoice,
        signal: request.signal,
      })) {
        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (delta) yield { type: 'text-delta', delta }
        if (chunk.choices?.[0]?.delta?.tool_calls?.length) {
          yield { type: 'tool-call-delta', delta: chunk.choices[0].delta.tool_calls }
        }
        if (chunk.usage) yield { type: 'usage', usage: normalizeUsage(chunk.usage) }
        if (chunk.choices?.[0]?.finish_reason) {
          yield { type: 'finish', finishReason: chunk.choices[0].finish_reason }
        }
      }
      return
    }
    case 'ollama': {
      const baseUrl = getProviderCredential(settings, 'ollama')

      if (request.streamResponses === false) {
        const response = await generateOllamaCompletion(baseUrl, normalizedModel, request.messages, {
          temperature: request.temperature,
          think: true,
          tools: request.tools || undefined,
          signal: request.signal,
        })
        yield* emitOllamaResponse(response)
        return
      }

      try {
        for await (const chunk of streamOllamaCompletion(baseUrl, normalizedModel, request.messages, {
          temperature: request.temperature,
          think: true,
          tools: request.tools || undefined,
          signal: request.signal,
        })) {
          const thinkingDelta = chunk.message?.thinking || ''
          if (thinkingDelta) yield { type: 'reasoning-delta', delta: thinkingDelta }

          const delta = chunk.message?.content || ''
          if (delta) yield { type: 'text-delta', delta }

          const toolCalls = (
            chunk.message as {
              tool_calls?: Array<{
                id?: string
                function?: { name?: string; arguments?: string }
              }>
            }
          )?.tool_calls
          if (toolCalls?.length) {
            yield { type: 'tool-call-delta', delta: normalizeToolCalls(toolCalls) }
          }

          if (chunk.done) {
            yield {
              type: 'usage',
              usage: {
                inputTokens: chunk.prompt_eval_count || 0,
                outputTokens: chunk.eval_count || 0,
                totalTokens: (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0),
              },
            }
            yield { type: 'finish', finishReason: 'stop' }
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') throw error

        const response = await generateOllamaCompletion(baseUrl, normalizedModel, request.messages, {
          temperature: request.temperature,
          think: true,
          tools: request.tools || undefined,
          signal: request.signal,
        })
        yield* emitOllamaResponse(response)
      }
      return
    }
    case 'perplexity': {
      const apiKey = getProviderCredential(settings, 'perplexity')
      if (request.streamResponses === false) {
        const response = await generatePerplexityCompletion(apiKey, normalizedModel, request.messages, {
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          signal: request.signal,
        })
        yield* emitOpenAiCompatibleResponse(response)
        return
      }

      for await (const chunk of streamPerplexityCompletion(apiKey, normalizedModel, request.messages, {
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        signal: request.signal,
      })) {
        const citations = (chunk as { citations?: string[] }).citations
        if (Array.isArray(citations) && citations.length > 0) {
          yield { type: 'citation', citations }
        }

        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (delta) {
          yield { type: 'text-delta', delta }
        }

        if (chunk.usage) {
          yield { type: 'usage', usage: normalizeUsage(chunk.usage) }
        }

        if (chunk.choices?.[0]?.finish_reason) {
          yield { type: 'finish', finishReason: chunk.choices[0].finish_reason }
        }
      }
    }
  }
}

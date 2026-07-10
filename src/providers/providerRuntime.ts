import {
  generateAlibabaCompletion,
  streamAlibabaCompletion,
  type AlibabaResponse,
} from '../services/alibaba'
import {
  generateDeepSeekCompletion,
  streamDeepSeekCompletion,
  type DeepSeekResponse,
} from '../services/deepseek'
import {
  generateFireworksCompletion,
  streamFireworksCompletion,
  type FireworksResponse,
} from '../services/fireworks'
import { generateGroqCompletion, streamGroqCompletion, type GroqResponse } from '../services/groq'
import {
  generateNvidiaCompletion,
  streamNvidiaCompletion,
  type NvidiaResponse,
} from '../services/nvidia'
import {
  extractOpencodeStreamReasoningDelta,
  generateOpencodeCompletion,
  streamOpencodeCompletion,
} from '../services/opencode'
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
import type { ChatMessage, ReasoningDetail } from '../services/types'
import type { SettingsConfig } from '../contexts/SettingsConfigContext'
import {
  DEFAULT_OLLAMA_URL,
  getProviderDefinition,
  resolveProviderForModel,
} from './providerRegistry'
import { getProviderSettingsDefinition } from './providerSettingsRegistry'
import type { ActiveProviderId } from './providerTypes'
import { shapePromptCacheRequest } from './promptCaching'
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
import { resolveProviderApiKeysForSettings } from '../utils/secureApiKeys'

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
  | FireworksResponse
  | NvidiaResponse
  | DeepSeekResponse

type TitleGenerationSettings = Pick<
  StreamingSettings,
  | 'alibabaApiKey'
  | 'deepseekApiKey'
  | 'opencodeGoApiKey'
  | 'fireworksApiKey'
  | 'groqApiKey'
  | 'nvidiaApiKey'
  | 'ollamaUrl'
  | 'openRouterApiKey'
>

export function extractTitleTextFromMessage(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const record = message as Record<string, unknown>

  const content = record.content
  if (typeof content === 'string' && content.trim()) {
    return content
  }

  // Some providers return content as an array of parts.
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (!part || typeof part !== 'object') return ''
        const text = (part as Record<string, unknown>).text
        return typeof text === 'string' ? text : ''
      })
      .join('')
      .trim()
    if (joined) return joined
  }

  // Last-resort net: a reasoning model (e.g. DeepSeek reasoner) can return an
  // empty `content` while its answer/JSON sits in `reasoning_content` — for
  // example when the token budget is consumed by reasoning. We only read it
  // when `content` produced nothing, so this never overrides a real answer.
  const reasoningContent = record.reasoning_content
  if (typeof reasoningContent === 'string' && reasoningContent.trim()) {
    return reasoningContent
  }

  return ''
}

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
  return Array.isArray(details)
    ? details.filter((detail) => detail && typeof detail === 'object')
    : []
}

function normalizeUsage(
  usage:
    | {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
        prompt_cache_tokens?: number
        completion_cache_tokens?: number
        prompt_cache_hit_tokens?: number
        prompt_cache_miss_tokens?: number
        cache_creation_input_tokens?: number
        cache_write_input_tokens?: number
        prompt_tokens_details?: { cached_tokens?: number }
        completion_tokens_details?: {
          reasoning_tokens?: number
          image_tokens?: number
          audio_tokens?: number
        }
        reasoning_tokens?: number
        input_tokens?: number
        output_tokens?: number
        cost?: number
      }
    | undefined
): NormalizedUsage {
  if (!usage) return emptyUsage()

  const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0
  const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0
  const cachedInputTokens =
    usage.prompt_cache_tokens ??
    usage.prompt_cache_hit_tokens ??
    usage.prompt_tokens_details?.cached_tokens
  const cacheWriteInputTokens = usage.cache_write_input_tokens ?? usage.cache_creation_input_tokens
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage.total_tokens ?? inputTokens + outputTokens,
    thinkingTokens:
      usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? undefined,
    cachedInputTokens,
    cachedOutputTokens: usage.completion_cache_tokens,
    cacheMissInputTokens: usage.prompt_cache_miss_tokens,
    cacheWriteInputTokens,
    cost: usage.cost,
    imageTokens: usage.completion_tokens_details?.image_tokens,
    audioTokens: usage.completion_tokens_details?.audio_tokens,
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

async function* yieldProgressiveTextDeltas(
  delta: string
): AsyncGenerator<NormalizedStreamEvent, void, unknown> {
  const progressiveDeltas = splitForProgressiveStreaming(delta)
  for (let index = 0; index < progressiveDeltas.length; index += 1) {
    yield {
      type: 'text-delta',
      delta: progressiveDeltas[index],
      smoothing:
        progressiveDeltas.length > 1
          ? {
              sourceLength: delta.length,
              pieceIndex: index,
              pieceCount: progressiveDeltas.length,
            }
          : undefined,
    }
    if (progressiveDeltas.length > 1 && index < progressiveDeltas.length - 1) {
      await smoothStreamingSleep(10)
    }
  }
}

async function* emitOpenAiCompatibleResponse(
  response: OpenAiCompatibleResponse,
  options?: { responsePrefix?: string; includeReasoning?: boolean; reasoningContentField?: string }
): AsyncGenerator<NormalizedStreamEvent, void, unknown> {
  const choice = response.choices?.[0]
  const message = choice?.message
  const content = message?.content || ''

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

  if (content) {
    yield* yieldProgressiveTextDeltas(content)
  }

  const toolCalls = normalizeToolCalls(
    (
      message as {
        tool_calls?: Array<{
          id?: string
          type?: 'function'
          function?: { name?: string; arguments?: string }
        }>
      }
    )?.tool_calls
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
    yield { type: 'usage', usage: normalizeUsage(response.usage), rawUsage: response.usage }
  }

  if (
    'citations' in response &&
    Array.isArray(response.citations) &&
    response.citations.length > 0
  ) {
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
    yield* yieldProgressiveTextDeltas(response.message.content)
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
    rawUsage: {
      prompt_eval_count: response.prompt_eval_count,
      eval_count: response.eval_count,
    },
  }
  yield { type: 'finish', finishReason: response.done ? 'stop' : undefined }
}

function getProviderCredential(
  settings: TitleGenerationSettings | StreamingSettings,
  provider: ActiveProviderId
): string {
  if (provider === 'ollama') {
    return settings.ollamaUrl?.trim() || DEFAULT_OLLAMA_URL
  }

  if (provider === 'openrouter') {
    const apiKey = getOpenRouterApiKey(settings.openRouterApiKey)
    if (!apiKey) throw new Error('OpenRouter API Key is missing')
    return apiKey
  }

  const secretKeyField = getProviderSettingsDefinition(provider)?.secretKeyField
  const rawValue = secretKeyField
    ? (settings as Record<string, unknown>)[secretKeyField]
    : undefined
  const apiKey = typeof rawValue === 'string' ? rawValue.trim() : ''

  if (!apiKey) {
    throw new Error(`${getProviderDefinition(provider).label} API Key is missing`)
  }

  return apiKey
}

function normalizeProviderModel(provider: ActiveProviderId, model: string): string {
  if (provider === 'openrouter' && model.startsWith('openrouter/')) {
    return model.slice('openrouter/'.length)
  }
  if (provider === 'opencode' && model.startsWith('opencode-go/')) {
    return model.slice('opencode-go/'.length)
  }

  return model
}

interface LightweightGenerationOptions {
  signal?: AbortSignal
  maxTokens?: number
  jsonMode?: boolean
}

export async function generateProviderTitleText(
  settings: TitleGenerationSettings,
  provider: ActiveProviderId,
  model: string,
  prompt: string,
  generationOptions: LightweightGenerationOptions = {}
): Promise<string> {
  const resolvedSettings = await resolveProviderApiKeysForSettings(settings, provider)
  const normalizedModel = normalizeProviderModel(provider, model)
  const messages: ChatMessage[] = [{ role: 'user', content: prompt }]

  switch (provider) {
    case 'groq': {
      const options = { signal: generationOptions.signal, max_tokens: generationOptions.maxTokens }
      const result = await generateGroqCompletion(
        getProviderCredential(resolvedSettings, provider),
        normalizedModel,
        messages,
        options
      )
      return extractTitleTextFromMessage(result.choices?.[0]?.message)
    }
    case 'ollama': {
      const options = {
        think: false,
        signal: generationOptions.signal,
        max_tokens: generationOptions.maxTokens,
      }
      const result = await generateOllamaCompletion(
        getProviderCredential(resolvedSettings, provider),
        normalizedModel,
        messages,
        options
      )
      return extractTitleTextFromMessage(result.message)
    }
    case 'alibaba': {
      const options = {
        enableThinking: false,
        signal: generationOptions.signal,
        max_tokens: generationOptions.maxTokens,
      }
      const result = await generateAlibabaCompletion(
        getProviderCredential(resolvedSettings, provider),
        normalizedModel,
        messages,
        options
      )
      return extractTitleTextFromMessage(result.choices?.[0]?.message)
    }
    case 'deepseek': {
      const options = {
        enableThinking: false,
        signal: generationOptions.signal,
        max_tokens: generationOptions.maxTokens,
        jsonMode: generationOptions.jsonMode,
      }
      const result = await generateDeepSeekCompletion(
        getProviderCredential(resolvedSettings, provider),
        normalizedModel,
        messages,
        options
      )
      return extractTitleTextFromMessage(result.choices?.[0]?.message)
    }
    case 'opencode': {
      const options = { signal: generationOptions.signal, max_tokens: generationOptions.maxTokens }
      const result = await generateOpencodeCompletion(
        getProviderCredential(resolvedSettings, provider),
        normalizedModel,
        messages,
        options
      )
      return extractTitleTextFromMessage(result.choices?.[0]?.message)
    }
    case 'fireworks': {
      const options = { signal: generationOptions.signal, max_tokens: generationOptions.maxTokens }
      const result = await generateFireworksCompletion(
        getProviderCredential(resolvedSettings, provider),
        normalizedModel,
        messages,
        options
      )
      return extractTitleTextFromMessage(result.choices?.[0]?.message)
    }
    case 'nvidia': {
      const options = {
        signal: generationOptions.signal,
        max_tokens: generationOptions.maxTokens,
        enableThinking: false,
      }
      const result = await generateNvidiaCompletion(
        getProviderCredential(resolvedSettings, provider),
        normalizedModel,
        messages,
        options
      )
      return extractTitleTextFromMessage(result.choices?.[0]?.message)
    }
    case 'openrouter': {
      const options = {
        reasoning: { exclude: true },
        signal: generationOptions.signal,
        max_tokens: generationOptions.maxTokens,
      }
      const result = await generateOpenRouterCompletion(
        getProviderCredential(resolvedSettings, provider),
        normalizedModel,
        messages,
        options
      )
      return extractTitleTextFromMessage(result.choices?.[0]?.message)
    }
  }
}

export async function generateTitleTextForModel(
  settings: TitleGenerationSettings &
    Partial<
      Pick<
        SettingsConfig,
        | 'configuredModels'
        | 'ollamaModels'
        | 'groqModels'
        | 'nvidiaModels'
        | 'alibabaModels'
        | 'fireworksModels'
        | 'deepseekModels'
        | 'opencodeModels'
      >
    >,
  model: string,
  prompt: string,
  generationOptions: LightweightGenerationOptions = {}
): Promise<string> {
  const resolvedModel = resolveProviderForModel(settings, model)
  if (!resolvedModel) {
    throw new Error('Title model not found')
  }

  return generateProviderTitleText(
    settings,
    resolvedModel.provider,
    resolvedModel.id,
    prompt,
    generationOptions
  )
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

      const cacheRequest = shapePromptCacheRequest({
        provider: request.provider,
        model: normalizedModel,
        messages: request.messages,
        sessionId: request.sessionId,
      })

      for await (const chunk of streamOpenRouterCompletion(
        apiKey,
        normalizedModel,
        cacheRequest.messages,
        {
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          tools: request.tools || undefined,
          toolChoice: request.toolChoice,
          modalities: request.modalities,
          imageConfig: request.imageConfig,
          reasoning: request.reasoning,
          debug: settings.openRouterDebug,
          signal: request.signal,
        }
      )) {
        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (delta) {
          yield* yieldProgressiveTextDeltas(delta)
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
          yield { type: 'usage', usage: normalizeUsage(chunk.usage), rawUsage: chunk.usage }
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
        if (delta) yield* yieldProgressiveTextDeltas(delta)
        if (chunk.choices?.[0]?.delta?.tool_calls?.length) {
          yield { type: 'tool-call-delta', delta: chunk.choices[0].delta.tool_calls }
        }
        if (chunk.usage)
          yield { type: 'usage', usage: normalizeUsage(chunk.usage), rawUsage: chunk.usage }
        if (chunk.choices?.[0]?.finish_reason) {
          yield { type: 'finish', finishReason: chunk.choices[0].finish_reason }
        }
      }
      return
    }
    case 'opencode': {
      const apiKey = getProviderCredential(settings, 'opencode')
      if (request.streamResponses === false) {
        const response = await generateOpencodeCompletion(
          apiKey,
          normalizedModel,
          request.messages,
          {
            temperature: request.temperature,
            max_tokens: request.maxTokens,
            tools: request.tools || undefined,
            toolChoice: request.toolChoice,
            signal: request.signal,
          }
        )
        yield* emitOpenAiCompatibleResponse(response, {
          includeReasoning: true,
          reasoningContentField: 'reasoning_content',
        })
        return
      }

      let emittedOpencodeReasoning = ''
      for await (const chunk of streamOpencodeCompletion(
        apiKey,
        normalizedModel,
        request.messages,
        {
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          tools: request.tools || undefined,
          toolChoice: request.toolChoice,
          signal: request.signal,
        }
      )) {
        const reasoningEvent = extractOpencodeStreamReasoningDelta(
          chunk.choices?.[0]?.delta,
          emittedOpencodeReasoning
        )
        if (reasoningEvent) {
          emittedOpencodeReasoning = reasoningEvent.nextEmitted
          yield { type: 'reasoning-delta', delta: reasoningEvent.delta }
        }

        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (delta) yield* yieldProgressiveTextDeltas(delta)
        if (chunk.choices?.[0]?.delta?.tool_calls?.length) {
          yield { type: 'tool-call-delta', delta: chunk.choices[0].delta.tool_calls }
        }
        if (chunk.usage)
          yield { type: 'usage', usage: normalizeUsage(chunk.usage), rawUsage: chunk.usage }
        if (chunk.choices?.[0]?.finish_reason) {
          yield { type: 'finish', finishReason: chunk.choices[0].finish_reason }
        }
      }
      return
    }
    case 'nvidia': {
      const apiKey = getProviderCredential(settings, 'nvidia')
      if (request.streamResponses === false) {
        const response = await generateNvidiaCompletion(apiKey, normalizedModel, request.messages, {
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          tools: request.tools || undefined,
          toolChoice: request.toolChoice,
          signal: request.signal,
          enableThinking: request.enableThinking,
        })
        yield* emitOpenAiCompatibleResponse(response, {
          includeReasoning: true,
          reasoningContentField: 'reasoning_content',
        })
        return
      }

      for await (const chunk of streamNvidiaCompletion(apiKey, normalizedModel, request.messages, {
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        tools: request.tools || undefined,
        toolChoice: request.toolChoice,
        signal: request.signal,
        enableThinking: request.enableThinking,
      })) {
        const reasoningDelta =
          chunk.choices?.[0]?.delta?.reasoning_content || chunk.choices?.[0]?.delta?.reasoning || ''
        if (reasoningDelta) {
          yield { type: 'reasoning-delta', delta: reasoningDelta }
        }

        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (delta) yield* yieldProgressiveTextDeltas(delta)
        if (chunk.choices?.[0]?.delta?.tool_calls?.length) {
          yield { type: 'tool-call-delta', delta: chunk.choices[0].delta.tool_calls }
        }
        if (chunk.usage)
          yield { type: 'usage', usage: normalizeUsage(chunk.usage), rawUsage: chunk.usage }
        if (chunk.choices?.[0]?.finish_reason) {
          yield { type: 'finish', finishReason: chunk.choices[0].finish_reason }
        }
      }
      return
    }
    case 'alibaba': {
      const apiKey = getProviderCredential(settings, 'alibaba')
      if (request.streamResponses === false) {
        const response = await generateAlibabaCompletion(
          apiKey,
          normalizedModel,
          request.messages,
          {
            temperature: request.temperature,
            max_tokens: request.maxTokens,
            tools: request.tools || undefined,
            toolChoice: request.toolChoice,
            signal: request.signal,
            enableThinking: request.enableThinking,
          }
        )
        yield* emitOpenAiCompatibleResponse(response, {
          includeReasoning: true,
          reasoningContentField: 'reasoning_content',
        })
        return
      }

      const cacheRequest = shapePromptCacheRequest({
        provider: request.provider,
        model: normalizedModel,
        messages: request.messages,
        sessionId: request.sessionId,
      })

      for await (const chunk of streamAlibabaCompletion(
        apiKey,
        normalizedModel,
        cacheRequest.messages,
        {
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          tools: request.tools || undefined,
          toolChoice: request.toolChoice,
          signal: request.signal,
          enableThinking: request.enableThinking,
        }
      )) {
        const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning_content
        if (reasoningDelta) {
          yield { type: 'reasoning-delta', delta: reasoningDelta }
        }

        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (delta) yield* yieldProgressiveTextDeltas(delta)
        if (chunk.choices?.[0]?.delta?.tool_calls?.length) {
          yield { type: 'tool-call-delta', delta: chunk.choices[0].delta.tool_calls }
        }
        if (chunk.usage)
          yield { type: 'usage', usage: normalizeUsage(chunk.usage), rawUsage: chunk.usage }
        if (chunk.choices?.[0]?.finish_reason) {
          yield { type: 'finish', finishReason: chunk.choices[0].finish_reason }
        }
      }
      return
    }
    case 'deepseek': {
      const apiKey = getProviderCredential(settings, 'deepseek')
      // Note: DeepSeek thinking mode silently ignores temperature/top_p/penalties,
      // so passing temperature here is harmless when reasoning is enabled.
      if (request.streamResponses === false) {
        const response = await generateDeepSeekCompletion(
          apiKey,
          normalizedModel,
          request.messages,
          {
            temperature: request.temperature,
            max_tokens: request.maxTokens,
            tools: request.tools || undefined,
            toolChoice: request.toolChoice,
            signal: request.signal,
            enableThinking: request.enableThinking,
            reasoningEffort: request.reasoningEffort,
          }
        )
        yield* emitOpenAiCompatibleResponse(response, {
          includeReasoning: true,
          reasoningContentField: 'reasoning_content',
        })
        return
      }

      for await (const chunk of streamDeepSeekCompletion(
        apiKey,
        normalizedModel,
        request.messages,
        {
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          tools: request.tools || undefined,
          toolChoice: request.toolChoice,
          signal: request.signal,
          enableThinking: request.enableThinking,
          reasoningEffort: request.reasoningEffort,
        }
      )) {
        const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning_content
        if (reasoningDelta) {
          yield { type: 'reasoning-delta', delta: reasoningDelta }
        }

        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (delta) yield* yieldProgressiveTextDeltas(delta)
        if (chunk.choices?.[0]?.delta?.tool_calls?.length) {
          yield { type: 'tool-call-delta', delta: chunk.choices[0].delta.tool_calls }
        }
        if (chunk.usage)
          yield { type: 'usage', usage: normalizeUsage(chunk.usage), rawUsage: chunk.usage }
        if (chunk.choices?.[0]?.finish_reason) {
          yield { type: 'finish', finishReason: chunk.choices[0].finish_reason }
        }
      }
      return
    }
    case 'fireworks': {
      const apiKey = getProviderCredential(settings, 'fireworks')
      if (request.streamResponses === false) {
        const response = await generateFireworksCompletion(
          apiKey,
          normalizedModel,
          request.messages,
          {
            temperature: request.temperature,
            max_tokens: request.maxTokens,
            tools: request.tools || undefined,
            toolChoice: request.toolChoice,
            signal: request.signal,
          }
        )
        yield* emitOpenAiCompatibleResponse(response)
        return
      }

      const cacheRequest = shapePromptCacheRequest({
        provider: request.provider,
        model: normalizedModel,
        messages: request.messages,
        sessionId: request.sessionId,
      })

      for await (const chunk of streamFireworksCompletion(
        apiKey,
        normalizedModel,
        cacheRequest.messages,
        {
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          tools: request.tools || undefined,
          toolChoice: request.toolChoice,
          extraHeaders: cacheRequest.headers,
          signal: request.signal,
        }
      )) {
        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (delta) yield* yieldProgressiveTextDeltas(delta)
        if (chunk.choices?.[0]?.delta?.tool_calls?.length) {
          yield { type: 'tool-call-delta', delta: chunk.choices[0].delta.tool_calls }
        }
        if (chunk.usage)
          yield { type: 'usage', usage: normalizeUsage(chunk.usage), rawUsage: chunk.usage }
        if (chunk.choices?.[0]?.finish_reason) {
          yield { type: 'finish', finishReason: chunk.choices[0].finish_reason }
        }
      }
      return
    }
    case 'ollama': {
      const baseUrl = getProviderCredential(settings, 'ollama')

      if (request.streamResponses === false) {
        const response = await generateOllamaCompletion(
          baseUrl,
          normalizedModel,
          request.messages,
          {
            temperature: request.temperature,
            think: true,
            tools: request.tools || undefined,
            signal: request.signal,
          }
        )
        yield* emitOllamaResponse(response)
        return
      }

      try {
        for await (const chunk of streamOllamaCompletion(
          baseUrl,
          normalizedModel,
          request.messages,
          {
            temperature: request.temperature,
            think: true,
            tools: request.tools || undefined,
            signal: request.signal,
          }
        )) {
          const thinkingDelta = chunk.message?.thinking || ''
          if (thinkingDelta) yield { type: 'reasoning-delta', delta: thinkingDelta }

          const delta = chunk.message?.content || ''
          if (delta) yield* yieldProgressiveTextDeltas(delta)

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
              rawUsage: {
                prompt_eval_count: chunk.prompt_eval_count,
                eval_count: chunk.eval_count,
              },
            }
            yield { type: 'finish', finishReason: 'stop' }
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') throw error

        const response = await generateOllamaCompletion(
          baseUrl,
          normalizedModel,
          request.messages,
          {
            temperature: request.temperature,
            think: true,
            tools: request.tools || undefined,
            signal: request.signal,
          }
        )
        yield* emitOllamaResponse(response)
      }
      return
    }
  }
}

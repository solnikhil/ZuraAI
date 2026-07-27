import type { FileAttachment } from '../../chat/types'
import type { ReasoningDetail } from '../../services/types'
import { getProviderDefinition, DEFAULT_OLLAMA_URL } from '../providerRegistry'
import { getProviderSettingsDefinition } from '../providerSettingsRegistry'
import type { ActiveProviderId } from '../providerTypes'
import {
  emptyUsage,
  type NormalizedStreamEvent,
  type NormalizedToolCallDelta,
  type NormalizedUsage,
} from '../providerRuntimeTypes'
import { getOpenRouterApiKey } from '../../utils/openRouterKey'
import type { TitleGenerationSettings } from './types'
import type { ProviderRuntimeSettings } from '../providerRuntimeTypes'

export type OpenAiCompatibleResponse = {
  choices?: Array<{
    message?: Record<string, unknown> & {
      content?: string
      images?: Array<{ image_url?: { url?: string } }>
    }
    finish_reason?: string | null
  }>
  usage?: Record<string, unknown>
  citations?: string[]
}

export function extractTitleTextFromMessage(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const content = (message as Record<string, unknown>).content
  if (typeof content === 'string' && content.trim()) return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const text = (part as Record<string, unknown>).text
      return typeof text === 'string' ? text : ''
    })
    .join('')
    .trim()
}

export function normalizeProviderModel(provider: ActiveProviderId, model: string): string {
  if (provider === 'openrouter' && model.startsWith('openrouter/')) return model.slice(11)
  if (provider === 'opencode' && model.startsWith('opencode-go/')) return model.slice(12)
  return model
}

export function getProviderCredential(
  settings: TitleGenerationSettings | ProviderRuntimeSettings,
  provider: ActiveProviderId
): string {
  if (provider === 'codex')
    throw new Error('ChatGPT Codex is available only through the Electron main-process runtime.')
  if (provider === 'ollama') return settings.ollamaUrl?.trim() || DEFAULT_OLLAMA_URL
  if (provider === 'openrouter') {
    const apiKey = getOpenRouterApiKey(settings.openRouterApiKey)
    if (!apiKey) throw new Error('OpenRouter API Key is missing')
    return apiKey
  }
  const field = getProviderSettingsDefinition(provider)?.secretKeyField
  const value = field ? (settings as Record<string, unknown>)[field] : undefined
  const apiKey = typeof value === 'string' ? value.trim() : ''
  if (!apiKey) throw new Error(`${getProviderDefinition(provider).label} API Key is missing`)
  return apiKey
}

export function normalizeToolCalls(
  toolCalls:
    | Array<{
        id?: string
        type?: 'function'
        function?: { name?: string; arguments?: string | Record<string, unknown> }
      }>
    | undefined
): NormalizedToolCallDelta[] {
  return (toolCalls || []).map((call, index) => ({
    index,
    id: call.id,
    type: 'function',
    function: {
      name: call.function?.name,
      arguments:
        typeof call.function?.arguments === 'string'
          ? call.function.arguments
          : call.function?.arguments
            ? JSON.stringify(call.function.arguments)
            : undefined,
    },
  }))
}

export function normalizeReasoningDetails(
  details: ReasoningDetail[] | undefined
): ReasoningDetail[] {
  return Array.isArray(details)
    ? details.filter((detail) => detail && typeof detail === 'object')
    : []
}

export function normalizeUsage(usage: Record<string, unknown> | undefined): NormalizedUsage {
  if (!usage) return emptyUsage()
  const details = usage.prompt_tokens_details as { cached_tokens?: number } | undefined
  const completionDetails = usage.completion_tokens_details as
    | { reasoning_tokens?: number; image_tokens?: number; audio_tokens?: number }
    | undefined
  const number = (key: string) =>
    typeof usage[key] === 'number' ? (usage[key] as number) : undefined
  const inputTokens = number('prompt_tokens') ?? number('input_tokens') ?? 0
  const outputTokens = number('completion_tokens') ?? number('output_tokens') ?? 0
  return {
    inputTokens,
    outputTokens,
    totalTokens: number('total_tokens') ?? inputTokens + outputTokens,
    thinkingTokens: completionDetails?.reasoning_tokens ?? number('reasoning_tokens'),
    cachedInputTokens:
      number('prompt_cache_tokens') ?? number('prompt_cache_hit_tokens') ?? details?.cached_tokens,
    cachedOutputTokens: number('completion_cache_tokens'),
    cacheMissInputTokens: number('prompt_cache_miss_tokens'),
    cacheWriteInputTokens:
      number('cache_write_input_tokens') ?? number('cache_creation_input_tokens'),
    cost: number('cost'),
    imageTokens: completionDetails?.image_tokens,
    audioTokens: completionDetails?.audio_tokens,
  }
}

export function mapDataUrlImagesToFiles(
  images: Array<{ image_url?: { url?: string } }> | undefined,
  prefix: string
): FileAttachment[] {
  return (images || []).flatMap((image, index) => {
    const data = image.image_url?.url?.trim() || ''
    if (!data.startsWith('data:image/')) return []
    const mimeType = data.match(/^data:([^;,]+)[;,]/i)?.[1] || 'image/png'
    return [
      {
        id: `${prefix}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        name: `generated-image-${index + 1}.${mimeType.split('/')[1] || 'png'}`,
        type: 'image' as const,
        size: data.length,
        data,
        mimeType,
      },
    ]
  })
}

export async function* emitOpenAiCompatibleResponse(
  response: OpenAiCompatibleResponse,
  options?: { responsePrefix?: string; reasoningContentField?: string }
): AsyncGenerator<NormalizedStreamEvent, void, unknown> {
  const choice = response.choices?.[0]
  const message = choice?.message
  const reasoningField = options?.reasoningContentField
  if (reasoningField) {
    const reasoning = message?.[reasoningField] ?? message?.reasoning
    if (typeof reasoning === 'string' && reasoning)
      yield { type: 'reasoning-delta', delta: reasoning }
  }
  if (typeof message?.content === 'string' && message.content)
    yield { type: 'text-delta', delta: message.content }
  const calls = normalizeToolCalls(message?.tool_calls as Parameters<typeof normalizeToolCalls>[0])
  if (calls.length) yield { type: 'tool-call-delta', delta: calls }
  const files = mapDataUrlImagesToFiles(message?.images, options?.responsePrefix || 'response')
  if (files.length) yield { type: 'file-delta', files }
  if (response.usage)
    yield { type: 'usage', usage: normalizeUsage(response.usage), rawUsage: response.usage }
  if (response.citations?.length) yield { type: 'citation', citations: response.citations }
  yield { type: 'finish', finishReason: choice?.finish_reason ?? undefined }
}

export function commonRequestOptions(
  request: import('../providerRuntimeTypes').ProviderRuntimeStreamRequest
) {
  return {
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    tools: request.tools || undefined,
    toolChoice: request.toolChoice,
    signal: request.signal,
  }
}

export async function* emitStandardChunk(chunk: {
  choices?: Array<{
    delta?: { content?: string; tool_calls?: NormalizedToolCallDelta[] }
    finish_reason?: string | null
  }>
  usage?: Record<string, unknown>
}): AsyncGenerator<NormalizedStreamEvent, void, unknown> {
  const choice = chunk.choices?.[0]
  if (choice?.delta?.content) yield { type: 'text-delta', delta: choice.delta.content }
  if (choice?.delta?.tool_calls?.length)
    yield { type: 'tool-call-delta', delta: choice.delta.tool_calls }
  if (chunk.usage)
    yield { type: 'usage', usage: normalizeUsage(chunk.usage), rawUsage: chunk.usage }
  if (choice?.finish_reason) yield { type: 'finish', finishReason: choice.finish_reason }
}

import {
  generateAlibabaCompletion,
  streamAlibabaCompletion,
  type AlibabaResponse,
} from '../../../../../services/alibaba'
import {
  generateFireworksCompletion,
  streamFireworksCompletion,
  type FireworksResponse,
} from '../../../../../services/fireworks'
import { generateGroqCompletion, streamGroqCompletion, type GroqResponse } from '../../../../../services/groq'
import { generateOllamaCompletion, streamOllamaCompletion, type OllamaResponse } from '../../../../../services/ollama'
import {
  generateOpenRouterCompletion,
  streamOpenRouterCompletion,
  type OpenRouterResponse,
} from '../../../../../services/openrouter'
import {
  generatePerplexityCompletion,
  streamPerplexityCompletion,
  type PerplexityResponse,
} from '../../../../../services/perplexity'
import { DEFAULT_OLLAMA_URL, type ActiveProviderId } from '../../../../../providers'
import { getOpenRouterApiKey } from '../../../../../utils/openRouterKey'
import type {
  FileAttachment,
  NormalizedStreamEvent,
  NormalizedToolCallDelta,
  NormalizedUsage,
  ProviderStreamClient,
  StreamRequest,
  StreamingSettings,
} from './types'

const emptyUsage = (): NormalizedUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
})

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

async function* emitOpenAiCompatibleResponse(
  response:
    | OpenRouterResponse
    | GroqResponse
    | AlibabaResponse
    | PerplexityResponse
    | FireworksResponse,
  options?: { responsePrefix?: string; includeReasoning?: boolean }
): AsyncGenerator<NormalizedStreamEvent, void, unknown> {
  const choice = response.choices?.[0]
  const message = choice?.message
  const content = message?.content || ''
  if (content) {
    yield { type: 'text-delta', delta: content }
  }

  if (options?.includeReasoning) {
    const reasoning = (message as OpenRouterResponse['choices'][0]['message'] & { reasoning?: string })
      ?.reasoning
    if (reasoning) {
      yield { type: 'reasoning-delta', delta: reasoning }
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

async function* emitOllamaResponse(response: OllamaResponse): AsyncGenerator<NormalizedStreamEvent, void, unknown> {
  if (response.message?.thinking) {
    yield { type: 'reasoning-delta', delta: response.message.thinking }
  }

  if (response.message?.content) {
    yield { type: 'text-delta', delta: response.message.content }
  }

  if ((response.message as { tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> })?.tool_calls?.length) {
    yield {
      type: 'tool-call-delta',
      delta: normalizeToolCalls(
        (response.message as {
          tool_calls?: Array<{
            id?: string
            function?: { name?: string; arguments?: string }
          }>
        }).tool_calls
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

export function createProviderStreamClient(
  settings: StreamingSettings,
  provider: ActiveProviderId
): ProviderStreamClient {
  switch (provider) {
    case 'openrouter':
      return {
        async *stream(request: StreamRequest) {
          const apiKey = getOpenRouterApiKey(settings.openRouterApiKey)
          if (!apiKey) throw new Error('OpenRouter API Key is missing')

          if (request.streamResponses === false) {
            const response = await generateOpenRouterCompletion(apiKey, request.model, request.messages, {
              temperature: request.temperature,
              max_tokens: request.maxTokens,
              signal: request.signal,
            })
            yield* emitOpenAiCompatibleResponse(response, {
              responsePrefix: request.model,
              includeReasoning: true,
            })
            return
          }

          for await (const chunk of streamOpenRouterCompletion(apiKey, request.model, request.messages, {
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            tools: request.tools || undefined,
            toolChoice: request.toolChoice,
            modalities: request.modalities,
            signal: request.signal,
          })) {
            const delta = chunk.choices?.[0]?.delta?.content || ''
            if (delta) {
              yield { type: 'text-delta', delta }
            }

            const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning || ''
            if (reasoningDelta) {
              yield { type: 'reasoning-delta', delta: reasoningDelta }
            }

            const reasoningDetails = chunk.choices?.[0]?.delta?.reasoning_details
            if (reasoningDetails?.length) {
              for (const detail of reasoningDetails) {
                if (detail.type === 'text' && typeof detail.content === 'string') {
                  yield { type: 'reasoning-delta', delta: detail.content }
                }
              }
            }

            const toolCalls = chunk.choices?.[0]?.delta?.tool_calls
            if (toolCalls?.length) {
              yield { type: 'tool-call-delta', delta: toolCalls }
            }

            const files = mapDataUrlImagesToFiles(chunk.choices?.[0]?.delta?.images, request.model)
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
        },
      }
    case 'groq':
      return {
        async *stream(request: StreamRequest) {
          const apiKey = settings.groqApiKey || ''
          if (request.streamResponses === false) {
            const response = await generateGroqCompletion(apiKey, request.model, request.messages, {
              temperature: request.temperature,
              max_tokens: request.maxTokens,
              tools: request.tools || undefined,
              toolChoice: request.toolChoice,
              signal: request.signal,
            })
            yield* emitOpenAiCompatibleResponse(response)
            return
          }

          for await (const chunk of streamGroqCompletion(apiKey, request.model, request.messages, {
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
        },
      }
    case 'alibaba':
      return {
        async *stream(request: StreamRequest) {
          const apiKey = settings.alibabaApiKey || ''
          if (request.streamResponses === false) {
            const response = await generateAlibabaCompletion(apiKey, request.model, request.messages, {
              temperature: request.temperature,
              max_tokens: request.maxTokens,
              tools: request.tools || undefined,
              toolChoice: request.toolChoice,
              signal: request.signal,
            })
            yield* emitOpenAiCompatibleResponse(response)
            return
          }

          for await (const chunk of streamAlibabaCompletion(apiKey, request.model, request.messages, {
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
        },
      }
    case 'fireworks':
      return {
        async *stream(request: StreamRequest) {
          const apiKey = settings.fireworksApiKey || ''
          if (request.streamResponses === false) {
            const response = await generateFireworksCompletion(apiKey, request.model, request.messages, {
              temperature: request.temperature,
              max_tokens: request.maxTokens,
              tools: request.tools || undefined,
              toolChoice: request.toolChoice,
              signal: request.signal,
            })
            yield* emitOpenAiCompatibleResponse(response)
            return
          }

          for await (const chunk of streamFireworksCompletion(apiKey, request.model, request.messages, {
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
        },
      }
    case 'ollama':
      return {
        async *stream(request: StreamRequest) {
          const baseUrl = settings.ollamaUrl?.trim() || DEFAULT_OLLAMA_URL

          if (request.streamResponses === false) {
            const response = await generateOllamaCompletion(baseUrl, request.model, request.messages, {
              temperature: request.temperature,
              think: true,
              tools: request.tools || undefined,
              signal: request.signal,
            })
            yield* emitOllamaResponse(response)
            return
          }

          try {
            for await (const chunk of streamOllamaCompletion(baseUrl, request.model, request.messages, {
              temperature: request.temperature,
              think: true,
              tools: request.tools || undefined,
              signal: request.signal,
            })) {
              const thinkingDelta = chunk.message?.thinking || ''
              if (thinkingDelta) yield { type: 'reasoning-delta', delta: thinkingDelta }

              const delta = chunk.message?.content || ''
              if (delta) yield { type: 'text-delta', delta }

              const toolCalls = (chunk.message as {
                tool_calls?: Array<{
                  id?: string
                  function?: { name?: string; arguments?: string }
                }>
              })?.tool_calls
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

            const response = await generateOllamaCompletion(baseUrl, request.model, request.messages, {
              temperature: request.temperature,
              think: true,
              tools: request.tools || undefined,
              signal: request.signal,
            })
            yield* emitOllamaResponse(response)
          }
        },
      }
    case 'perplexity':
      return {
        async *stream(request: StreamRequest) {
          const apiKey = settings.perplexityApiKey || ''
          if (request.streamResponses === false) {
            const response = await generatePerplexityCompletion(
              apiKey,
              request.model,
              request.messages,
              {
                temperature: request.temperature,
                max_tokens: request.maxTokens,
                signal: request.signal,
              }
            )
            yield* emitOpenAiCompatibleResponse(response)
            return
          }

          for await (const chunk of streamPerplexityCompletion(apiKey, request.model, request.messages, {
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
        },
      }
  }
}

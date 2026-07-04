import type { ChatMessage, MessageContent } from '../services/types'
import { getProviderPromptCachingPolicy } from './providerRegistry'
import type { ActiveProviderId } from './providerTypes'

export interface PromptCacheRequestShape {
  messages: ChatMessage[]
  headers?: Record<string, string>
  body?: Record<string, unknown>
}

export interface ShapePromptCacheRequestOptions {
  provider: ActiveProviderId
  model: string
  messages: ChatMessage[]
  sessionId?: string
}

const EXPLICIT_OPENROUTER_MODEL_PATTERNS = [
  /(^|\/)anthropic\//i,
  /(^|\/)claude/i,
  /(^|\/)google\//i,
  /(^|\/)gemini/i,
  /(^|\/)qwen/i,
  /(^|\/)alibaba/i,
]

function cloneContent(content: ChatMessage['content']): ChatMessage['content'] {
  if (typeof content === 'string') return content
  return content.map((part) => ({
    ...part,
    image_url: part.image_url ? { ...part.image_url } : undefined,
  }))
}

function cloneMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    content: cloneContent(message.content),
  }))
}

function supportsExplicitCacheControl(provider: ActiveProviderId, model: string): boolean {
  if (provider === 'alibaba') return true
  if (provider !== 'openrouter') return false
  return EXPLICIT_OPENROUTER_MODEL_PATTERNS.some((pattern) => pattern.test(model))
}

function getStableCacheableMessageIndex(messages: ChatMessage[]): number {
  return messages.findIndex(
    (message) =>
      message.role === 'system' &&
      typeof message.content === 'string' &&
      message.content.trim().length > 0
  )
}

function withEphemeralCacheControl(content: ChatMessage['content']): ChatMessage['content'] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content, cache_control: { type: 'ephemeral' } }]
  }

  let markedTextBlock = false
  const nextContent = content.map((part): MessageContent => {
    if (
      !markedTextBlock &&
      part.type === 'text' &&
      typeof part.text === 'string' &&
      part.text.trim()
    ) {
      markedTextBlock = true
      return {
        ...part,
        cache_control: { type: 'ephemeral' },
      }
    }
    return { ...part }
  })

  return nextContent
}

function buildFireworksSessionHeaders(
  sessionId: string | undefined
): Record<string, string> | undefined {
  const trimmed = sessionId?.trim()
  if (!trimmed) return undefined
  return {
    'x-session-affinity': trimmed,
  }
}

export function shapePromptCacheRequest({
  provider,
  model,
  messages,
  sessionId,
}: ShapePromptCacheRequestOptions): PromptCacheRequestShape {
  const policy = getProviderPromptCachingPolicy(provider)
  const shapedMessages = cloneMessages(messages)
  const headers =
    provider === 'fireworks' && policy.sessionAffinity === 'header'
      ? buildFireworksSessionHeaders(sessionId)
      : undefined

  if (
    policy.promptCaching !== 'explicit' ||
    policy.cacheControl !== 'message-content-block' ||
    !supportsExplicitCacheControl(provider, model)
  ) {
    return {
      messages: shapedMessages,
      ...(headers ? { headers } : {}),
    }
  }

  const stableMessageIndex = getStableCacheableMessageIndex(shapedMessages)
  if (stableMessageIndex < 0) {
    return {
      messages: shapedMessages,
      ...(headers ? { headers } : {}),
    }
  }

  const message = shapedMessages[stableMessageIndex]
  shapedMessages[stableMessageIndex] = {
    ...message,
    content: withEphemeralCacheControl(message.content),
  }

  return {
    messages: shapedMessages,
    ...(headers ? { headers } : {}),
  }
}

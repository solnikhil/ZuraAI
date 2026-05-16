import { describe, expect, it } from 'vitest'

import { shapePromptCacheRequest } from './promptCaching'
import type { ChatMessage } from '../services/types'

describe('shapePromptCacheRequest', () => {
  it('adds explicit cache control only to the stable OpenRouter prefix', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'Base system prompt' },
      { role: 'system', content: 'Dynamic research context' },
      { role: 'user', content: 'Latest question' },
    ]

    const shaped = shapePromptCacheRequest({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4.5',
      messages,
      sessionId: 'session-1',
    })

    expect(shaped.messages[0]?.content).toEqual([
      { type: 'text', text: 'Base system prompt', cache_control: { type: 'ephemeral' } },
    ])
    expect(shaped.messages[1]?.content).toBe('Dynamic research context')
    expect(shaped.messages[2]?.content).toBe('Latest question')
    expect(messages[0]?.content).toBe('Base system prompt')
  })

  it('adds explicit cache control to Alibaba direct requests', () => {
    const shaped = shapePromptCacheRequest({
      provider: 'alibaba',
      model: 'qwen3-max',
      messages: [
        { role: 'system', content: 'Base system prompt' },
        { role: 'user', content: 'Latest question' },
      ],
    })

    expect(shaped.messages[0]?.content).toEqual([
      { type: 'text', text: 'Base system prompt', cache_control: { type: 'ephemeral' } },
    ])
    expect(shaped.messages[1]?.content).toBe('Latest question')
  })

  it('leaves unsupported providers unchanged while cloning inputs', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'Base system prompt' },
      { role: 'user', content: 'Latest question' },
    ]

    const shaped = shapePromptCacheRequest({
      provider: 'perplexity',
      model: 'sonar-pro',
      messages,
    })

    expect(shaped.messages).toEqual(messages)
    expect(shaped.messages).not.toBe(messages)
  })

  it('adds Fireworks session affinity headers without mutating messages', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }]
    const shaped = shapePromptCacheRequest({
      provider: 'fireworks',
      model: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
      messages,
      sessionId: 'session-123',
    })

    expect(shaped.headers).toEqual({ 'x-session-affinity': 'session-123' })
    expect(shaped.messages).toEqual(messages)
    expect(shaped.messages).not.toBe(messages)
  })
})

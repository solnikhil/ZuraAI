import { describe, expect, it } from 'vitest'
import { buildCommittedStreamingUpdates } from './useStreamingChat'

describe('useStreamingChat final commit helpers', () => {
  it('prefers the final provider stream result over stale isolated streaming content', () => {
    const committed = buildCommittedStreamingUpdates(
      {
        sessionId: 'session-1',
        messageId: 'message-1',
        content: 'Hello wor',
        model: 'openrouter/openai/gpt-4.1',
        usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
        isStreaming: true,
      },
      {
        content: 'Hello world',
        model: 'openrouter/openai/gpt-4.1',
        usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
        latency: 250,
      }
    )

    expect(committed).toEqual(
      expect.objectContaining({
        content: 'Hello world',
        usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
        latency: 250,
      })
    )
  })
})

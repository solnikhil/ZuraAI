import { describe, expect, it, vi } from 'vitest'

vi.mock('../attachmentUtils', () => ({
  buildProviderMessages: vi.fn(),
  canAnalyzeImageAttachments: vi.fn(),
  isImageAttachment: vi.fn(() => false),
}))

import { buildCommittedStreamingUpdates, normalizeGeneratedSessionTitle } from './useStreamingChat'

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

describe('useStreamingChat generated title helpers', () => {
  it('does not produce a title update for failed title generation', () => {
    expect(normalizeGeneratedSessionTitle(null)).toBeNull()
    expect(normalizeGeneratedSessionTitle(undefined)).toBeNull()
    expect(normalizeGeneratedSessionTitle('   ')).toBeNull()
  })

  it('trims valid generated titles before applying them', () => {
    expect(normalizeGeneratedSessionTitle('  React hydration fix  ')).toBe('React hydration fix')
  })
})

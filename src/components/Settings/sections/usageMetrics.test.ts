import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ChatSession } from '../../../chat/types'
import { computeUsageStats, mergeUsageSessionSnapshots } from './usageMetrics'

function createBaseSession(messages: ChatSession['messages']): ChatSession {
  return {
    id: 'session-1',
    title: 'Session',
    messages,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

describe('usageMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-03T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('computes provider mix, spend estimate, and quality signals', () => {
    const now = Date.now()
    const sessions: ChatSession[] = [
      createBaseSession([
        {
          id: 'u1',
          role: 'user',
          content: 'hello',
          timestamp: now - 3_600_000,
          tokenCount: 25,
        },
        {
          id: 'a1',
          role: 'assistant',
          content: 'first response',
          timestamp: now - 3_500_000,
          model: 'llama-3.3-70b-versatile',
          latency: 1000,
          usage: {
            inputTokens: 120,
            outputTokens: 80,
            totalTokens: 200,
            cachedInputTokens: 40,
            cachedOutputTokens: 5,
            cacheWriteInputTokens: 8,
          },
          toolResults: [
            {
              toolCall: { id: 't1', name: 'web_search', arguments: { query: 'zura ai' } },
              result: { success: true, executionTime: 520 },
            },
          ],
        },
        {
          id: 'a2',
          role: 'assistant',
          content: 'Rate limit exceeded. Please slow down and try again in a moment.',
          timestamp: now - 3_200_000,
          model: 'llama-3.3-70b-versatile',
          latency: 900,
          usage: {
            inputTokens: 60,
            outputTokens: 40,
            totalTokens: 100,
            cachedInputTokens: 10,
          },
          responseVersions: [
            { id: 'v1', content: 'old', timestamp: now - 3_100_000 },
            { id: 'v2', content: 'older', timestamp: now - 3_000_000 },
          ],
          toolResults: [
            {
              toolCall: { id: 't2', name: 'web_search', arguments: { query: 'rate limits' } },
              result: { success: false, executionTime: 800, error: '429' },
            },
          ],
        },
        {
          id: 'a3',
          role: 'assistant',
          content: 'older response',
          timestamp: now - (9 * 24 * 60 * 60 * 1000),
          model: 'qwen3-max',
          latency: 1200,
          usage: { inputTokens: 70, outputTokens: 80, totalTokens: 150 },
        },
      ]),
    ]

    const stats = computeUsageStats(sessions, {
      groqModels: ['llama-3.3-70b-versatile'],
      alibabaModels: ['qwen3-max'],
    })

    expect(stats.totalTokens).toBe(475)
    expect(stats.cachedInputTokens).toBe(50)
    expect(stats.cachedOutputTokens).toBe(5)
    expect(stats.cacheWriteInputTokens).toBe(8)
    expect(stats.cachedTotalTokens).toBe(55)
    expect(stats.tokensLast7Days).toBe(325)
    expect(stats.tokensLast30Days).toBe(475)

    expect(stats.totalToolCalls).toBe(2)
    expect(stats.totalRegenerations).toBe(2)
    expect(stats.assistantMessagesWithErrors).toBe(1)
    expect(stats.assistantErrorRate).toBe(33)
    expect(stats.errorBreakdown.rateLimit).toBe(1)
    expect(stats.errorBreakdown.tool).toBe(1)

    expect(stats.totalWebSearches).toBe(2)
    expect(stats.successfulWebSearches).toBe(1)
    expect(stats.failedWebSearches).toBe(1)

    const groqEntry = stats.providerEntries.find((entry) => entry.provider === 'groq')
    expect(groqEntry?.tokens).toBe(300)
    expect(groqEntry?.messages).toBe(2)
    expect(groqEntry?.errors).toBe(1)
    expect(groqEntry?.cachedInputTokens).toBe(50)
    expect(groqEntry?.cachedOutputTokens).toBe(5)
    expect(groqEntry?.cacheWriteInputTokens).toBe(8)
    expect(groqEntry?.cachedTotalTokens).toBe(55)

    const alibabaEntry = stats.providerEntries.find((entry) => entry.provider === 'alibaba')
    expect(alibabaEntry?.tokens).toBe(150)
    expect(alibabaEntry?.cachedTotalTokens).toBe(0)
    expect(stats.estimatedSpendUsd).toBeGreaterThan(0)
    expect(stats.spendCoveragePercent).toBe(100)
  })

  it('tracks unknown provider usage when model mapping is unavailable', () => {
    const now = Date.now()
    const sessions: ChatSession[] = [
      createBaseSession([
        {
          id: 'a1',
          role: 'assistant',
          content: 'response',
          timestamp: now - 5000,
          model: 'mystery-model',
          usage: { inputTokens: 50, outputTokens: 50, totalTokens: 100 },
        },
      ]),
    ]

    const stats = computeUsageStats(sessions)
    const unknownEntry = stats.providerEntries.find((entry) => entry.provider === 'unknown')

    expect(unknownEntry?.tokens).toBe(100)
    expect(unknownEntry?.cachedTotalTokens).toBe(0)
    expect(stats.cachedTotalTokens).toBe(0)
    expect(stats.estimatedSpendUsd).toBe(0)
    expect(stats.spendCoveragePercent).toBe(0)
  })

  it('uses stored full messages when current sessions are metadata-only', () => {
    const now = Date.now()
    const stored = createBaseSession([
      {
        id: 'a1',
        role: 'assistant',
        content: 'stored response',
        timestamp: now,
        model: 'qwen3-max',
        usage: { inputTokens: 20, outputTokens: 30, totalTokens: 50 },
      },
    ])
    stored.messageCount = 1

    const currentMetadataOnly: ChatSession = {
      ...stored,
      title: 'Renamed in memory',
      messages: [],
      messageCount: 1,
    }

    const merged = mergeUsageSessionSnapshots([stored], [currentMetadataOnly])
    const stats = computeUsageStats(merged, { alibabaModels: ['qwen3-max'] })

    expect(merged[0].title).toBe('Renamed in memory')
    expect(merged[0].messages).toHaveLength(1)
    expect(stats.totalTokens).toBe(50)
    expect(stats.providerEntries[0]?.provider).toBe('alibaba')
  })

  it('prefers loaded current messages over the stored usage snapshot', () => {
    const now = Date.now()
    const stored = createBaseSession([
      {
        id: 'a1',
        role: 'assistant',
        content: 'stored response',
        timestamp: now,
        model: 'qwen3-max',
        usage: { inputTokens: 20, outputTokens: 30, totalTokens: 50 },
      },
    ])

    const currentLoaded: ChatSession = {
      ...stored,
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          content: 'fresh response',
          timestamp: now,
          model: 'qwen3-max',
          usage: { inputTokens: 40, outputTokens: 60, totalTokens: 100 },
        },
      ],
      messageCount: 1,
    }

    const merged = mergeUsageSessionSnapshots([stored], [currentLoaded])
    const stats = computeUsageStats(merged, { alibabaModels: ['qwen3-max'] })

    expect(stats.totalTokens).toBe(100)
  })
})

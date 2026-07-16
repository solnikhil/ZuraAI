import { describe, expect, it, vi } from 'vitest'

import { finalizeProviderStream } from './providerStreamFinalization'

describe('finalizeProviderStream', () => {
  it('preserves aggregate usage and produces identical persisted/result payloads', () => {
    vi.spyOn(performance, 'now').mockReturnValue(2_000)
    const finalized = finalizeProviderStream({
      provider: 'groq',
      model: 'model',
      startTime: 1_000,
      finalVisibleAnswerRound: {
        content: 'answer',
        usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
        firstTokenTime: 1_200,
      },
      totalUsage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        requestCount: 3,
        cachedInputTokens: 2,
      },
      accumulatedContent: 'answer',
      preserveToolSplitMarkers: false,
      finishReason: 'stop',
      savedToolResults: undefined,
      generatedFiles: [],
      thinkingBlocks: [],
    })

    expect(finalized.updates.usage).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      requestCount: 3,
      cachedInputTokens: 2,
      ttft: 200,
    })
    expect(finalized.result).toMatchObject({
      content: finalized.updates.content,
      model: finalized.updates.model,
      usage: finalized.updates.usage,
      latency: finalized.updates.latency,
      finishReason: 'stop',
    })
  })
})

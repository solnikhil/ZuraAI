import { describe, expect, it } from 'vitest'
import { mergeProviderUsage } from './usage'

describe('mergeProviderUsage', () => {
  it('retains all token, request, estimate, and cost fields across rounds', () => {
    expect(
      mergeProviderUsage(
        { inputTokens: 10, outputTokens: 4, totalTokens: 14, cost: 0.01, requestCount: 1 },
        {
          inputTokens: 20,
          outputTokens: 8,
          totalTokens: 28,
          cost: 0.02,
          requestCount: 1,
          thinkingTokens: 3,
          imageTokens: 2,
          estimated: true,
        }
      )
    ).toEqual({
      inputTokens: 30,
      outputTokens: 12,
      totalTokens: 42,
      thinkingTokens: 3,
      cachedInputTokens: undefined,
      cachedOutputTokens: undefined,
      cacheMissInputTokens: undefined,
      cacheWriteInputTokens: undefined,
      cost: 0.03,
      imageTokens: 2,
      audioTokens: undefined,
      requestCount: 2,
      estimated: true,
    })
  })
})

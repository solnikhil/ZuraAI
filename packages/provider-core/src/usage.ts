import type { ProviderUsage } from './types'

export function emptyProviderUsage(): ProviderUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 }
}

function addOptional(left?: number, right?: number): number | undefined {
  const value = (left ?? 0) + (right ?? 0)
  return value === 0 && left === undefined && right === undefined ? undefined : value
}

export function mergeProviderUsage(left: ProviderUsage, right: ProviderUsage): ProviderUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    thinkingTokens: addOptional(left.thinkingTokens, right.thinkingTokens),
    cachedInputTokens: addOptional(left.cachedInputTokens, right.cachedInputTokens),
    cachedOutputTokens: addOptional(left.cachedOutputTokens, right.cachedOutputTokens),
    cacheMissInputTokens: addOptional(left.cacheMissInputTokens, right.cacheMissInputTokens),
    cacheWriteInputTokens: addOptional(left.cacheWriteInputTokens, right.cacheWriteInputTokens),
    cost: addOptional(left.cost, right.cost),
    imageTokens: addOptional(left.imageTokens, right.imageTokens),
    audioTokens: addOptional(left.audioTokens, right.audioTokens),
    requestCount: addOptional(left.requestCount, right.requestCount),
    estimated: left.estimated === true || right.estimated === true || undefined,
  }
}

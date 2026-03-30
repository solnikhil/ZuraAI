import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  coerceSearchDepthPreference,
  getStoredSearchDepthPreference,
  resolveAutoSearchDepth,
  resolveWebSearchArgsForExecution,
} from './webSearchPreferences'

describe('webSearchPreferences', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('coerces invalid preferences to auto', () => {
    expect(coerceSearchDepthPreference('invalid')).toBe('auto')
    expect(coerceSearchDepthPreference('fast')).toBe('fast')
  })

  it('reads stored search depth preference from localStorage', () => {
    localStorage.setItem('zura-settings', JSON.stringify({ tavilySearchDepthPreference: 'advanced' }))
    expect(getStoredSearchDepthPreference()).toBe('advanced')
  })

  it('uses ultra-fast for latency-sensitive auto queries', () => {
    expect(resolveAutoSearchDepth({ query: 'latest bitcoin price today', topic: 'finance' })).toBe(
      'ultra-fast'
    )
  })

  it('uses advanced for deeper auto research queries', () => {
    expect(
      resolveAutoSearchDepth({
        query: 'compare qwen3 max versus grok 4.1 performance benchmarks and tradeoffs',
      })
    ).toBe('advanced')
  })

  it('injects manual stored preference when the model omits search_depth', () => {
    localStorage.setItem('zura-settings', JSON.stringify({ tavilySearchDepthPreference: 'fast' }))

    expect(resolveWebSearchArgsForExecution('web_search', { query: 'pricing docs' })).toEqual({
      query: 'pricing docs',
      search_depth: 'fast',
    })
  })

  it('preserves explicit search_depth from the model', () => {
    localStorage.setItem('zura-settings', JSON.stringify({ tavilySearchDepthPreference: 'advanced' }))

    expect(
      resolveWebSearchArgsForExecution('web_search', {
        query: 'latest ai news',
        search_depth: 'ultra-fast',
      })
    ).toEqual({
      query: 'latest ai news',
      search_depth: 'ultra-fast',
    })
  })
})

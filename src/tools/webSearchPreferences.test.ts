import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  coerceSearchDepthPreference,
  coerceWebSearchIncludeImages,
  getStoredSearchDepthPreference,
  getStoredWebSearchIncludeImages,
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

  it('coerces invalid image preferences to enabled', () => {
    expect(coerceWebSearchIncludeImages('invalid')).toBe(true)
    expect(coerceWebSearchIncludeImages(false)).toBe(false)
  })

  it('reads stored search depth preference from localStorage', () => {
    localStorage.setItem('zura-settings', JSON.stringify({ tavilySearchDepthPreference: 'advanced' }))
    expect(getStoredSearchDepthPreference()).toBe('advanced')
  })

  it('reads stored image preference from localStorage', () => {
    localStorage.setItem('zura-settings', JSON.stringify({ webSearchIncludeImages: false }))
    expect(getStoredWebSearchIncludeImages()).toBe(false)
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
    localStorage.setItem(
      'zura-settings',
      JSON.stringify({ tavilySearchDepthPreference: 'fast', webSearchIncludeImages: false })
    )

    expect(resolveWebSearchArgsForExecution('web_search', { query: 'pricing docs' })).toEqual({
      query: 'pricing docs',
      search_depth: 'fast',
      include_images: false,
    })
  })

  it('preserves explicit search_depth from the model', () => {
    localStorage.setItem('zura-settings', JSON.stringify({ tavilySearchDepthPreference: 'advanced' }))

    expect(
      resolveWebSearchArgsForExecution('web_search', {
        query: 'latest ai news',
        search_depth: 'ultra-fast',
        include_images: false,
      })
    ).toEqual({
      query: 'latest ai news',
      search_depth: 'ultra-fast',
      include_images: false,
    })
  })
})

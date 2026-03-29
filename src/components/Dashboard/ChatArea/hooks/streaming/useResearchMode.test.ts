import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useResearchMode } from './useResearchMode'

describe('useResearchMode', () => {
  it('derives force-web-search support from the provider registry', () => {
    const { result } = renderHook(() =>
      useResearchMode({
        canUseTools: true,
      })
    )

    const fireworksConfig = result.current.calculateResearchConfig(
      {
        skills: {
          web_research: { enabled: true },
        },
        modelProvider: 'fireworks',
        enabledTools: ['web_search'],
      },
      'please use web search for this'
    )

    const perplexityConfig = result.current.calculateResearchConfig(
      {
        skills: {
          web_research: { enabled: true },
        },
        modelProvider: 'perplexity',
        enabledTools: ['web_search'],
      },
      'please use web search for this'
    )

    expect(fireworksConfig.forceWebSearch).toBe(true)
    expect(perplexityConfig.forceWebSearch).toBe(false)
  })
})

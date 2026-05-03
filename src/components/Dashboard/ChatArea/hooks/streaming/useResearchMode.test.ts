import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
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

  it('keeps follow-up search guidance open after multiple searches in uncapped mode', () => {
    const { result } = renderHook(() =>
      useResearchMode({
        canUseTools: true,
      })
    )

    act(() => {
      result.current.startResearchMode(0, false)
    })

    const prompt = result.current.getResearchContext(3, 0)

    expect(prompt).toContain('You have completed 3 of 8 targeted search(es)')
    expect(prompt).toContain('do not keep reformulating similar searches')
    expect(prompt).toContain('what is already answered by evidence')
    expect(prompt).toContain('same assistant turn so they run as one parallel batch')
    expect(prompt).toContain('one query per requested year for multi-year data')
    expect(prompt).not.toContain('Do not call web_search again')
  })
})

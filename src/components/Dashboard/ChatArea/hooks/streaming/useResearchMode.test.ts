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

    expect(fireworksConfig.forceWebSearch).toBe(true)
  })

  it('keeps follow-up search guidance focused on named gaps after multiple searches', () => {
    const { result } = renderHook(() =>
      useResearchMode({
        canUseTools: true,
      })
    )

    act(() => {
      result.current.startResearchMode(0, false)
    })

    const prompt = result.current.getResearchContext(3, 0)

    expect(prompt).toContain('You have already searched 3 time(s)')
    expect(prompt).toContain('named critical gap')
    expect(prompt).toContain('If you cannot name that gap, synthesize instead')
    expect(prompt).toContain('do not continue just because more searches are possible')
    expect(prompt).toContain('same assistant turn so they run as one parallel batch')
    expect(prompt).toContain('one query per requested year for multi-year data')
    expect(prompt).not.toContain('search(es) remain')
    expect(prompt).not.toContain('Do not call web_search again')
  })
})

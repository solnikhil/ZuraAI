import { describe, expect, it } from 'vitest'

import {
  buildResearchProgressPrompt,
  evaluateResearchContinuation,
  getEffectiveSearchBudget,
  hasReachedSearchBudget,
} from './researchLoopPolicy'

describe('researchLoopPolicy', () => {
  it('uses the practical cap when research mode is uncapped', () => {
    expect(getEffectiveSearchBudget(0, 50, 6)).toBe(6)
  })

  it('respects the explicit search budget when one is provided', () => {
    expect(getEffectiveSearchBudget(4, 50)).toBe(4)
    expect(getEffectiveSearchBudget(70, 50)).toBe(50)
  })

  it('does not force synthesis merely because multiple searches already happened', () => {
    const prompt = buildResearchProgressPrompt({
      searchCount: 3,
      maxRounds: 0,
      basePrompt: 'Base prompt',
      safetyCap: 50,
      practicalCap: 6,
    })

    expect(prompt).toContain('You have completed 3 of 6 targeted search(es)')
    expect(prompt).toContain('do not keep reformulating similar searches')
    expect(prompt).toContain('what is already answered by evidence')
    expect(prompt).toContain('issue exactly one new targeted query for the missing facet')
    expect(prompt).not.toContain('Provide your synthesized answer NOW')
    expect(prompt).not.toContain('Do NOT call web_search again')
  })

  it('forces final synthesis only after the search budget is reached', () => {
    expect(hasReachedSearchBudget(5, 0, 50, 6)).toBe(false)
    expect(hasReachedSearchBudget(6, 0, 50, 6)).toBe(true)
    expect(hasReachedSearchBudget(4, 4, 50)).toBe(true)
  })

  it('forces final synthesis when the model repeats materially similar searches', () => {
    expect(
      evaluateResearchContinuation({
        searchCount: 2,
        maxRounds: 0,
        priorQueries: ['claude cowork desktop app architecture'],
        nextQueries: ['Claude Cowork desktop-app architecture'],
        safetyCap: 50,
        practicalCap: 6,
      })
    ).toEqual({
      shouldForceFinalSynthesis: true,
      reason: 'duplicate-query',
    })
  })

  it('forces final synthesis when the model repeats the same facet on the same topic', () => {
    expect(
      evaluateResearchContinuation({
        searchCount: 2,
        maxRounds: 0,
        priorQueries: ['cursor pricing plans enterprise'],
        nextQueries: ['cursor team pricing costs'],
        safetyCap: 50,
        practicalCap: 6,
      })
    ).toEqual({
      shouldForceFinalSynthesis: true,
      reason: 'duplicate-facet',
    })
  })
})

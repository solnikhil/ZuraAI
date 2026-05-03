import { describe, expect, it } from 'vitest'

import {
  buildResearchProgressPrompt,
  classifyResearchQueryDuplicate,
  evaluateResearchContinuation,
  getEffectiveSearchBudget,
  hasReachedSearchBudget,
} from './researchLoopPolicy'

describe('researchLoopPolicy', () => {
  it('uses the practical cap when research mode is uncapped', () => {
    expect(getEffectiveSearchBudget(0, 50, 8)).toBe(8)
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
      practicalCap: 8,
    })

    expect(prompt).toContain('You have completed 3 of 8 targeted search(es)')
    expect(prompt).toContain('do not keep reformulating similar searches')
    expect(prompt).toContain('what is already answered by evidence')
    expect(prompt).toContain('same assistant turn so they run as one parallel batch')
    expect(prompt).toContain('one query per requested year for multi-year data')
    expect(prompt).not.toContain('Provide your synthesized answer NOW')
    expect(prompt).not.toContain('Do NOT call web_search again')
  })

  it('encourages parallel batches for independent facets at the start of research', () => {
    const prompt = buildResearchProgressPrompt({
      searchCount: 0,
      maxRounds: 0,
      basePrompt: 'Base prompt',
      safetyCap: 50,
      practicalCap: 8,
    })

    expect(prompt).toContain('issue those distinct web_search calls together')
    expect(prompt).toContain('one query per requested year for multi-year data')
    expect(prompt).toContain('one query per competitor or provider for comparisons')
    expect(prompt).toContain('within the remaining search budget')
    expect(prompt).not.toContain('do not pre-plan large speculative batches')
  })

  it('forces final synthesis only after the search budget is reached', () => {
    expect(hasReachedSearchBudget(7, 0, 50, 8)).toBe(false)
    expect(hasReachedSearchBudget(8, 0, 50, 8)).toBe(true)
    expect(hasReachedSearchBudget(4, 4, 50)).toBe(true)
  })

  it('classifies duplicate queries for batch filtering', () => {
    expect(
      classifyResearchQueryDuplicate('Cursor pricing plans enterprise', [
        'cursor team pricing costs',
      ])
    ).toBe('duplicate-facet')
  })

  it('does not treat explicit year-sliced searches as duplicates', () => {
    expect(
      classifyResearchQueryDuplicate('AI market size 2025', [
        'AI market size 2024',
      ])
    ).toBeNull()
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

  it('forces final synthesis when a search batch produces no executable query', () => {
    expect(
      evaluateResearchContinuation({
        searchCount: 3,
        maxRounds: 0,
        priorQueries: ['zura ai app architecture'],
        nextQueries: [''],
        safetyCap: 50,
        practicalCap: 8,
      })
    ).toEqual({
      shouldForceFinalSynthesis: true,
      reason: 'empty-batch',
    })
  })
})

import { describe, expect, it } from 'vitest'

import {
  buildResearchProgressPrompt,
  evaluateResearchContinuation,
  getEffectiveSearchBudget,
  hasReachedSearchBudget,
} from './researchLoopPolicy'

describe('researchLoopPolicy', () => {
  it('uses the safety cap when research mode is uncapped (no tight practical limit)', () => {
    expect(getEffectiveSearchBudget(0, 50, 50)).toBe(50)
  })

  it('respects the explicit search budget when one is provided', () => {
    expect(getEffectiveSearchBudget(4, 50)).toBe(4)
    expect(getEffectiveSearchBudget(70, 50)).toBe(50)
  })

  it('makes follow-up searches depend on a named critical gap instead of remaining budget', () => {
    const prompt = buildResearchProgressPrompt({
      searchCount: 3,
      maxRounds: 0,
      basePrompt: 'Base prompt',
      safetyCap: 50,
      practicalCap: 50,
    })

    expect(prompt).toContain('You have already searched 3 time(s)')
    expect(prompt).toContain('named critical gap')
    expect(prompt).toContain('do not continue just because more searches are possible')
    expect(prompt).toContain('classify the evidence internally')
    expect(prompt).toContain('Filter the returned results mentally')
    expect(prompt).toContain('Stop searching once the evidence is sufficient')
    expect(prompt).toContain('Do not amplify an unverified entity or model name')
    expect(prompt).toContain('same assistant turn so they run as one parallel batch')
    expect(prompt).toContain('one query per requested year for multi-year data')
    expect(prompt).toContain('Do not search again just to be more thorough')
    expect(prompt).toContain('do not use remaining search budget as a reason to continue')
    expect(prompt).not.toContain('search(es) remain')
    expect(prompt).not.toContain('within the remaining search budget')
    expect(prompt).not.toContain('Provide your synthesized answer NOW')
    expect(prompt).not.toContain('Do NOT call web_search again')
  })

  it('encourages parallel batches for independent facets at the start of research', () => {
    const prompt = buildResearchProgressPrompt({
      searchCount: 0,
      maxRounds: 0,
      basePrompt: 'Base prompt',
      safetyCap: 50,
      practicalCap: 50,
    })

    expect(prompt).toContain('issue those distinct web_search calls together')
    expect(prompt).toContain('official, primary, current, and directly relevant sources')
    expect(prompt).toContain('official vendor sources')
    expect(prompt).toContain('one query per requested year for multi-year data')
    expect(prompt).toContain('one query per competitor or provider for comparisons')
    expect(prompt).toContain('practical ceiling is 50')
    expect(prompt).toContain('stop earlier when the evidence is sufficient')
    expect(prompt).toContain('Do not search again just to be more thorough')
    expect(prompt).not.toContain('do not pre-plan large speculative batches')
  })

  it('does not frame explicit search budget progress as searches to use', () => {
    const prompt = buildResearchProgressPrompt({
      searchCount: 2,
      maxRounds: 5,
      basePrompt: 'Base prompt',
      safetyCap: 50,
      practicalCap: 50,
    })

    expect(prompt).toContain('You have already searched 2 time(s)')
    expect(prompt).toContain('ceiling for this request is 5')
    expect(prompt).toContain('it is not a target')
    expect(prompt).toContain('Search again only if a named critical gap remains')
    expect(prompt).toContain('Otherwise synthesize now')
    expect(prompt).not.toContain('search(es) remain')
    expect(prompt).not.toContain('searches remaining')
  })

  it('requires final answer language at the explicit budget boundary', () => {
    const prompt = buildResearchProgressPrompt({
      searchCount: 5,
      maxRounds: 5,
      basePrompt: 'Base prompt',
      safetyCap: 50,
      practicalCap: 50,
    })

    expect(prompt).toContain('WEB SEARCH BUDGET REACHED')
    expect(prompt).toContain('Do not call web_search again')
    expect(prompt).toContain('Provide your final synthesized answer now')
    expect(prompt).not.toContain('Search again only if')
  })

  it('keeps repeated follow-up prompts synthesis-oriented instead of runaway-oriented', () => {
    const prompts = [1, 2, 3, 4].map((searchCount) =>
      buildResearchProgressPrompt({
        searchCount,
        maxRounds: 5,
        basePrompt: 'Base prompt',
        safetyCap: 50,
        practicalCap: 50,
      })
    )

    for (const prompt of prompts) {
      expect(prompt).toContain('Search again only if a named critical gap remains')
      expect(prompt).toContain('Otherwise synthesize now')
      expect(prompt).toContain('If you cannot name that gap, synthesize instead')
      expect(prompt).toContain('do not use remaining search budget as a reason to continue')
      expect(prompt).not.toContain('search(es) remain')
      expect(prompt).not.toContain('searches remaining')
    }
  })

  it('detects when search budget is reached (enforcement now via synthetic tool result, not forced synthesis)', () => {
    expect(hasReachedSearchBudget(49, 0, 50, 50)).toBe(false)
    expect(hasReachedSearchBudget(50, 0, 50, 50)).toBe(true)
    expect(hasReachedSearchBudget(4, 4, 50)).toBe(true)

    // Budget case no longer forces synthesis (model can emit the call and receive normal result)
    expect(
      evaluateResearchContinuation({ searchCount: 50, maxRounds: 0, safetyCap: 50, practicalCap: 50 })
    ).toEqual({ shouldForceFinalSynthesis: false, reason: 'budget' })
  })

  it('allows materially similar searches to continue while budget remains', () => {
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
      shouldForceFinalSynthesis: false,
      reason: null,
    })
  })

  it('allows repeated same-facet searches to continue while budget remains', () => {
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
      shouldForceFinalSynthesis: false,
      reason: null,
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
        practicalCap: 50,
      })
    ).toEqual({
      shouldForceFinalSynthesis: true,
      reason: 'empty-batch',
    })
  })
})

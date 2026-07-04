import { describe, expect, it } from 'vitest'

import { defaultWebSearchPrompt } from './defaultWebSearchPrompt'

describe('defaultWebSearchPrompt', () => {
  it('defines a structured research lifecycle for deep and thorough research', () => {
    expect(defaultWebSearchPrompt).toContain('RESEARCH LIFECYCLE')
    expect(defaultWebSearchPrompt).toContain('For explicit deep research, thorough research')
    expect(defaultWebSearchPrompt).toContain('identify 2-5 independent research facets')
    expect(defaultWebSearchPrompt).toContain(
      'classify the evidence internally as one of: enough, missing critical source, conflicting, or off-topic'
    )
    expect(defaultWebSearchPrompt).toContain('Continue only for a named unresolved evidence gap')
    expect(defaultWebSearchPrompt).toContain(
      'Deep or thorough research means better facets, better sources, and better synthesis, not a high number of searches'
    )
  })

  it('includes anti-runaway search rules', () => {
    expect(defaultWebSearchPrompt).toContain('ANTI-RUNAWAY RULES')
    expect(defaultWebSearchPrompt).toContain('Do not search again just to be more thorough')
    expect(defaultWebSearchPrompt).toContain('Do not repeat similar queries with synonyms')
    expect(defaultWebSearchPrompt).toContain('Do not chase every entity')
    expect(defaultWebSearchPrompt).toContain(
      'Do not use remaining search budget as a reason to continue'
    )
    expect(defaultWebSearchPrompt).toContain(
      'If the next search would not change the final answer, synthesize instead'
    )
  })

  it('does not tell the model to spend remaining search budget', () => {
    expect(defaultWebSearchPrompt).not.toContain('searches remaining')
    expect(defaultWebSearchPrompt).not.toContain('use the remaining search budget')
    expect(defaultWebSearchPrompt).not.toContain('continue until the budget is exhausted')
  })
})

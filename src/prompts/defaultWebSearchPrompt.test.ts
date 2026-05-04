import { describe, expect, it } from 'vitest'

import { defaultWebSearchPrompt } from './defaultWebSearchPrompt'

describe('defaultWebSearchPrompt', () => {
  it('tells models to batch explicit ranges instead of starting with one broad search', () => {
    expect(defaultWebSearchPrompt).toContain('past 5 years')
    expect(defaultWebSearchPrompt).toContain('do NOT start with one broad search')
    expect(defaultWebSearchPrompt).toContain('one focused web_search call per slice')
    expect(defaultWebSearchPrompt).toContain('execute the batch in parallel')
  })

  it('asks models to disclose web-search result limitations', () => {
    expect(defaultWebSearchPrompt).toContain('depends on web search results')
    expect(defaultWebSearchPrompt).toContain('incomplete, outdated, or occasionally incorrect')
  })

  it('prioritizes official sources when verifying facts', () => {
    expect(defaultWebSearchPrompt).toContain('prioritize official or primary sources')
    expect(defaultWebSearchPrompt).toContain('third-party summaries')
    expect(defaultWebSearchPrompt).toContain('official/primary source')
  })
})

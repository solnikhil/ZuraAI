import { describe, expect, it } from 'vitest'

import { defaultWebSearchPrompt } from './defaultWebSearchPrompt'

describe('defaultWebSearchPrompt', () => {
  it('tells models to batch explicit ranges instead of starting with one broad search', () => {
    expect(defaultWebSearchPrompt).toContain('past 5 years')
    expect(defaultWebSearchPrompt).toContain('do NOT start with one broad search')
    expect(defaultWebSearchPrompt).toContain('one focused web_search call per slice')
    expect(defaultWebSearchPrompt).toContain('execute the batch in parallel')
  })
})

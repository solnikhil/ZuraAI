import { describe, expect, it } from 'vitest'

import { builtInMainToolManifest } from './builtinTools'

describe('builtInMainToolManifest', () => {
  it('tells models to batch independent web_search facets in one turn', () => {
    const webSearch = builtInMainToolManifest.web_search
    const numResultsDescription = webSearch.parameters.properties.num_results.description

    expect(webSearch.description).toContain('emit multiple focused web_search calls')
    expect(webSearch.description).toContain('execute them in parallel')
    expect(webSearch.description).toContain('once per year in one batch')
    expect(webSearch.parameters.properties.query.description).toContain('past 5 years')
    expect(numResultsDescription).toContain('emit multiple web_search calls in the same turn')
  })
})

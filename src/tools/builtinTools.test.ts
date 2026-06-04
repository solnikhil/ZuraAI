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

  it('exposes native Windows agent tools with approval metadata for mutating actions', () => {
    expect(builtInMainToolManifest.windows_uia_snapshot.requiresApproval).toBeUndefined()
    expect(builtInMainToolManifest.file_read.requiresApproval).toBeUndefined()
    expect(builtInMainToolManifest.app_find.requiresApproval).toBeUndefined()
    expect(builtInMainToolManifest.window_list.requiresApproval).toBeUndefined()

    for (const name of [
      'windows_uia_invoke',
      'windows_uia_set_value',
      'windows_uia_select',
      'system_shell',
      'file_write',
      'file_move',
      'app_launch',
      'app_install',
      'app_uninstall',
      'window_focus',
      'window_move',
      'window_close',
    ] as const) {
      expect(builtInMainToolManifest[name].requiresApproval).toBe(true)
    }
  })
})

import { describe, expect, it } from 'vitest'

import { BUILTIN_MAIN_TOOL_NAMES, builtInMainToolManifest } from './builtinTools'

describe('builtInMainToolManifest', () => {
  it('has an exact IPC contract entry for every manifest tool', () => {
    expect(Object.keys(builtInMainToolManifest)).toEqual([...BUILTIN_MAIN_TOOL_NAMES])
  })

  it('tells models to batch independent web_search facets in one turn', () => {
    const webSearch = builtInMainToolManifest.web_search
    const numResultsDescription = webSearch.parameters.properties.num_results.description

    expect(webSearch.description).toContain('emit multiple focused web_search calls')
    expect(webSearch.description).toContain('execute them in parallel')
    expect(webSearch.description).toContain('once per year in one batch')
    expect(webSearch.description).toContain('Search when information is current')
    expect(webSearch.description).toContain('Stop once the returned evidence is sufficient')
    expect(webSearch.description).toContain('official source')
    expect(webSearch.parameters.properties.query.description).toContain('past 5 years')
    expect(webSearch.parameters.properties.query.description).toContain("claim's unique names")
    expect(numResultsDescription).toContain('emit multiple web_search calls in the same turn')
  })

  it('exposes native Windows agent tools with approval metadata for mutating actions', () => {
    expect(builtInMainToolManifest.ui_get_app_state.requiresApproval).toBeUndefined()
    expect(builtInMainToolManifest.ui_find.requiresApproval).toBeUndefined()
    expect(builtInMainToolManifest.ui_wait_for.requiresApproval).toBeUndefined()
    expect(builtInMainToolManifest.file_read.requiresApproval).toBeUndefined()
    expect(builtInMainToolManifest.app_find.requiresApproval).toBeUndefined()
    expect(builtInMainToolManifest.window_list.requiresApproval).toBeUndefined()

    for (const name of [
      'ui_click',
      'ui_type_text',
      'ui_set_value',
      'ui_select',
      'ui_scroll',
      'ui_focus',
      'ui_key',
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

  it('exposes an explicit foreground screenshot path without weakening the default reservation', () => {
    const screenshot = builtInMainToolManifest.computer_screenshot
    expect(screenshot.parameters.properties.reserve_background).toMatchObject({
      type: 'boolean',
      default: true,
    })
    expect(screenshot.description).toContain('reserve_background=false')
  })

  it('advertises AI automation support in scheduled task tools', () => {
    const create = builtInMainToolManifest.scheduled_task_create
    const update = builtInMainToolManifest.scheduled_task_update
    const list = builtInMainToolManifest.scheduled_task_list

    expect(create.description).toContain('AI automation')
    expect(create.parameters.properties.type.enum).toContain('ai_automation')
    expect(create.parameters.properties.prompt.description).toContain('AI automation')
    expect(create.parameters.properties.automationMode.enum).toEqual(['prompt', 'watch', 'agent'])
    expect(create.parameters.properties.schedule.description).toContain('kind "agent"')
    expect(create.parameters.properties.intervalPreset.description).toContain('agent-owned cadence')
    expect(create.parameters.properties.allowedTools.description).toContain('agent-mode')
    expect(create.parameters.properties.outputDestinations.description).toContain(
      'background chat run'
    )
    expect(update.description).toContain('AI automation')
    expect(update.parameters.properties.prompt.description).toContain('AI automation')
    expect(list.parameters.properties.type.enum).toContain('ai_automation')
  })
})

import { describe, expect, it } from 'vitest'

import { defaultComputerUsePrompt } from './defaultComputerUsePrompt'

describe('defaultComputerUsePrompt', () => {
  it('prefers native and targeted inspection before full-screen screenshots', () => {
    expect(defaultComputerUsePrompt).not.toContain('ALWAYS call computer_screenshot first')
    expect(defaultComputerUsePrompt).not.toContain('Always start here')
    expect(defaultComputerUsePrompt).toContain('Prefer native structured tools')
    expect(defaultComputerUsePrompt).toContain(
      'file_*, app_*, window_*, and ui_get_app_state/ui_find'
    )
    expect(defaultComputerUsePrompt).toContain(
      'Use ui_get_app_state as the primary UI observation primitive'
    )
    expect(defaultComputerUsePrompt).toContain('search for its accelerator first')
    expect(defaultComputerUsePrompt).toContain(
      'Never release a background reservation merely to use computer_key or computer_type'
    )
    expect(defaultComputerUsePrompt).not.toContain(
      'Use keyboard shortcuts (computer_key) when more efficient than clicking.'
    )
    expect(defaultComputerUsePrompt).toContain(
      'A failed observation tool provides no evidence that an app, window, control, or item is absent'
    )
    expect(defaultComputerUsePrompt).toContain('Never invent application deep links, URIs')
    expect(defaultComputerUsePrompt).toContain(
      'Claim an action succeeded only after a successful tool result'
    )
    expect(defaultComputerUsePrompt).toContain(
      'computer_screenshot with window_id, window_title, or app_name'
    )
    expect(defaultComputerUsePrompt).toContain('full-screen computer_screenshot only')
    expect(defaultComputerUsePrompt).toContain('Never call window_focus')
    expect(defaultComputerUsePrompt).toContain('screenshot_unavailable')
    expect(defaultComputerUsePrompt).toContain('ocr.elements')
    expect(defaultComputerUsePrompt).toContain('background_safe is always false')
    expect(defaultComputerUsePrompt).toContain('verify the semantic result')
    expect(defaultComputerUsePrompt).toContain('smallest background-safe UIA/MSAA element')
    expect(defaultComputerUsePrompt).toContain('without focusing the app')
    expect(defaultComputerUsePrompt).toContain('brings the exact app window to the foreground')
    expect(defaultComputerUsePrompt).toContain('resolves the hit-tested control')
    expect(defaultComputerUsePrompt).toContain('A focus transition can itself change pixels')
  })
})

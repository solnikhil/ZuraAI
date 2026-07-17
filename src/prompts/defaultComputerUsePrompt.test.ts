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
  })
})

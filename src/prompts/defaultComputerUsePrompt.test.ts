import { describe, expect, it } from 'vitest'

import { defaultComputerUsePrompt } from './defaultComputerUsePrompt'

describe('defaultComputerUsePrompt', () => {
  it('prefers native and targeted inspection before full-screen screenshots', () => {
    expect(defaultComputerUsePrompt).not.toContain('ALWAYS call computer_screenshot first')
    expect(defaultComputerUsePrompt).not.toContain('Always start here')
    expect(defaultComputerUsePrompt).toContain('Prefer native structured tools')
    expect(defaultComputerUsePrompt).toContain('file_*, app_*, window_*, and windows_uia_snapshot')
    expect(defaultComputerUsePrompt).toContain('computer_screenshot with window_id, window_title, or app_name')
    expect(defaultComputerUsePrompt).toContain('full-screen computer_screenshot only')
  })
})

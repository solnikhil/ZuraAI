import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSkillsSettings, isSkillEnabled, withComputerUseEnabled } from '@/skills'
import { buildAgentModeSettingsUpdate, prepareAgentModeExit } from './agentModeTransition'

describe('Agent Mode settings transitions', () => {
  beforeEach(() => {
    window.agentApproval = undefined
  })

  it('enters Agent Mode with its required capability enabled', () => {
    const update = buildAgentModeSettingsUpdate(defaultSkillsSettings, true)

    expect(update.assistantMode).toBe('agent')
    expect(isSkillEnabled(update.skills, 'computer_use')).toBe(true)
  })

  it('always returns to Chat and disables Computer Use when exiting', () => {
    const enabledSkills = withComputerUseEnabled(defaultSkillsSettings, true)
    const update = buildAgentModeSettingsUpdate(enabledSkills, false)

    expect(update.assistantMode).toBe('chat')
    expect(isSkillEnabled(update.skills, 'computer_use')).toBe(false)
  })

  it('revokes Fully autonomous mode before exiting', async () => {
    const setAutonomousMode = vi.fn(async () => ({ enabled: false }))
    window.agentApproval = {
      requestApproval: vi.fn(),
      getAutonomousMode: vi.fn(async () => ({ enabled: true })),
      setAutonomousMode,
    }

    await prepareAgentModeExit()

    expect(setAutonomousMode).toHaveBeenCalledWith(false)
  })
})

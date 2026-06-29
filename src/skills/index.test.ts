import { describe, it, expect } from 'vitest'
import {
  buildEnabledSkillsPrompt,
  defaultSkillsSettings,
  defaultExtensionsSettings,
  getCodeExecutionToolExposure,
  getComputerUseToolExposure,
  getWebResearchToolExposure,
  isCodeExecutionEnabled,
  isChartGenerationEnabled,
  isSkillEnabled,
  isTerminalEnabled,
  getTerminalToolExposure,
  withTerminalEnabled,
  migrateSkillsFromLegacySettings,
  migrateExtensionsFromLegacySettings,
  normalizeSkillsSettings,
  normalizeExtensionsSettings,
  withCodeExecutionEnabled,
  withChartGenerationEnabled,
  withComputerUseEnabled,
} from './index'

describe('skills settings migration', () => {
  it('migrates legacy web search toggles into web_research skill', () => {
    const migrated = migrateSkillsFromLegacySettings({
      skills: undefined,
      webSearchEnabled: true,
      structuredResearchEnabled: true,
      deepResearchEnabled: false,
    })

    expect(migrated.web_research.enabled).toBe(true)
  })

  it('keeps persisted skills config when available', () => {
    const migrated = migrateSkillsFromLegacySettings({
      skills: {
        web_research: {
          enabled: false,
        },
      },
      webSearchEnabled: true,
      structuredResearchEnabled: true,
      deepResearchEnabled: true,
    })

    expect(migrated.web_research.enabled).toBe(false)
  })
})

describe('skills tool exposure', () => {
  it('hides web search and research plan when skill is disabled', () => {
    const exposure = getWebResearchToolExposure({
      ...defaultSkillsSettings,
      web_research: {
        enabled: false,
      },
    })

    expect(exposure).toEqual({
      exposeWebSearch: false,
      exposeResearchPlan: false,
    })
  })

  it('exposes only web_search when the skill is enabled', () => {
    const exposure = getWebResearchToolExposure({
      ...defaultSkillsSettings,
      web_research: {
        enabled: true,
      },
    })

    expect(exposure).toEqual({
      exposeWebSearch: true,
      exposeResearchPlan: false,
    })
  })

  it('builds concise enabled skills prompt', () => {
    const prompt = buildEnabledSkillsPrompt(defaultSkillsSettings)
    expect(prompt).toContain('Enabled Skills:')
    expect(prompt).toContain('Tavily (`web_research`)')
  })
})

describe('extensions settings migration', () => {
  it('defaults artifacts off when extensions are missing', () => {
    const normalized = normalizeExtensionsSettings(undefined)
    expect(normalized.artifacts.enabled).toBe(false)
  })

  it('migrates legacy skills into extensions', () => {
    const migrated = migrateExtensionsFromLegacySettings({
      skills: { artifacts: { enabled: false }, web_research: { enabled: true } },
      webSearchEnabled: undefined,
      structuredResearchEnabled: undefined,
      deepResearchEnabled: undefined,
    })

    expect(migrated.artifacts.enabled).toBe(false)
    expect(migrated.web_research.enabled).toBe(true)
  })

  it('exposes extension aliases', () => {
    expect(defaultExtensionsSettings.artifacts.enabled).toBe(defaultSkillsSettings.artifacts.enabled)
    expect(normalizeExtensionsSettings({ artifacts: { enabled: false } }).artifacts.enabled).toBe(false)
  })
})

describe('reminders skill', () => {
  it('defaults to disabled', () => {
    expect(defaultSkillsSettings.reminders.enabled).toBe(false)
  })

  it('normalizes missing reminders to disabled', () => {
    const normalized = normalizeSkillsSettings({ web_research: { enabled: true } })
    expect(normalized.reminders.enabled).toBe(false)
  })

  it('buildEnabledSkillsPrompt includes scheduler guidance when enabled', () => {
    const prompt = buildEnabledSkillsPrompt({
      ...defaultSkillsSettings,
      reminders: { enabled: true },
    })

    expect(prompt).toContain('Reminders & Lookouts')
    expect(prompt).toContain('scheduled_task_*')
  })

  it('buildEnabledSkillsPrompt excludes scheduler guidance when disabled', () => {
    const prompt = buildEnabledSkillsPrompt(defaultSkillsSettings)
    expect(prompt).not.toContain('scheduled_task_*')
  })

  it('buildEnabledSkillsPrompt injects the remindersPrompt option when enabled', () => {
    const prompt = buildEnabledSkillsPrompt(
      {
        ...defaultSkillsSettings,
        reminders: { enabled: true },
      },
      { remindersPrompt: 'REMINDERS_PROMPT_CONTENT' }
    )

    expect(prompt).toContain('REMINDERS_PROMPT_CONTENT')
  })
})

describe('code_execution skill', () => {
  it('defaults to disabled', () => {
    expect(defaultSkillsSettings.code_execution.enabled).toBe(false)
  })

  it('normalizes missing code_execution to default', () => {
    const normalized = normalizeSkillsSettings({ web_research: { enabled: true } })
    expect(normalized.code_execution.enabled).toBe(false)
  })

  it('preserves persisted code_execution state', () => {
    const normalized = normalizeSkillsSettings({
      web_research: { enabled: true },
      code_execution: { enabled: true },
    })
    expect(normalized.code_execution.enabled).toBe(true)
  })

  it('isCodeExecutionEnabled returns correct state', () => {
    expect(isCodeExecutionEnabled(defaultSkillsSettings)).toBe(false)
    expect(isCodeExecutionEnabled({
      ...defaultSkillsSettings,
      code_execution: { enabled: true },
    })).toBe(true)
  })

  it('withCodeExecutionEnabled toggles the skill', () => {
    const updated = withCodeExecutionEnabled(defaultSkillsSettings, true)
    expect(updated.code_execution.enabled).toBe(true)
    expect(updated.web_research.enabled).toBe(true)
  })

  it('getCodeExecutionToolExposure reflects skill state', () => {
    expect(getCodeExecutionToolExposure(defaultSkillsSettings)).toEqual({
      exposeCodeExecution: false,
    })
    expect(getCodeExecutionToolExposure({
      ...defaultSkillsSettings,
      code_execution: { enabled: true },
    })).toEqual({
      exposeCodeExecution: true,
    })
  })

  it('buildEnabledSkillsPrompt includes code execution when enabled', () => {
    const skills = { ...defaultSkillsSettings, code_execution: { enabled: true } }
    const prompt = buildEnabledSkillsPrompt(skills)
    expect(prompt).toContain('Code Execution')
    expect(prompt).toContain('code_execution')
  })

  it('buildEnabledSkillsPrompt excludes code execution when disabled', () => {
    const prompt = buildEnabledSkillsPrompt(defaultSkillsSettings)
    expect(prompt).not.toContain('code_execution')
  })
})

describe('terminal skill', () => {
  it('defaults to disabled', () => {
    expect(defaultSkillsSettings.terminal.enabled).toBe(false)
  })

  it('normalizes missing terminal to default', () => {
    const normalized = normalizeSkillsSettings({ web_research: { enabled: true } })
    expect(normalized.terminal.enabled).toBe(false)
  })

  it('preserves persisted terminal state', () => {
    const normalized = normalizeSkillsSettings({
      web_research: { enabled: true },
      terminal: { enabled: true },
    })
    expect(normalized.terminal.enabled).toBe(true)
  })

  it('isTerminalEnabled returns correct state', () => {
    expect(isTerminalEnabled(defaultSkillsSettings)).toBe(false)
    expect(isTerminalEnabled({
      ...defaultSkillsSettings,
      terminal: { enabled: true },
    })).toBe(true)
  })

  it('withTerminalEnabled toggles the skill', () => {
    const updated = withTerminalEnabled(defaultSkillsSettings, true)
    expect(updated.terminal.enabled).toBe(true)
    expect(updated.web_research.enabled).toBe(true)
  })

  it('getTerminalToolExposure reflects skill state', () => {
    expect(getTerminalToolExposure(defaultSkillsSettings)).toEqual({
      exposeTerminal: false,
    })
    expect(getTerminalToolExposure({
      ...defaultSkillsSettings,
      terminal: { enabled: true },
    })).toEqual({
      exposeTerminal: true,
    })
  })

  it('buildEnabledSkillsPrompt includes terminal when enabled', () => {
    const skills = { ...defaultSkillsSettings, terminal: { enabled: true } }
    const prompt = buildEnabledSkillsPrompt(skills)
    expect(prompt).toContain('Terminal')
    expect(prompt).toContain('system_shell')
  })

  it('buildEnabledSkillsPrompt excludes terminal when disabled', () => {
    const prompt = buildEnabledSkillsPrompt(defaultSkillsSettings)
    expect(prompt).not.toContain('system_shell')
  })

  it('buildEnabledSkillsPrompt injects the terminalPrompt option when enabled', () => {
    const skills = { ...defaultSkillsSettings, terminal: { enabled: true } }
    const prompt = buildEnabledSkillsPrompt(skills, { terminalPrompt: 'TERMINAL_PROMPT_CONTENT' })
    expect(prompt).toContain('TERMINAL_PROMPT_CONTENT')
  })

  it('buildEnabledSkillsPrompt omits the terminalPrompt option when disabled', () => {
    const prompt = buildEnabledSkillsPrompt(defaultSkillsSettings, { terminalPrompt: 'TERMINAL_PROMPT_CONTENT' })
    expect(prompt).not.toContain('TERMINAL_PROMPT_CONTENT')
  })

  it('buildEnabledSkillsPrompt injects the commandCenterPrompt option only when enabled', () => {
    const enabled = {
      ...defaultSkillsSettings,
      command_center: { enabled: true },
    }

    expect(
      buildEnabledSkillsPrompt(enabled, { commandCenterPrompt: 'COMMAND_CENTER_PROMPT_CONTENT' })
    ).toContain('COMMAND_CENTER_PROMPT_CONTENT')
    expect(
      buildEnabledSkillsPrompt(defaultSkillsSettings, { commandCenterPrompt: 'COMMAND_CENTER_PROMPT_CONTENT' })
    ).not.toContain('COMMAND_CENTER_PROMPT_CONTENT')
  })

  it('legacy settings without terminal default to disabled', () => {
    const migrated = migrateSkillsFromLegacySettings({
      skills: { web_research: { enabled: true } },
      webSearchEnabled: true,
      structuredResearchEnabled: false,
      deepResearchEnabled: false,
    })
    expect(migrated.terminal.enabled).toBe(false)
  })
})

describe('computer_use skill', () => {
  it('defaults to disabled and no longer recreates agent_desktop', () => {
    expect(defaultSkillsSettings.computer_use.enabled).toBe(false)
    expect(defaultSkillsSettings).not.toHaveProperty('agent_desktop')
  })

  it('ignores legacy agent_desktop settings while preserving computer_use', () => {
    const normalized = normalizeSkillsSettings({
      computer_use: { enabled: true },
      agent_desktop: { enabled: true },
    })

    expect(normalized.computer_use.enabled).toBe(true)
    expect(normalized).not.toHaveProperty('agent_desktop')
  })

  it('withComputerUseEnabled toggles the only desktop-control skill', () => {
    const updated = withComputerUseEnabled(defaultSkillsSettings, true)
    expect(isSkillEnabled(updated, 'computer_use')).toBe(true)
    expect(getComputerUseToolExposure(updated)).toEqual({
      exposeComputerUse: true,
    })
  })
})


describe('chart_generation skill', () => {
  it('defaults to disabled', () => {
    expect(defaultSkillsSettings.chart_generation.enabled).toBe(false)
  })

  it('normalizes missing chart_generation to default', () => {
    const normalized = normalizeSkillsSettings({ web_research: { enabled: true } })
    expect(normalized.chart_generation.enabled).toBe(false)
  })

  it('preserves persisted chart_generation state', () => {
    const normalized = normalizeSkillsSettings({
      web_research: { enabled: true },
      chart_generation: { enabled: true },
    })
    expect(normalized.chart_generation.enabled).toBe(true)
  })

  it('isChartGenerationEnabled returns correct state', () => {
    expect(isChartGenerationEnabled(defaultSkillsSettings)).toBe(false)
    expect(isChartGenerationEnabled({
      ...defaultSkillsSettings,
      chart_generation: { enabled: true },
    })).toBe(true)
  })

  it('withChartGenerationEnabled toggles the skill', () => {
    const updated = withChartGenerationEnabled(defaultSkillsSettings, true)
    expect(updated.chart_generation.enabled).toBe(true)
    expect(updated.web_research.enabled).toBe(true)
  })

  it('buildEnabledSkillsPrompt includes chart generation when enabled', () => {
    const skills = { ...defaultSkillsSettings, chart_generation: { enabled: true } }
    const prompt = buildEnabledSkillsPrompt(skills, { chartGenerationPrompt: 'CHART_PROMPT_CONTENT' })
    expect(prompt).toContain('Chart Generation')
    expect(prompt).toContain('chart_generation')
    expect(prompt).toContain('CHART_PROMPT_CONTENT')
  })

  it('buildEnabledSkillsPrompt excludes chart generation when disabled', () => {
    const prompt = buildEnabledSkillsPrompt(defaultSkillsSettings)
    expect(prompt).not.toContain('chart_generation')
    expect(prompt).not.toContain('Chart Generation')
  })
})



describe('memory auto-management sub-toggle', () => {
  it('defaults to enabled when memory is enabled and no config present', async () => {
    const { isMemoryAutoManageEnabled } = await import('./index')
    expect(isMemoryAutoManageEnabled({ memory: { enabled: true } } as never)).toBe(true)
  })

  it('is false when memory is disabled', async () => {
    const { isMemoryAutoManageEnabled } = await import('./index')
    expect(isMemoryAutoManageEnabled({ memory: { enabled: false } } as never)).toBe(false)
  })

  it('is false when autoManage config is explicitly false', async () => {
    const { isMemoryAutoManageEnabled, withMemoryAutoManage } = await import('./index')
    const skills = withMemoryAutoManage({ memory: { enabled: true } } as never, false)
    expect(isMemoryAutoManageEnabled(skills)).toBe(false)
    // The feature itself stays enabled (manual-only), only auto-management is off.
    expect(skills.memory.enabled).toBe(true)
  })

  it('round-trips autoManage through normalizeSkillsSettings', async () => {
    const { normalizeSkillsSettings } = await import('./index')
    const normalized = normalizeSkillsSettings({
      memory: { enabled: true, config: { autoManage: false } },
    })
    expect(normalized.memory.config?.autoManage).toBe(false)
  })
})

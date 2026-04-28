import { describe, it, expect } from 'vitest'
import {
  buildEnabledSkillsPrompt,
  defaultSkillsSettings,
  getCodeExecutionToolExposure,
  getWebResearchToolExposure,
  isCodeExecutionEnabled,
  isChartGenerationEnabled,
  migrateSkillsFromLegacySettings,
  normalizeSkillsSettings,
  withCodeExecutionEnabled,
  withChartGenerationEnabled,
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

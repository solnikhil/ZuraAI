import { describe, it, expect } from 'vitest'
import {
  buildEnabledSkillsPrompt,
  defaultSkillsSettings,
  getWebResearchToolExposure,
  migrateSkillsFromLegacySettings,
} from './index'

describe('skills settings migration', () => {
  it('migrates legacy web search + structured toggles into web_research skill', () => {
    const migrated = migrateSkillsFromLegacySettings({
      skills: undefined,
      webSearchEnabled: true,
      structuredResearchEnabled: true,
      deepResearchEnabled: false,
    })

    expect(migrated.web_research.enabled).toBe(true)
    expect(migrated.web_research.config.mode).toBe('structured')
  })

  it('keeps persisted skills config when available', () => {
    const migrated = migrateSkillsFromLegacySettings({
      skills: {
        web_research: {
          enabled: false,
          config: { mode: 'normal' },
        },
      },
      webSearchEnabled: true,
      structuredResearchEnabled: true,
      deepResearchEnabled: true,
    })

    expect(migrated.web_research.enabled).toBe(false)
    expect(migrated.web_research.config.mode).toBe('normal')
  })
})

describe('skills tool exposure', () => {
  it('hides web search and research plan when skill is disabled', () => {
    const exposure = getWebResearchToolExposure({
      ...defaultSkillsSettings,
      web_research: {
        enabled: false,
        config: { mode: 'normal' },
      },
    })

    expect(exposure).toEqual({
      exposeWebSearch: false,
      exposeResearchPlan: false,
    })
  })

  it('exposes web_search and research_plan in structured mode', () => {
    const exposure = getWebResearchToolExposure({
      ...defaultSkillsSettings,
      web_research: {
        enabled: true,
        config: { mode: 'structured' },
      },
    })

    expect(exposure).toEqual({
      exposeWebSearch: true,
      exposeResearchPlan: true,
    })
  })

  it('builds concise enabled skills prompt', () => {
    const prompt = buildEnabledSkillsPrompt(defaultSkillsSettings)
    expect(prompt).toContain('Enabled Skills:')
    expect(prompt).toContain('Web Research (`web_research`)')
  })
})

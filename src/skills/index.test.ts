import { describe, it, expect } from 'vitest'
import {
  buildEnabledSkillsPrompt,
  defaultSkillsSettings,
  getWebResearchToolExposure,
  migrateSkillsFromLegacySettings,
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

import { describe, expect, it } from 'vitest'
import { buildAgentSkillsCatalogPrompt } from './prompt'
import type { AgentSkillsSettings } from './types'

const baseSettings: AgentSkillsSettings = {
  enabled: true,
  projectRoot: '',
  disabledSkillNames: [],
  catalog: [
    {
      name: 'design-review',
      description: 'Review interface quality',
      scope: 'user',
      skillPath: 'C:/Users/Test/.agents/skills/design/SKILL.md',
      skillDir: 'C:/Users/Test/.agents/skills/design',
    },
  ],
}

describe('buildAgentSkillsCatalogPrompt', () => {
  it('omits the catalog when Agent Skills are disabled', () => {
    expect(buildAgentSkillsCatalogPrompt({ ...baseSettings, enabled: false })).toBe('')
  })

  it('includes only compact names and descriptions when enabled', () => {
    const prompt = buildAgentSkillsCatalogPrompt(baseSettings)

    expect(prompt).toContain('Agent Skills:')
    expect(prompt).toContain('- design-review [user]: Review interface quality')
    expect(prompt).toContain('activate_skill')
    expect(prompt).not.toContain('SKILL.md')
  })

  it('omits disabled skills from the model catalog', () => {
    const prompt = buildAgentSkillsCatalogPrompt({
      ...baseSettings,
      disabledSkillNames: ['design-review'],
    })

    expect(prompt).toBe('')
  })
})

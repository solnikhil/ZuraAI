import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  getEffectiveSystemPrompt,
  resolveSystemPromptTemplate,
  shouldEnableTools,
} from './promptSelection'
import { defaultSkillsSettings } from '../skills'
import { CURRENT_YEAR_PLACEHOLDER } from '../prompts/defaultSystemPrompt'
import { ASSISTANT_PERSONALITIES } from '../prompts/assistantPersonalities'
import { defaultSystemPrompt } from '../prompts/defaultSystemPrompt'

// Arbitrary for generating random system prompts
const systemPromptArb = fc.string({ minLength: 1, maxLength: 500 })

describe('System Prompt Selection', () => {
  it('instructs the assistant not to use em dashes', () => {
    expect(defaultSystemPrompt).toContain('Do not use em dashes in prose.')
  })

  it('returns the base system prompt plus the default personality section', () => {
    fc.assert(
      fc.property(systemPromptArb, (basePrompt) => {
        const settings = { systemPrompt: basePrompt }

        const effectivePrompt = getEffectiveSystemPrompt(settings)

        expect(effectivePrompt).toContain(basePrompt)
        expect(effectivePrompt).toContain('Selected Personality')
        expect(effectivePrompt).toContain('Professional Engineer')
      }),
      { numRuns: 100 }
    )
  })

  it.each(ASSISTANT_PERSONALITIES)(
    'adds the selected $label personality section',
    (personality) => {
      const effectivePrompt = getEffectiveSystemPrompt({
        systemPrompt: 'Base prompt',
        assistantPersonality: personality.id,
      })

      expect(effectivePrompt).toContain('Selected Personality')
      expect(effectivePrompt).toContain(personality.label)
      expect(effectivePrompt).toContain(personality.prompt)
    }
  )

  it('resolves the current year placeholder dynamically', () => {
    const prompt = `Context\nToday's year is ${CURRENT_YEAR_PLACEHOLDER}.`

    expect(resolveSystemPromptTemplate(prompt)).toBe(
      `Context\nToday's year is ${new Date().getFullYear()}.`
    )
  })
})
describe('Tool Enablement', () => {
  it('Respects toolsEnabled setting', () => {
    fc.assert(
      fc.property(fc.boolean(), (toolsEnabled) => {
        const settings = {
          toolsEnabled: toolsEnabled,
        }

        const toolsAvailable = shouldEnableTools(settings)

        // Master toolsEnabled toggle controls tool availability
        expect(toolsAvailable).toBe(toolsEnabled)
      }),
      { numRuns: 100 }
    )
  })

  it('adds enabled skills prompt context when web research skill is on', () => {
    const prompt = getEffectiveSystemPrompt({
      systemPrompt: 'Base prompt',
      skills: defaultSkillsSettings,
    })

    expect(prompt).toContain('Enabled Skills:')
    expect(prompt).toContain('Tavily (`web_research`)')
  })

  it('can omit Agent Skills catalog context for context-ring estimates', () => {
    const settings = {
      systemPrompt: 'Base prompt',
      agentSkills: {
        enabled: true,
        projectRoot: '',
        disabledSkillNames: [],
        catalog: [
          {
            name: 'design-review',
            description: 'Review interface quality',
            scope: 'user' as const,
            skillPath: 'C:/Users/Test/.agents/skills/design-review/SKILL.md',
            skillDir: 'C:/Users/Test/.agents/skills/design-review',
          },
        ],
      },
    }

    expect(getEffectiveSystemPrompt(settings)).toContain('Agent Skills:')
    expect(
      getEffectiveSystemPrompt(settings, undefined, undefined, {
        includeAgentSkillsCatalog: false,
      })
    ).not.toContain('Agent Skills:')
  })
})

describe('Chart Generation skill prompt integration', () => {
  it('appends chart generation prompt when skill is enabled', () => {
    const prompt = getEffectiveSystemPrompt({
      systemPrompt: 'Base prompt',
      skills: {
        ...defaultSkillsSettings,
        chart_generation: { enabled: true },
      },
      chartGenerationPrompt: 'CHART_GEN_INSTRUCTIONS',
    })

    expect(prompt).toContain('Chart Generation')
    expect(prompt).toContain('CHART_GEN_INSTRUCTIONS')
  })

  it('excludes chart generation prompt when skill is disabled', () => {
    const prompt = getEffectiveSystemPrompt({
      systemPrompt: 'Base prompt',
      skills: defaultSkillsSettings,
      chartGenerationPrompt: 'CHART_GEN_INSTRUCTIONS',
    })

    expect(prompt).not.toContain('CHART_GEN_INSTRUCTIONS')
    expect(prompt).not.toContain('chart_generation')
  })
})

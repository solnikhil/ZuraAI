import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getEffectiveSystemPrompt, resolveSystemPromptTemplate, shouldEnableTools } from './promptSelection'
import { defaultSkillsSettings } from '../skills'
import { CURRENT_YEAR_PLACEHOLDER } from '../prompts/defaultSystemPrompt'

// Arbitrary for generating random system prompts
const systemPromptArb = fc.string({ minLength: 1, maxLength: 500 })

describe('System Prompt Selection', () => {
    it('Returns the base system prompt', () => {
        fc.assert(
            fc.property(
                systemPromptArb,
                (basePrompt) => {
                    const settings = { systemPrompt: basePrompt }
                    
                    const effectivePrompt = getEffectiveSystemPrompt(settings)
                    
                    // Should return the base prompt
                    expect(effectivePrompt).toBe(basePrompt)
                }
            ),
            { numRuns: 100 }
        )
    })

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
            fc.property(
                fc.boolean(),
                (toolsEnabled) => {
                    const settings = {
                        toolsEnabled: toolsEnabled,
                    }

                    const toolsAvailable = shouldEnableTools(settings)

                    // Master toolsEnabled toggle controls tool availability
                    expect(toolsAvailable).toBe(toolsEnabled)
                }
            ),
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

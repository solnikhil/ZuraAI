import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getEffectiveSystemPrompt, shouldEnableTools } from './promptSelection'
import { defaultSkillsSettings } from '../skills'

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

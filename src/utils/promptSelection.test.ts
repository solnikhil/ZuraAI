import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getEffectiveSystemPrompt, shouldEnableTools } from './promptSelection'

// Arbitrary for generating random system prompts
const systemPromptArb = fc.string({ minLength: 1, maxLength: 500 })

describe('System Prompt Selection', () => {
    it('Returns the base system prompt', () => {
        fc.assert(
            fc.property(
                systemPromptArb,
                (basePrompt) => {
                    const settings = {
                        systemPrompt: basePrompt,
                    }
                    
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
                fc.boolean(),
                (toolsEnabled, webSearchEnabled) => {
                    const settings = {
                        toolsEnabled: toolsEnabled,
                        webSearchEnabled: webSearchEnabled,
                    }

                    const toolsAvailable = shouldEnableTools(settings)

                    // Should be true if either setting is enabled
                    expect(toolsAvailable).toBe(toolsEnabled || webSearchEnabled)
                }
            ),
            { numRuns: 100 }
        )
    })
})

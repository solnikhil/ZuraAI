import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getEffectiveSystemPrompt, shouldEnableTools } from './promptSelection'
import { AGENT_SYSTEM_PROMPT, THINKING_SYSTEM_PROMPT } from '../contexts/SettingsContext'

// Arbitrary for generating random system prompts
const systemPromptArb = fc.string({ minLength: 1, maxLength: 500 })

// Arbitrary for generating settings objects
const settingsArb = fc.record({
    systemPrompt: systemPromptArb,
    agentModeEnabled: fc.boolean(),
    thinkingModeEnabled: fc.boolean(),
    toolsEnabled: fc.boolean(),
})

describe('Agent Mode Prompt Selection', () => {
    /**
     * **Feature: agent-mode, Property 1: Agent mode enables agent system prompt**
     * **Validates: Requirements 1.1, 5.1**
     * 
     * For any settings state where agentModeEnabled is true,
     * the effective system prompt SHALL be the AGENT_SYSTEM_PROMPT constant.
     */
    it('Property 1: Agent mode enables agent system prompt', () => {
        fc.assert(
            fc.property(
                settingsArb,
                (settings) => {
                    // When agent mode is enabled
                    const settingsWithAgentMode = { ...settings, agentModeEnabled: true }
                    const effectivePrompt = getEffectiveSystemPrompt(settingsWithAgentMode)
                    
                    // The effective prompt should be the AGENT_SYSTEM_PROMPT
                    expect(effectivePrompt).toBe(AGENT_SYSTEM_PROMPT)
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * **Feature: agent-mode, Property 2: Agent mode toggle is reversible**
     * **Validates: Requirements 1.2**
     * 
     * For any settings state, toggling agentModeEnabled on then off
     * SHALL result in the standard system prompt being used (round-trip property).
     */
    it('Property 2: Agent mode toggle is reversible', () => {
        fc.assert(
            fc.property(
                settingsArb,
                (settings) => {
                    // Start with agent mode off
                    const settingsOff = { ...settings, agentModeEnabled: false }
                    const promptBefore = getEffectiveSystemPrompt(settingsOff)
                    
                    // Toggle agent mode on
                    const settingsOn = { ...settingsOff, agentModeEnabled: true }
                    const promptDuring = getEffectiveSystemPrompt(settingsOn)
                    
                    // Toggle agent mode off again
                    const settingsOffAgain = { ...settingsOn, agentModeEnabled: false }
                    const promptAfter = getEffectiveSystemPrompt(settingsOffAgain)
                    
                    // The prompt should be AGENT_SYSTEM_PROMPT when on
                    expect(promptDuring).toBe(AGENT_SYSTEM_PROMPT)
                    
                    // The prompt should return to the original state when toggled off
                    expect(promptAfter).toBe(promptBefore)
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Additional property: When agent mode is disabled and thinking mode is enabled,
     * the prompt should include the thinking system prompt.
     */
    it('Thinking mode appends thinking prompt when agent mode is disabled', () => {
        fc.assert(
            fc.property(
                systemPromptArb,
                (basePrompt) => {
                    const settings = {
                        systemPrompt: basePrompt,
                        agentModeEnabled: false,
                        thinkingModeEnabled: true,
                    }
                    
                    const effectivePrompt = getEffectiveSystemPrompt(settings)
                    
                    // Should contain both base prompt and thinking prompt
                    expect(effectivePrompt).toContain(basePrompt)
                    expect(effectivePrompt).toContain(THINKING_SYSTEM_PROMPT)
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Additional property: Agent mode takes priority over thinking mode.
     */
    it('Agent mode takes priority over thinking mode', () => {
        fc.assert(
            fc.property(
                systemPromptArb,
                (basePrompt) => {
                    const settings = {
                        systemPrompt: basePrompt,
                        agentModeEnabled: true,
                        thinkingModeEnabled: true, // Both enabled
                    }
                    
                    const effectivePrompt = getEffectiveSystemPrompt(settings)
                    
                    // Agent mode should take priority
                    expect(effectivePrompt).toBe(AGENT_SYSTEM_PROMPT)
                    // Should NOT contain the base prompt or thinking prompt
                    expect(effectivePrompt).not.toContain(THINKING_SYSTEM_PROMPT)
                }
            ),
            { numRuns: 100 }
        )
    })
})

describe('Agent Mode Tool Override', () => {
    /**
     * **Feature: agent-mode, Property 3: Agent mode overrides tool settings**
     * **Validates: Requirements 1.4**
     * 
     * For any settings state where agentModeEnabled is true,
     * tools SHALL be available regardless of the toolsEnabled setting value.
     */
    it('Property 3: Agent mode overrides tool settings', () => {
        fc.assert(
            fc.property(
                fc.boolean(), // toolsEnabled can be true or false
                (toolsEnabled) => {
                    const settings = {
                        agentModeEnabled: true,
                        toolsEnabled: toolsEnabled, // Regardless of this value
                    }
                    
                    const toolsAvailable = shouldEnableTools(settings)
                    
                    // Tools should always be enabled when agent mode is on
                    expect(toolsAvailable).toBe(true)
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Additional property: When agent mode is disabled, toolsEnabled setting is respected.
     */
    it('Tools setting is respected when agent mode is disabled', () => {
        fc.assert(
            fc.property(
                fc.boolean(),
                (toolsEnabled) => {
                    const settings = {
                        agentModeEnabled: false,
                        toolsEnabled: toolsEnabled,
                    }
                    
                    const toolsAvailable = shouldEnableTools(settings)
                    
                    // Should match the toolsEnabled setting
                    expect(toolsAvailable).toBe(toolsEnabled)
                }
            ),
            { numRuns: 100 }
        )
    })
})

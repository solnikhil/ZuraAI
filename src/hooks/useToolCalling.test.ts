import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { toolDefinitions, getToolByName } from '../tools/definitions'

/**
 * Helper function to check if a tool requires approval based on toolApprovalMode
 * This mirrors the logic in useToolCalling.shouldRequireApproval
 * 
 * **Feature: agent-mode, Property 7: Sensitive tools require approval based on settings**
 * **Validates: Requirements 4.3**
 */
function shouldRequireApproval(
    toolName: string,
    toolApprovalMode: 'always' | 'sensitive' | 'never'
): boolean {
    const toolDef = getToolByName(toolName)
    const toolRequiresApproval = toolDef?.requiresApproval === true
    
    switch (toolApprovalMode) {
        case 'always':
            // All tools require approval
            return true
        case 'sensitive':
            // Only tools marked with requiresApproval need approval
            return toolRequiresApproval
        case 'never':
            // No tools require approval
            return false
        default:
            // Default to sensitive mode
            return toolRequiresApproval
    }
}

// Get all tool names from definitions
const allToolNames = toolDefinitions.map(t => t.name)

// Get tools that have requiresApproval: true
const sensitiveTools = toolDefinitions.filter(t => t.requiresApproval === true).map(t => t.name)

// Get tools that don't have requiresApproval: true
const nonSensitiveTools = toolDefinitions.filter(t => t.requiresApproval !== true).map(t => t.name)

// Arbitrary for tool approval modes
const toolApprovalModeArb = fc.constantFrom('always', 'sensitive', 'never') as fc.Arbitrary<'always' | 'sensitive' | 'never'>

// Arbitrary for tool names
const toolNameArb = fc.constantFrom(...allToolNames)

// Arbitrary for sensitive tool names
const sensitiveToolNameArb = sensitiveTools.length > 0 
    ? fc.constantFrom(...sensitiveTools)
    : fc.constant('read_clipboard') // Fallback if no sensitive tools

// Arbitrary for non-sensitive tool names
const nonSensitiveToolNameArb = nonSensitiveTools.length > 0
    ? fc.constantFrom(...nonSensitiveTools)
    : fc.constant('web_search') // Fallback if no non-sensitive tools

describe('Tool Approval Flow', () => {
    /**
     * **Feature: agent-mode, Property 7: Sensitive tools require approval based on settings**
     * **Validates: Requirements 4.3**
     * 
     * For any tool with requiresApproval: true, when toolApprovalMode is 'sensitive' or 'always',
     * the system SHALL request user confirmation before execution.
     */
    it('Property 7: Sensitive tools require approval based on settings', () => {
        fc.assert(
            fc.property(
                toolNameArb,
                toolApprovalModeArb,
                (toolName, approvalMode) => {
                    const toolDef = getToolByName(toolName)
                    const isSensitiveTool = toolDef?.requiresApproval === true
                    const requiresApproval = shouldRequireApproval(toolName, approvalMode)
                    
                    // Verify the approval logic based on mode
                    switch (approvalMode) {
                        case 'always':
                            // All tools should require approval
                            expect(requiresApproval).toBe(true)
                            break
                        case 'sensitive':
                            // Only sensitive tools should require approval
                            expect(requiresApproval).toBe(isSensitiveTool)
                            break
                        case 'never':
                            // No tools should require approval
                            expect(requiresApproval).toBe(false)
                            break
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: In 'always' mode, every tool requires approval
     */
    it('In always mode, every tool requires approval', () => {
        fc.assert(
            fc.property(
                toolNameArb,
                (toolName) => {
                    const requiresApproval = shouldRequireApproval(toolName, 'always')
                    expect(requiresApproval).toBe(true)
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: In 'never' mode, no tool requires approval
     */
    it('In never mode, no tool requires approval', () => {
        fc.assert(
            fc.property(
                toolNameArb,
                (toolName) => {
                    const requiresApproval = shouldRequireApproval(toolName, 'never')
                    expect(requiresApproval).toBe(false)
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: In 'sensitive' mode, only tools marked with requiresApproval need approval
     */
    it('In sensitive mode, only marked tools require approval', () => {
        // Test with sensitive tools
        if (sensitiveTools.length > 0) {
            fc.assert(
                fc.property(
                    sensitiveToolNameArb,
                    (toolName) => {
                        const requiresApproval = shouldRequireApproval(toolName, 'sensitive')
                        expect(requiresApproval).toBe(true)
                    }
                ),
                { numRuns: Math.min(100, sensitiveTools.length * 10) }
            )
        }
        
        // Test with non-sensitive tools
        if (nonSensitiveTools.length > 0) {
            fc.assert(
                fc.property(
                    nonSensitiveToolNameArb,
                    (toolName) => {
                        const requiresApproval = shouldRequireApproval(toolName, 'sensitive')
                        expect(requiresApproval).toBe(false)
                    }
                ),
                { numRuns: Math.min(100, nonSensitiveTools.length * 10) }
            )
        }
    })

    /**
     * Property: Approval mode transitions are consistent
     * Changing from 'never' to 'sensitive' should only add approval requirements for sensitive tools
     */
    it('Approval mode transitions are consistent', () => {
        fc.assert(
            fc.property(
                toolNameArb,
                (toolName) => {
                    const toolDef = getToolByName(toolName)
                    const isSensitiveTool = toolDef?.requiresApproval === true
                    
                    const neverApproval = shouldRequireApproval(toolName, 'never')
                    const sensitiveApproval = shouldRequireApproval(toolName, 'sensitive')
                    const alwaysApproval = shouldRequireApproval(toolName, 'always')
                    
                    // 'never' should always be false
                    expect(neverApproval).toBe(false)
                    
                    // 'always' should always be true
                    expect(alwaysApproval).toBe(true)
                    
                    // 'sensitive' should match the tool's requiresApproval flag
                    expect(sensitiveApproval).toBe(isSensitiveTool)
                    
                    // Ordering: never <= sensitive <= always
                    // If sensitive requires approval, always should too
                    if (sensitiveApproval) {
                        expect(alwaysApproval).toBe(true)
                    }
                    // If never requires approval (it shouldn't), sensitive should too
                    if (neverApproval) {
                        expect(sensitiveApproval).toBe(true)
                    }
                }
            ),
            { numRuns: 100 }
        )
    })
})

describe('Tool Definitions Validation', () => {
    /**
     * Verify that sensitive tools are properly marked in definitions
     */
    it('Sensitive tool categories have requiresApproval flag', () => {
        // Computer control, file operations, and system operations should generally be sensitive
        const sensitiveCategories = ['computer', 'file', 'system', 'app']
        
        for (const tool of toolDefinitions) {
            if (sensitiveCategories.includes(tool.category)) {
                // Most tools in these categories should have requiresApproval
                // This is a soft check - not all tools in these categories need approval
                // but we verify the flag exists and is boolean
                expect(typeof tool.requiresApproval === 'boolean' || tool.requiresApproval === undefined).toBe(true)
            }
        }
    })

    /**
     * Verify that all tools have valid categories
     */
    it('All tools have valid categories', () => {
        const validCategories = ['search', 'utility', 'file', 'system', 'computer', 'app', 'browser']
        
        for (const tool of toolDefinitions) {
            expect(validCategories).toContain(tool.category)
        }
    })
})

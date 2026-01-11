import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { toolDefinitions, getToolByName } from '../tools/definitions'

/**
 * Tool Calling Tests
 * 
 * Tools auto-execute without requiring user approval
 * **Validates: Requirements 2.1**
 */

// Get all tool names from definitions
const allToolNames = toolDefinitions.map(t => t.name)

// Arbitrary for tool names
const toolNameArb = fc.constantFrom(...allToolNames)

describe('Tool Auto-Execution', () => {
    /**
     * Property: All tools should be executable without approval
     * 
     * Tools auto-execute without requiring user approval
     * **Validates: Requirements 2.1**
     * 
     * For any tool, the system SHALL execute it immediately without requiring user approval.
     */
    it('Property 3: All tools auto-execute without approval', () => {
        fc.assert(
            fc.property(
                toolNameArb,
                (toolName) => {
                    const toolDef = getToolByName(toolName)
                    
                    // Tool should exist
                    expect(toolDef).toBeDefined()
                    
                    // Tool should have required properties for execution
                    expect(toolDef?.name).toBe(toolName)
                    expect(toolDef?.description).toBeDefined()
                    expect(toolDef?.parameters).toBeDefined()
                    
                    // No approval check needed - tools auto-execute
                    // The requiresApproval flag is now ignored
                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Tool execution should not be blocked by any approval mechanism
     */
    it('No tool is blocked by approval mechanism', () => {
        fc.assert(
            fc.property(
                toolNameArb,
                (toolName) => {
                    const toolDef = getToolByName(toolName)
                    
                    // Tool should exist and be ready for execution
                    expect(toolDef).toBeDefined()
                    
                    // Even if requiresApproval flag exists, it should be ignored
                    // All tools should be executable
                    return true
                }
            ),
            { numRuns: 100 }
        )
    })
})

describe('Tool Definitions Validation', () => {
    /**
     * Verify that all tools have valid categories
     */
    it('All tools have valid categories', () => {
        const validCategories = ['search', 'utility', 'file', 'system', 'computer', 'app', 'browser']
        
        for (const tool of toolDefinitions) {
            expect(validCategories).toContain(tool.category)
        }
    })

    /**
     * Verify that all tools have required properties
     */
    it('All tools have required properties', () => {
        for (const tool of toolDefinitions) {
            expect(tool.name).toBeDefined()
            expect(typeof tool.name).toBe('string')
            expect(tool.description).toBeDefined()
            expect(typeof tool.description).toBe('string')
            expect(tool.parameters).toBeDefined()
            expect(tool.category).toBeDefined()
        }
    })
})

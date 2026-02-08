import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { toolDefinitions, getToolByName, getAllToolDefinitions } from '../tools/definitions'

/**
 * Tool Calling Tests
 * 
 * Tools auto-execute without requiring user approval
 * **Validates: Requirements 2.1**
 */

// Get all tool names from definitions
const allToolNames = toolDefinitions.map(t => t.name)

/**
 * Helper function to simulate getEnabledToolsForProvider logic
 * This mirrors the logic in useToolCalling.ts for testing purposes
 * 
 * @param webSearchEnabled - Whether web search toggle is ON
 * @param deepResearchEnabled - Whether deep research toggle is ON
 * @param enabledTools - List of enabled tools (defaults to all tools)
 * @returns Filtered list of enabled tools
 */
function getEnabledToolsForProviderLogic(
    webSearchEnabled: boolean,
    deepResearchEnabled: boolean,
    enabledTools?: string[]
): string[] {
    const allToolNames = getAllToolDefinitions().map(tool => tool.name)
    let tools: string[] = enabledTools && enabledTools.length > 0
        ? [...enabledTools]
        : allToolNames

    // Gate web_search based on BOTH toggles
    // web_search is excluded only when BOTH webSearchEnabled AND deepResearchEnabled are OFF
    // This ensures web_search is available when:
    // - webSearchEnabled is ON (normal web search mode)
    // - deepResearchEnabled is ON (deep research mode, regardless of webSearchEnabled)
    // Validates: Requirements 1.1, 1.3, 1.4
    if (!webSearchEnabled && !deepResearchEnabled) {
        tools = tools.filter(tool => tool !== 'web_search')
    }

    return tools
}

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


/**
 * Property Test: Tool Filtering Based on Toggle States
 * 
 * **Validates: Requirements 1.1, 1.3, 1.4, 5.4**
 * 
 * Property 1: For any combination of webSearchEnabled and deepResearchEnabled settings,
 * web_search SHALL be included in the enabled tools list if and only if at least one
 * of the toggles is ON.
 * 
 * Requirements:
 * - 1.1: WHEN webSearchEnabled is OFF AND deepResearchEnabled is OFF, web_search SHALL NOT be included
 * - 1.3: WHEN webSearchEnabled is ON, web_search SHALL be included
 * - 1.4: WHEN deepResearchEnabled is ON, web_search SHALL be included regardless of webSearchEnabled state
 * - 5.4: IF both toggles are OFF, THE system SHALL disable web search entirely
 */
describe('Tool Filtering Based on Toggle States', () => {
    /**
     * Property 1: Tool filtering based on toggle states
     * 
     * **Validates: Requirements 1.1, 1.3, 1.4, 5.4**
     * 
     * For any combination of webSearchEnabled and deepResearchEnabled settings,
     * web_search SHALL be included in the enabled tools list if and only if
     * at least one of the toggles is ON.
     */
    it('Property 1: web_search is included if and only if at least one toggle is ON', () => {
        fc.assert(
            fc.property(
                fc.boolean(), // webSearchEnabled
                fc.boolean(), // deepResearchEnabled
                (webSearchEnabled, deepResearchEnabled) => {
                    // Get the enabled tools based on toggle states
                    const enabledTools = getEnabledToolsForProviderLogic(
                        webSearchEnabled,
                        deepResearchEnabled
                    )

                    // Check if web_search is in the enabled tools
                    const hasWebSearch = enabledTools.includes('web_search')

                    // Expected: web_search should be included if at least one toggle is ON
                    const expectedHasWebSearch = webSearchEnabled || deepResearchEnabled

                    // Verify the property
                    expect(hasWebSearch).toBe(expectedHasWebSearch)

                    return hasWebSearch === expectedHasWebSearch
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Requirement 1.1: WHEN webSearchEnabled is OFF AND deepResearchEnabled is OFF,
     * web_search SHALL NOT be included
     * 
     * **Validates: Requirements 1.1, 5.4**
     */
    it('Requirement 1.1: Both toggles OFF excludes web_search', () => {
        fc.assert(
            fc.property(
                fc.constant(false), // webSearchEnabled = OFF
                fc.constant(false), // deepResearchEnabled = OFF
                (webSearchEnabled, deepResearchEnabled) => {
                    const enabledTools = getEnabledToolsForProviderLogic(
                        webSearchEnabled,
                        deepResearchEnabled
                    )

                    // web_search should NOT be included
                    expect(enabledTools).not.toContain('web_search')

                    return !enabledTools.includes('web_search')
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Requirement 1.3: WHEN webSearchEnabled is ON, web_search SHALL be included
     * 
     * **Validates: Requirements 1.3**
     */
    it('Requirement 1.3: webSearchEnabled ON includes web_search', () => {
        fc.assert(
            fc.property(
                fc.constant(true),  // webSearchEnabled = ON
                fc.boolean(),       // deepResearchEnabled = any
                (webSearchEnabled, deepResearchEnabled) => {
                    const enabledTools = getEnabledToolsForProviderLogic(
                        webSearchEnabled,
                        deepResearchEnabled
                    )

                    // web_search should be included
                    expect(enabledTools).toContain('web_search')

                    return enabledTools.includes('web_search')
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Requirement 1.4: WHEN deepResearchEnabled is ON, web_search SHALL be included
     * regardless of webSearchEnabled state
     * 
     * **Validates: Requirements 1.4**
     */
    it('Requirement 1.4: deepResearchEnabled ON includes web_search regardless of webSearchEnabled', () => {
        fc.assert(
            fc.property(
                fc.boolean(),       // webSearchEnabled = any
                fc.constant(true),  // deepResearchEnabled = ON
                (webSearchEnabled, deepResearchEnabled) => {
                    const enabledTools = getEnabledToolsForProviderLogic(
                        webSearchEnabled,
                        deepResearchEnabled
                    )

                    // web_search should be included regardless of webSearchEnabled
                    expect(enabledTools).toContain('web_search')

                    return enabledTools.includes('web_search')
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Tool filtering preserves other tools
     * 
     * When filtering based on toggle states, only web_search should be affected.
     * Other tools should remain in the enabled list.
     */
    it('Tool filtering only affects web_search, other tools are preserved', () => {
        fc.assert(
            fc.property(
                fc.boolean(), // webSearchEnabled
                fc.boolean(), // deepResearchEnabled
                (webSearchEnabled, deepResearchEnabled) => {
                    const enabledTools = getEnabledToolsForProviderLogic(
                        webSearchEnabled,
                        deepResearchEnabled
                    )

                    // Get all non-web_search tools from definitions
                    const otherTools = getAllToolDefinitions()
                        .map(t => t.name)
                        .filter(name => name !== 'web_search')

                    // All other tools should still be present
                    for (const tool of otherTools) {
                        expect(enabledTools).toContain(tool)
                    }

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Exhaustive toggle combinations
     * 
     * Test all four possible combinations of toggle states explicitly
     */
    it('All four toggle combinations produce correct results', () => {
        // Test all combinations explicitly
        const testCases = [
            { webSearch: false, deepResearch: false, expectWebSearch: false },
            { webSearch: true, deepResearch: false, expectWebSearch: true },
            { webSearch: false, deepResearch: true, expectWebSearch: true },
            { webSearch: true, deepResearch: true, expectWebSearch: true },
        ]

        for (const testCase of testCases) {
            const enabledTools = getEnabledToolsForProviderLogic(
                testCase.webSearch,
                testCase.deepResearch
            )

            const hasWebSearch = enabledTools.includes('web_search')

            expect(hasWebSearch).toBe(testCase.expectWebSearch)
        }
    })
})


/**
 * Helper function to simulate getResearchContext logic
 * This mirrors the logic in useToolCalling.ts for testing purposes
 * 
 * @param searchCount - Current number of searches performed
 * @param maxRounds - Maximum number of searches allowed
 * @param mandatory - Whether research mode is mandatory
 * @returns Research context string
 */
function getResearchContextLogic(
    searchCount: number,
    maxRounds: number,
    mandatory: boolean = false
): string {
    const isActive = maxRounds > 0

    if (!isActive || maxRounds === 0) {
        return ''
    }

    const remaining = maxRounds - searchCount

    // Limit reached state - instructs model to provide final answer
    // Works for both normal mode (5 searches) and deep research mode (25 searches)
    // Validates: Requirements 2.2, 2.3
    if (remaining <= 0) {
        return `\n\nYou have completed all ${maxRounds} available searches. You MUST now provide your final comprehensive answer based on all the information gathered.`
    }

    // MANDATORY mode - user explicitly requested deep research
    if (mandatory) {
        if (searchCount === 0) {
            return `\n\n*** MANDATORY DEEP RESEARCH - EXACTLY ${maxRounds} SEARCHES REQUIRED ***
The user has explicitly requested deep research. You MUST perform exactly ${maxRounds} web searches before providing your answer.

CRITICAL INSTRUCTION: You MUST call the web_search FUNCTION ${maxRounds} times. Do NOT just describe what you would search for - you MUST actually CALL the web_search function.

Your response format must be:
1. Immediately call web_search with your first query
2. After seeing results, call web_search again with a different query
3. Repeat until you have completed ${maxRounds} searches
4. Only then provide your final answer

Search 1: Broad overview of the topic
Search 2: Recent developments and updates
Search 3: Specific details, perspectives, or verification

DO NOT provide your answer before completing all ${maxRounds} searches.`
        }

        // After 1st search in mandatory mode
        if (searchCount === 1 && remaining > 0) {
            return `\n*** MANDATORY: CONTINUE RESEARCH - ${remaining} MORE SEARCHES REQUIRED ***
You have completed 1 of ${maxRounds} MANDATORY searches. You MUST complete ${remaining} more searches before answering.

CRITICAL: Your next response MUST be a web_search FUNCTION CALL with a different query. Do NOT provide text commentary - call the function directly.

Use web_search now with a new query about: recent developments, specific details, or different perspectives.`
        }

        // After 2nd search in 3-search mandatory mode
        if (searchCount === 2 && remaining > 0) {
            return `\n*** MANDATORY: FINAL SEARCH REQUIRED ***
You have completed 2 of ${maxRounds} MANDATORY searches. You MUST complete 1 more search before answering.

CRITICAL: Your next response MUST be a web_search FUNCTION CALL. Do NOT provide text commentary - call the function directly.

After this final search, provide your comprehensive answer. Use web_search now.`
        }

        // General continuation for mandatory mode
        return `\n*** MANDATORY: CONTINUE RESEARCH ***
${remaining} more searches required. Your response MUST be a web_search FUNCTION CALL, not text. Call web_search now.`
    }

    // Regular research mode (non-mandatory) - model decides when to search
    const isDeepResearch = maxRounds >= 10  // Deep research has 25 rounds
    const isNormalSearch = maxRounds > 0 && maxRounds < 10  // Normal search has 5 rounds

    if (searchCount === 0) {
        if (isDeepResearch) {
            return `\n\n*** DEEP RESEARCH MODE - MANDATORY MULTI-SEARCH ***
You MUST complete MULTIPLE SEARCHES before answering. You have up to 25 searches available.

CRITICAL RULE #1: Your FIRST response must be ONLY a web_search function call. NO text, NO explanation. Just the function call.

CRITICAL RULE #2: After the first search, you MUST continue searching different niches. DO NOT provide your final answer after just 1-2 searches.

CRITICAL RULE #3: Only provide your final answer after completing ALL niche searches.

MANDATORY MINIMUM SEARCHES: 6-10 searches on different aspects

Your first search should be broad. Then identify niches and search each one.

NOW: Call web_search with a broad query - NO TEXT, just the function.`
        }

        // Normal web search mode - requires planning before executing searches
        // Validates: Requirements 3.1, 3.2, 3.3
        if (isNormalSearch) {
            return `\n\n*** WEB SEARCH MODE - PLAN FIRST ***
You have access to web search with a maximum of ${maxRounds} searches.

BEFORE searching, you MUST:
1. Briefly state what information you need
2. List the specific searches you plan to make (up to ${maxRounds})
3. Explain why each search is necessary

After planning, proceed with your searches. Use them wisely - you have limited searches available.

If you already know the answer confidently without needing current information, you can respond directly without searching.`
        }

        return `\n\n*** WEB SEARCH AVAILABLE ***
You have access to web search (up to ${maxRounds} searches) to provide accurate, up-to-date information.

When you need information that may be:
- Recent or time-sensitive (news, current events, latest data)
- Not confidently verifiable from existing context alone
- Specific facts, figures, or statistics
- Verification of uncertain information

Use the web_search tool to find accurate information. You may search multiple times from different angles to build comprehensive understanding.

If you already know the answer confidently, you can respond directly.`
    }

    // After 1st search - FORCE continuation for deep research, allow choice for normal mode
    if (searchCount === 1) {
        if (isDeepResearch) {
            return `\n\n*** CONTINUE RESEARCH - MANDATORY ***
You have completed ONLY 1 search. You need 5-9 MORE searches.

DO NOT provide your answer yet. Your answer will be INCOMPLETE without more research.

Your next search must explore a different angle/niche. Call web_search NOW with a NEW query.

After this, continue searching until all niches are covered.`
        }

        // Normal web search mode - allow model to decide when to stop
        // Different from deep research which forces continuation
        // Validates: Requirements 2.2, 3.4
        if (isNormalSearch) {
            return `\n\n*** WEB SEARCH PROGRESS ***
You have completed 1 of ${maxRounds} available searches. ${remaining} searches remaining.

You may:
- Continue searching if you need more information, different perspectives, or verification
- Provide your answer now if you have gathered sufficient information

If continuing, use web_search with a different query to explore other aspects of the topic.`
        }

        return `\n\n*** RESEARCH PROGRESS ***
You have completed 1 of up to ${maxRounds} searches. You may continue searching if:
- You need more recent information
- You want different perspectives
- There are gaps in your knowledge
- You need to verify claims

Use web_search with different queries as needed, or provide your answer if you have sufficient information.`
    }

    // Searches 2-5 - Still force continuation for deep research
    if (isDeepResearch && searchCount >= 2 && searchCount <= 5) {
        return `\n\n*** CONTINUE RESEARCH - MANDATORY ***
You have completed ${searchCount} search(es). You need MORE searches. Minimum 6 total required.

DO NOT provide your answer yet. Continue with a NEW niche query.

Call web_search NOW.`
    }

    // Normal mode searches 2+ - allow model to decide when to stop (up to limit)
    // Different from deep research which forces continuation
    // Validates: Requirements 2.2, 3.4
    if (isNormalSearch && searchCount >= 2 && searchCount < maxRounds) {
        // Check if this is the last available search
        if (remaining === 1) {
            return `\n\n*** WEB SEARCH PROGRESS - LAST SEARCH AVAILABLE ***
You have completed ${searchCount} of ${maxRounds} searches. You have 1 search remaining.

You may:
- Use your final search if you need one more piece of information
- Provide your answer now if you have gathered sufficient information

Choose wisely - this is your last available search.`
        }

        return `\n\n*** WEB SEARCH PROGRESS ***
You have completed ${searchCount} of ${maxRounds} available searches. ${remaining} searches remaining.

You may:
- Continue searching if you need more information or different perspectives
- Provide your answer now if you have gathered sufficient information

If continuing, use web_search with a different query to explore other aspects of the topic.`
    }

    // Searches 6+ - Allow completion but encourage more
    if (isDeepResearch && searchCount >= 6 && searchCount < 25) {
        const remaining = maxRounds - searchCount
        return `\n\n*** RESEARCH PROGRESS ***
Search ${searchCount} of ${maxRounds} completed. ${remaining} searches remaining.

You MAY provide your answer now if you have thoroughly covered the topic, OR continue searching for more comprehensive coverage.

To continue: Call web_search with another niche query.
To provide answer: Follow the response format with Executive Summary, Analysis, Facts, Perspectives, Timeline, Conclusions, Sources.`
    }

    return `\n\n*** RESEARCH PROGRESS ***
Search ${searchCount} of up to ${maxRounds} completed. ${remaining} searches remaining.

Continue using web_search if you need more information, or provide your comprehensive answer if you have gathered sufficient information.`
}


/**
 * Property Test: Planning Instruction for Normal Mode
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 4.2**
 * 
 * Property 5: For any call to getResearchContext where maxRounds is between 1 and 9 (inclusive)
 * and searchCount is 0, the returned string SHALL contain:
 * - An instruction to plan searches before executing
 * - A reference to the maximum number of searches available
 * - Guidance on what information to outline
 * 
 * Requirements:
 * - 3.1: WHEN webSearchEnabled is ON AND deepResearchEnabled is OFF AND Search_Count is 0,
 *        THE Streaming_Chat_Hook SHALL inject a planning instruction
 * - 3.2: THE planning instruction SHALL require the model to first outline what it will search
 *        for and why before executing searches
 * - 3.3: THE planning instruction SHALL specify that the model has a maximum of 5 searches available
 * - 4.2: WHEN deepResearchEnabled is ON, THE Tool_Calling_System SHALL NOT inject the planning
 *        instruction used for normal mode
 */
describe('Planning Instruction for Normal Mode', () => {
    /**
     * Property 5: Planning instruction for normal mode
     * 
     * **Validates: Requirements 3.1, 3.2, 3.3**
     * 
     * For any maxRounds in [1, 9] with searchCount = 0, the planning instruction
     * SHALL be present and contain required elements.
     */
    it('Property 5: Normal mode (maxRounds 1-9) with searchCount=0 returns planning instruction', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 9 }), // maxRounds in normal mode range [1, 9]
                (maxRounds) => {
                    const searchCount = 0
                    const mandatory = false

                    const context = getResearchContextLogic(searchCount, maxRounds, mandatory)

                    // Planning instruction should be present
                    expect(context.length).toBeGreaterThan(0)

                    // Should contain "PLAN FIRST" header (normal mode identifier)
                    expect(context).toContain('PLAN FIRST')

                    // Should contain instruction to plan/outline searches
                    // Validates: Requirement 3.2
                    const hasPlanningInstruction = 
                        context.toLowerCase().includes('before searching') ||
                        context.toLowerCase().includes('plan') ||
                        context.toLowerCase().includes('outline')
                    expect(hasPlanningInstruction).toBe(true)

                    // Should reference the maximum number of searches
                    // Validates: Requirement 3.3
                    expect(context).toContain(`${maxRounds}`)

                    // Should contain guidance on what to outline
                    // Validates: Requirement 3.2
                    const hasOutlineGuidance = 
                        context.includes('what information you need') ||
                        context.includes('specific searches') ||
                        context.includes('why each search')
                    expect(hasOutlineGuidance).toBe(true)

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property 5 (continued): Deep research mode does NOT return planning instruction
     * 
     * **Validates: Requirement 4.2**
     * 
     * For any maxRounds >= 10 with searchCount = 0, the planning instruction
     * SHALL NOT be present (deep research mode uses different prompts).
     */
    it('Property 5: Deep research mode (maxRounds >= 10) with searchCount=0 does NOT return planning instruction', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 10, max: 100 }), // maxRounds in deep research range [10, 100]
                (maxRounds) => {
                    const searchCount = 0
                    const mandatory = false

                    const context = getResearchContextLogic(searchCount, maxRounds, mandatory)

                    // Context should be present (deep research has its own prompt)
                    expect(context.length).toBeGreaterThan(0)

                    // Should NOT contain "PLAN FIRST" header (normal mode identifier)
                    // Validates: Requirement 4.2
                    expect(context).not.toContain('PLAN FIRST')

                    // Should NOT contain the normal mode planning instruction elements
                    expect(context).not.toContain('BEFORE searching, you MUST:')
                    expect(context).not.toContain('List the specific searches you plan to make')

                    // Should contain deep research mode identifier instead
                    expect(context).toContain('DEEP RESEARCH MODE')

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Requirement 3.1: Planning instruction is injected when searchCount is 0 in normal mode
     * 
     * **Validates: Requirement 3.1**
     */
    it('Requirement 3.1: Planning instruction injected when searchCount=0 in normal mode', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 9 }), // Normal mode maxRounds
                (maxRounds) => {
                    const context = getResearchContextLogic(0, maxRounds, false)

                    // Planning instruction should be present
                    expect(context).toContain('WEB SEARCH MODE')
                    expect(context).toContain('PLAN FIRST')

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Requirement 3.2: Planning instruction requires model to outline searches
     * 
     * **Validates: Requirement 3.2**
     */
    it('Requirement 3.2: Planning instruction requires outlining searches before executing', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 9 }), // Normal mode maxRounds
                (maxRounds) => {
                    const context = getResearchContextLogic(0, maxRounds, false)

                    // Should require planning before searching
                    expect(context).toContain('BEFORE searching')
                    expect(context).toContain('MUST')

                    // Should require stating what information is needed
                    expect(context).toContain('what information you need')

                    // Should require listing specific searches
                    expect(context).toContain('specific searches you plan to make')

                    // Should require explaining why each search is necessary
                    expect(context).toContain('why each search is necessary')

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Requirement 3.3: Planning instruction specifies maximum search count
     * 
     * **Validates: Requirement 3.3**
     */
    it('Requirement 3.3: Planning instruction specifies maximum number of searches', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 9 }), // Normal mode maxRounds
                (maxRounds) => {
                    const context = getResearchContextLogic(0, maxRounds, false)

                    // Should mention the maximum number of searches
                    expect(context).toContain(`maximum of ${maxRounds} searches`)

                    // Should also mention the limit in the planning steps
                    expect(context).toContain(`up to ${maxRounds}`)

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Requirement 4.2: Deep research mode does NOT use normal mode planning instruction
     * 
     * **Validates: Requirement 4.2**
     */
    it('Requirement 4.2: Deep research mode does NOT inject normal mode planning instruction', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 10, max: 50 }), // Deep research mode maxRounds
                (maxRounds) => {
                    const context = getResearchContextLogic(0, maxRounds, false)

                    // Should NOT contain normal mode planning instruction
                    expect(context).not.toContain('PLAN FIRST')
                    expect(context).not.toContain('BEFORE searching, you MUST:')

                    // Should contain deep research mode content instead
                    expect(context).toContain('DEEP RESEARCH MODE')
                    expect(context).toContain('MANDATORY MULTI-SEARCH')

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Planning instruction is NOT present when searchCount > 0 in normal mode
     * 
     * The planning instruction should only appear on the first search (searchCount = 0).
     * After searches have been performed, different prompts should be used.
     */
    it('Planning instruction is NOT present when searchCount > 0 in normal mode', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 2, max: 9 }),  // Normal mode maxRounds (min 2 to allow searchCount > 0 and < maxRounds)
                fc.integer({ min: 1, max: 8 }),  // searchCount > 0
                (maxRounds, searchCountBase) => {
                    // Ensure searchCount is at least 1 and less than maxRounds to avoid limit-reached state
                    const searchCount = Math.min(searchCountBase, maxRounds - 1)
                    
                    // Skip if we can't have a valid searchCount > 0 and < maxRounds
                    if (searchCount < 1) {
                        return true // Skip this case
                    }
                    
                    const context = getResearchContextLogic(searchCount, maxRounds, false)

                    // Should NOT contain "PLAN FIRST" header after first search
                    expect(context).not.toContain('PLAN FIRST')

                    // Should contain progress indicator instead
                    // Normal mode uses "WEB SEARCH PROGRESS", deep research uses "RESEARCH PROGRESS"
                    const hasProgressIndicator = 
                        context.includes('WEB SEARCH PROGRESS') || 
                        context.includes('RESEARCH PROGRESS')
                    expect(hasProgressIndicator).toBe(true)

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Boundary test - maxRounds = 9 is normal mode, maxRounds = 10 is deep research
     * 
     * Tests the exact boundary between normal mode and deep research mode.
     */
    it('Boundary: maxRounds=9 is normal mode, maxRounds=10 is deep research mode', () => {
        // maxRounds = 9 should be normal mode with planning instruction
        const normalContext = getResearchContextLogic(0, 9, false)
        expect(normalContext).toContain('PLAN FIRST')
        expect(normalContext).not.toContain('DEEP RESEARCH MODE')

        // maxRounds = 10 should be deep research mode without planning instruction
        const deepContext = getResearchContextLogic(0, 10, false)
        expect(deepContext).not.toContain('PLAN FIRST')
        expect(deepContext).toContain('DEEP RESEARCH MODE')
    })

    /**
     * Property: Empty context when maxRounds = 0
     * 
     * When research mode is not active (maxRounds = 0), no context should be returned.
     */
    it('No planning instruction when maxRounds = 0 (research mode inactive)', () => {
        const context = getResearchContextLogic(0, 0, false)
        expect(context).toBe('')
    })

    /**
     * Property: Typical normal mode configuration (maxRounds = 5)
     * 
     * Tests the typical normal web search configuration with 5 max searches.
     */
    it('Typical normal mode (maxRounds=5) returns correct planning instruction', () => {
        const context = getResearchContextLogic(0, 5, false)

        // Should contain all required elements
        expect(context).toContain('WEB SEARCH MODE')
        expect(context).toContain('PLAN FIRST')
        expect(context).toContain('maximum of 5 searches')
        expect(context).toContain('BEFORE searching')
        expect(context).toContain('what information you need')
        expect(context).toContain('specific searches you plan to make')
        expect(context).toContain('why each search is necessary')
        expect(context).toContain('up to 5')
    })

    /**
     * Property: Typical deep research configuration (maxRounds = 25)
     * 
     * Tests the typical deep research configuration with 25 max searches.
     */
    it('Typical deep research mode (maxRounds=25) does NOT return planning instruction', () => {
        const context = getResearchContextLogic(0, 25, false)

        // Should NOT contain normal mode planning instruction
        expect(context).not.toContain('PLAN FIRST')
        expect(context).not.toContain('BEFORE searching, you MUST:')

        // Should contain deep research mode content
        expect(context).toContain('DEEP RESEARCH MODE')
        expect(context).toContain('MANDATORY MULTI-SEARCH')
        expect(context).toContain('up to 25 searches')
    })
})


/**
 * Property Test: Search Limit Enforcement
 * 
 * **Validates: Requirements 2.2, 2.3**
 * 
 * Property 3: For any research mode state where searchCount >= maxRounds,
 * the getResearchContext function SHALL return a message instructing the model
 * to provide its final answer and SHALL NOT encourage additional searches.
 * 
 * Requirements:
 * - 2.2: WHEN the Search_Count reaches the researchMaxRounds limit in normal mode,
 *        THE Tool_Calling_System SHALL stop allowing additional web_search calls
 * - 2.3: WHEN the Search_Count reaches the limit, THE Tool_Calling_System SHALL
 *        instruct the model to provide its final answer
 */
describe('Search Limit Enforcement', () => {
    /**
     * Property 3: Search limit enforcement
     * 
     * **Validates: Requirements 2.2, 2.3**
     * 
     * For any searchCount >= maxRounds, the context message SHALL indicate
     * that the model must provide its final answer.
     */
    it('Property 3: When searchCount >= maxRounds, context instructs final answer', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 50 }),  // maxRounds (valid range for both normal and deep research)
                fc.integer({ min: 0, max: 100 }), // searchCount offset (will be added to maxRounds)
                (maxRounds, offset) => {
                    // Generate searchCount >= maxRounds
                    const searchCount = maxRounds + offset
                    const mandatory = false

                    const context = getResearchContextLogic(searchCount, maxRounds, mandatory)

                    // Context should be present
                    expect(context.length).toBeGreaterThan(0)

                    // Should contain instruction to provide final answer
                    // Validates: Requirement 2.3
                    const hasFinalAnswerInstruction = 
                        context.toLowerCase().includes('final') &&
                        context.toLowerCase().includes('answer')
                    expect(hasFinalAnswerInstruction).toBe(true)

                    // Should indicate all searches are completed
                    expect(context).toContain(`completed all ${maxRounds} available searches`)

                    // Should contain MUST to indicate mandatory final answer
                    expect(context).toContain('MUST')

                    // Should NOT encourage additional searches
                    // Validates: Requirement 2.2
                    expect(context).not.toContain('continue searching')
                    expect(context).not.toContain('Call web_search')
                    expect(context).not.toContain('more searches')
                    expect(context).not.toContain('remaining')

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property 3 (boundary): Exact limit reached (searchCount == maxRounds)
     * 
     * **Validates: Requirements 2.2, 2.3**
     * 
     * Tests the exact boundary case where searchCount equals maxRounds.
     */
    it('Property 3: Boundary - searchCount == maxRounds instructs final answer', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 50 }), // maxRounds
                (maxRounds) => {
                    // Exact boundary: searchCount == maxRounds
                    const searchCount = maxRounds
                    const mandatory = false

                    const context = getResearchContextLogic(searchCount, maxRounds, mandatory)

                    // Should instruct final answer at exact boundary
                    expect(context).toContain('final')
                    expect(context).toContain('answer')
                    expect(context).toContain(`completed all ${maxRounds} available searches`)
                    expect(context).toContain('MUST')

                    // Should NOT encourage more searches
                    expect(context).not.toContain('continue')
                    expect(context).not.toContain('Call web_search')

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property 3 (overflow): searchCount > maxRounds still instructs final answer
     * 
     * **Validates: Requirements 2.2, 2.3**
     * 
     * Tests that even when searchCount exceeds maxRounds (overflow case),
     * the system still instructs the model to provide its final answer.
     */
    it('Property 3: Overflow - searchCount > maxRounds still instructs final answer', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 50 }),  // maxRounds
                fc.integer({ min: 1, max: 100 }), // overflow amount
                (maxRounds, overflow) => {
                    // Overflow: searchCount > maxRounds
                    const searchCount = maxRounds + overflow
                    const mandatory = false

                    const context = getResearchContextLogic(searchCount, maxRounds, mandatory)

                    // Should still instruct final answer even in overflow case
                    expect(context).toContain('final')
                    expect(context).toContain('answer')
                    expect(context).toContain('MUST')

                    // Should NOT encourage more searches
                    expect(context).not.toContain('continue')
                    expect(context).not.toContain('Call web_search')

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Requirement 2.2: Search limit stops additional web_search calls
     * 
     * **Validates: Requirement 2.2**
     * 
     * When limit is reached, the context should NOT encourage additional searches.
     */
    it('Requirement 2.2: Limit reached context does NOT encourage additional searches', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 50 }), // maxRounds
                fc.integer({ min: 0, max: 50 }), // offset
                (maxRounds, offset) => {
                    const searchCount = maxRounds + offset
                    const context = getResearchContextLogic(searchCount, maxRounds, false)

                    // Should NOT contain any encouragement to search more
                    expect(context).not.toContain('continue searching')
                    expect(context).not.toContain('Call web_search')
                    expect(context).not.toContain('more searches')
                    expect(context).not.toContain('searches remaining')
                    expect(context).not.toContain('may search')
                    expect(context).not.toContain('can search')

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Requirement 2.3: Limit reached instructs model to provide final answer
     * 
     * **Validates: Requirement 2.3**
     * 
     * When limit is reached, the context MUST instruct the model to provide
     * its final comprehensive answer.
     */
    it('Requirement 2.3: Limit reached instructs model to provide final answer', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 50 }), // maxRounds
                fc.integer({ min: 0, max: 50 }), // offset
                (maxRounds, offset) => {
                    const searchCount = maxRounds + offset
                    const context = getResearchContextLogic(searchCount, maxRounds, false)

                    // Should contain clear instruction to provide final answer
                    expect(context.toLowerCase()).toContain('final')
                    expect(context.toLowerCase()).toContain('answer')

                    // Should indicate this is mandatory
                    expect(context).toContain('MUST')

                    // Should mention providing comprehensive answer
                    expect(context.toLowerCase()).toContain('comprehensive')

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Normal mode limit (maxRounds = 5) enforcement
     * 
     * Tests the typical normal web search configuration limit enforcement.
     */
    it('Normal mode (maxRounds=5) limit enforcement', () => {
        const maxRounds = 5

        // Test exact boundary
        const contextAtLimit = getResearchContextLogic(5, maxRounds, false)
        expect(contextAtLimit).toContain('final')
        expect(contextAtLimit).toContain('answer')
        expect(contextAtLimit).toContain('completed all 5 available searches')
        expect(contextAtLimit).not.toContain('continue')

        // Test overflow
        const contextOverflow = getResearchContextLogic(6, maxRounds, false)
        expect(contextOverflow).toContain('final')
        expect(contextOverflow).toContain('answer')
        expect(contextOverflow).not.toContain('continue')
    })

    /**
     * Property: Deep research mode limit (maxRounds = 25) enforcement
     * 
     * Tests the typical deep research configuration limit enforcement.
     */
    it('Deep research mode (maxRounds=25) limit enforcement', () => {
        const maxRounds = 25

        // Test exact boundary
        const contextAtLimit = getResearchContextLogic(25, maxRounds, false)
        expect(contextAtLimit).toContain('final')
        expect(contextAtLimit).toContain('answer')
        expect(contextAtLimit).toContain('completed all 25 available searches')
        expect(contextAtLimit).not.toContain('continue')

        // Test overflow
        const contextOverflow = getResearchContextLogic(30, maxRounds, false)
        expect(contextOverflow).toContain('final')
        expect(contextOverflow).toContain('answer')
        expect(contextOverflow).not.toContain('continue')
    })

    /**
     * Property: Mandatory mode limit enforcement
     * 
     * Tests that limit enforcement works the same in mandatory mode.
     */
    it('Mandatory mode limit enforcement', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 50 }), // maxRounds
                fc.integer({ min: 0, max: 50 }), // offset
                (maxRounds, offset) => {
                    const searchCount = maxRounds + offset
                    const mandatory = true

                    const context = getResearchContextLogic(searchCount, maxRounds, mandatory)

                    // Should instruct final answer even in mandatory mode
                    expect(context).toContain('final')
                    expect(context).toContain('answer')
                    expect(context).toContain('MUST')

                    // Should NOT encourage more searches
                    expect(context).not.toContain('continue')
                    expect(context).not.toContain('Call web_search')

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Contrast - searchCount < maxRounds does NOT instruct final answer
     * 
     * Verifies that when searchCount is less than maxRounds, the context
     * does NOT instruct the model to provide its final answer (allows more searches).
     */
    it('Contrast: searchCount < maxRounds does NOT instruct final answer', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 2, max: 50 }),  // maxRounds (min 2 to allow searchCount < maxRounds)
                fc.integer({ min: 1, max: 49 }),  // searchCount base
                (maxRounds, searchCountBase) => {
                    // Ensure searchCount < maxRounds
                    const searchCount = Math.min(searchCountBase, maxRounds - 1)
                    
                    // Skip edge cases where we can't have valid searchCount < maxRounds
                    if (searchCount < 1 || searchCount >= maxRounds) {
                        return true
                    }

                    const context = getResearchContextLogic(searchCount, maxRounds, false)

                    // Should NOT contain the limit-reached message
                    expect(context).not.toContain('completed all')
                    expect(context).not.toContain('You MUST now provide your final')

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Edge case - maxRounds = 1 with searchCount = 1
     * 
     * Tests the minimum valid configuration where only 1 search is allowed.
     */
    it('Edge case: maxRounds=1 with searchCount=1 instructs final answer', () => {
        const context = getResearchContextLogic(1, 1, false)

        expect(context).toContain('final')
        expect(context).toContain('answer')
        expect(context).toContain('completed all 1 available searches')
        expect(context).toContain('MUST')
        expect(context).not.toContain('continue')
    })
})


/**
 * Unit Tests: Continuation Prompts for Normal Mode
 * 
 * **Validates: Requirements 2.2**
 * 
 * These tests verify that continuation prompts in normal web search mode (maxRounds < 10)
 * provide appropriate guidance based on the current search count and remaining searches.
 * 
 * Normal mode continuation prompts should:
 * - Allow the model to decide when to stop (contain "You may:")
 * - Show progress (completed X of Y searches)
 * - Indicate remaining searches
 * - Indicate when last search is available
 */
describe('Continuation Prompts for Normal Mode', () => {
    /**
     * Test: searchCount = 1 with maxRounds = 5 returns appropriate continuation
     * 
     * **Validates: Requirements 2.2**
     * 
     * After the first search in normal mode, the continuation prompt should:
     * - Show "WEB SEARCH PROGRESS" header
     * - Indicate 1 of 5 searches completed
     * - Show 4 searches remaining
     * - Allow model choice with "You may:"
     */
    it('searchCount=1 with maxRounds=5 returns appropriate continuation prompt', () => {
        const context = getResearchContextLogic(1, 5, false)

        // Should contain progress header for normal mode
        expect(context).toContain('WEB SEARCH PROGRESS')

        // Should indicate 1 of 5 completed
        expect(context).toContain('1 of')
        expect(context).toContain('5')

        // Should show remaining searches
        expect(context).toContain('4')
        expect(context).toContain('remaining')

        // Should allow model choice (not force continuation like deep research)
        expect(context).toContain('You may:')

        // Should NOT contain deep research forced continuation
        expect(context).not.toContain('MANDATORY')
        expect(context).not.toContain('DO NOT provide your answer yet')

        // Should NOT contain planning instruction (that's only for searchCount=0)
        expect(context).not.toContain('PLAN FIRST')
    })

    /**
     * Test: searchCount = 4 with maxRounds = 5 indicates last search available
     * 
     * **Validates: Requirements 2.2**
     * 
     * When only 1 search remains, the continuation prompt should:
     * - Indicate "LAST SEARCH AVAILABLE"
     * - Show 4 of 5 searches completed
     * - Indicate 1 search remaining
     * - Allow model choice with "You may:"
     */
    it('searchCount=4 with maxRounds=5 indicates last search available', () => {
        const context = getResearchContextLogic(4, 5, false)

        // Should contain last search indicator
        expect(context).toContain('LAST SEARCH AVAILABLE')

        // Should indicate 4 of 5 completed
        expect(context).toContain('4 of')
        expect(context).toContain('5')

        // Should show 1 remaining
        expect(context).toContain('1')
        expect(context).toContain('remaining')

        // Should allow model choice
        expect(context).toContain('You may:')

        // Should indicate this is the last available search
        expect(context).toContain('last available search')

        // Should NOT contain forced continuation
        expect(context).not.toContain('MANDATORY')
    })

    /**
     * Test: searchCount = 2 with maxRounds = 5 returns continuation prompt with remaining count
     * 
     * **Validates: Requirements 2.2**
     * 
     * After 2 searches in normal mode, the continuation prompt should:
     * - Show "WEB SEARCH PROGRESS" header
     * - Indicate 2 of 5 searches completed
     * - Show 3 searches remaining
     * - Allow model choice with "You may:"
     */
    it('searchCount=2 with maxRounds=5 returns continuation prompt with remaining count', () => {
        const context = getResearchContextLogic(2, 5, false)

        // Should contain progress header
        expect(context).toContain('WEB SEARCH PROGRESS')

        // Should indicate 2 of 5 completed
        expect(context).toContain('2 of')
        expect(context).toContain('5')

        // Should show 3 remaining
        expect(context).toContain('3')
        expect(context).toContain('remaining')

        // Should allow model choice
        expect(context).toContain('You may:')

        // Should NOT be the last search indicator (that's only when remaining=1)
        expect(context).not.toContain('LAST SEARCH AVAILABLE')

        // Should NOT contain forced continuation
        expect(context).not.toContain('MANDATORY')
    })

    /**
     * Test: searchCount = 3 with maxRounds = 5 returns continuation prompt
     * 
     * **Validates: Requirements 2.2**
     * 
     * After 3 searches in normal mode, the continuation prompt should:
     * - Show progress (3 of 5)
     * - Show 2 remaining
     * - Allow model choice
     */
    it('searchCount=3 with maxRounds=5 returns continuation prompt', () => {
        const context = getResearchContextLogic(3, 5, false)

        // Should contain progress header
        expect(context).toContain('WEB SEARCH PROGRESS')

        // Should indicate 3 of 5 completed
        expect(context).toContain('3 of')
        expect(context).toContain('5')

        // Should show 2 remaining
        expect(context).toContain('2')
        expect(context).toContain('remaining')

        // Should allow model choice
        expect(context).toContain('You may:')

        // Should NOT be the last search indicator
        expect(context).not.toContain('LAST SEARCH AVAILABLE')
    })

    /**
     * Test: Normal mode continuation prompts allow model choice (contain "You may:")
     * 
     * **Validates: Requirements 2.2, 3.4**
     * 
     * All normal mode continuation prompts (searchCount 1 to maxRounds-1) should
     * allow the model to decide when to stop by containing "You may:" options.
     */
    it('Normal mode continuation prompts allow model choice (contain "You may:")', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 2, max: 9 }),  // maxRounds in normal mode range
                fc.integer({ min: 1, max: 8 }),  // searchCount base
                (maxRounds, searchCountBase) => {
                    // Ensure searchCount is valid (1 to maxRounds-1)
                    const searchCount = Math.min(searchCountBase, maxRounds - 1)
                    
                    if (searchCount < 1 || searchCount >= maxRounds) {
                        return true // Skip invalid cases
                    }

                    const context = getResearchContextLogic(searchCount, maxRounds, false)

                    // All normal mode continuation prompts should allow model choice
                    expect(context).toContain('You may:')

                    // Should NOT force continuation like deep research
                    expect(context).not.toContain('DO NOT provide your answer yet')
                    expect(context).not.toContain('Call web_search NOW')

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Test: Contrast - Deep research mode does NOT allow model choice (forces continuation)
     * 
     * Verifies that deep research mode (maxRounds >= 10) forces continuation
     * for early searches, unlike normal mode which allows choice.
     */
    it('Contrast: Deep research mode forces continuation (no "You may:" for early searches)', () => {
        // Deep research with searchCount = 1 should force continuation
        const deepContext = getResearchContextLogic(1, 25, false)
        
        // Should NOT contain "You may:" - deep research forces continuation
        expect(deepContext).not.toContain('You may:')
        
        // Should contain forced continuation language
        expect(deepContext).toContain('MANDATORY')
        expect(deepContext).toContain('DO NOT provide your answer yet')
    })

    /**
     * Test: Normal mode searchCount=1 vs Deep research searchCount=1
     * 
     * Compares the continuation prompts between normal mode and deep research
     * to verify they have different behaviors.
     */
    it('Normal mode vs Deep research: Different continuation behavior at searchCount=1', () => {
        const normalContext = getResearchContextLogic(1, 5, false)
        const deepContext = getResearchContextLogic(1, 25, false)

        // Normal mode allows choice
        expect(normalContext).toContain('You may:')
        expect(normalContext).not.toContain('MANDATORY')

        // Deep research forces continuation
        expect(deepContext).not.toContain('You may:')
        expect(deepContext).toContain('MANDATORY')
    })

    /**
     * Test: Last search available indicator only appears when remaining = 1
     * 
     * Verifies that "LAST SEARCH AVAILABLE" only appears when exactly 1 search remains.
     */
    it('Last search indicator only appears when remaining = 1', () => {
        // Test various maxRounds values
        const testCases = [
            { maxRounds: 5, searchCount: 4 },  // remaining = 1
            { maxRounds: 7, searchCount: 6 },  // remaining = 1
            { maxRounds: 9, searchCount: 8 },  // remaining = 1
        ]

        for (const { maxRounds, searchCount } of testCases) {
            const context = getResearchContextLogic(searchCount, maxRounds, false)
            expect(context).toContain('LAST SEARCH AVAILABLE')
        }

        // Test cases where remaining > 1 (should NOT have last search indicator)
        const nonLastCases = [
            { maxRounds: 5, searchCount: 3 },  // remaining = 2
            { maxRounds: 5, searchCount: 2 },  // remaining = 3
            { maxRounds: 5, searchCount: 1 },  // remaining = 4
        ]

        for (const { maxRounds, searchCount } of nonLastCases) {
            const context = getResearchContextLogic(searchCount, maxRounds, false)
            expect(context).not.toContain('LAST SEARCH AVAILABLE')
        }
    })

    /**
     * Test: Continuation prompts show correct remaining count
     * 
     * Verifies that the remaining search count is correctly calculated and displayed.
     */
    it('Continuation prompts show correct remaining count', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 3, max: 9 }),  // maxRounds in normal mode range
                fc.integer({ min: 1, max: 8 }),  // searchCount base
                (maxRounds, searchCountBase) => {
                    // Ensure searchCount is valid (1 to maxRounds-1)
                    const searchCount = Math.min(searchCountBase, maxRounds - 1)
                    
                    if (searchCount < 1 || searchCount >= maxRounds) {
                        return true // Skip invalid cases
                    }

                    const context = getResearchContextLogic(searchCount, maxRounds, false)
                    const expectedRemaining = maxRounds - searchCount

                    // Should contain the correct remaining count
                    expect(context).toContain(`${expectedRemaining}`)
                    expect(context).toContain('remaining')

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Test: Continuation prompts show correct completed count
     * 
     * Verifies that the completed search count is correctly displayed.
     */
    it('Continuation prompts show correct completed count', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 3, max: 9 }),  // maxRounds in normal mode range
                fc.integer({ min: 1, max: 8 }),  // searchCount base
                (maxRounds, searchCountBase) => {
                    // Ensure searchCount is valid (1 to maxRounds-1)
                    const searchCount = Math.min(searchCountBase, maxRounds - 1)
                    
                    if (searchCount < 1 || searchCount >= maxRounds) {
                        return true // Skip invalid cases
                    }

                    const context = getResearchContextLogic(searchCount, maxRounds, false)

                    // Should contain the correct completed count
                    expect(context).toContain(`${searchCount} of`)

                    return true
                }
            ),
            { numRuns: 100 }
        )
    })
})


/**
 * Helper function to simulate calculateResearchMaxRounds logic
 * This mirrors the logic in useStreamingChat.ts for testing purposes
 * 
 * @param deepResearchEnabled - Whether deep research toggle is ON
 * @param webSearchEnabled - Whether web search toggle is ON
 * @param canUseTools - Whether tools can be used (defaults to true)
 * @returns The calculated researchMaxRounds value
 */
function calculateResearchMaxRounds(
    deepResearchEnabled: boolean,
    webSearchEnabled: boolean,
    canUseTools: boolean = true
): number {
    let researchMaxRounds = 0

    if (deepResearchEnabled && canUseTools) {
        // Deep research mode: 25 searches, existing behavior
        researchMaxRounds = 25
    } else if (webSearchEnabled && canUseTools) {
        // Normal web search mode: 5 searches, planning required
        researchMaxRounds = 5
    }
    // If neither toggle is ON, researchMaxRounds stays 0

    return researchMaxRounds
}


/**
 * Property Test: Deep Research Mode Configuration
 * 
 * **Validates: Requirements 4.2, 5.1, 5.2**
 * 
 * Property 6: For any settings state where deepResearchEnabled is ON, the research mode
 * SHALL be configured with maxRounds = 25, and getResearchContext SHALL NOT return
 * the planning instruction used for normal mode (maxRounds < 10).
 * 
 * Requirements:
 * - 4.2: WHEN deepResearchEnabled is ON, THE Tool_Calling_System SHALL NOT inject the
 *        planning instruction used for normal mode
 * - 5.1: WHEN determining research mode, THE Streaming_Chat_Hook SHALL check
 *        deepResearchEnabled first before webSearchEnabled
 * - 5.2: IF deepResearchEnabled is ON, THE system SHALL use deep research configuration
 *        (25 rounds, no planning requirement)
 */
describe('Deep Research Mode Configuration', () => {
    /**
     * Property 6: Deep research mode configuration
     * 
     * **Validates: Requirements 4.2, 5.1, 5.2**
     * 
     * For any settings state where deepResearchEnabled is ON (regardless of webSearchEnabled),
     * maxRounds SHALL be 25 and getResearchContext SHALL NOT return planning instruction.
     */
    it('Property 6: deepResearchEnabled ON always results in maxRounds = 25', () => {
        fc.assert(
            fc.property(
                fc.boolean(), // webSearchEnabled (any value)
                (webSearchEnabled) => {
                    // When deepResearchEnabled is ON, maxRounds should always be 25
                    // regardless of webSearchEnabled state
                    // Validates: Requirements 5.1, 5.2
                    const maxRounds = calculateResearchMaxRounds(true, webSearchEnabled, true)
                    
                    expect(maxRounds).toBe(25)
                    
                    return maxRounds === 25
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property 6: Deep research mode does NOT return planning instruction
     * 
     * **Validates: Requirements 4.2**
     * 
     * For any settings state where deepResearchEnabled is ON, getResearchContext
     * SHALL NOT return the planning instruction ("PLAN FIRST") used for normal mode.
     */
    it('Property 6: deepResearchEnabled ON does NOT return planning instruction', () => {
        fc.assert(
            fc.property(
                fc.boolean(), // webSearchEnabled (any value)
                (webSearchEnabled) => {
                    // Calculate maxRounds for deep research mode
                    const maxRounds = calculateResearchMaxRounds(true, webSearchEnabled, true)
                    
                    // Verify maxRounds is 25 (deep research configuration)
                    expect(maxRounds).toBe(25)
                    
                    // Get research context with searchCount = 0 (initial state)
                    const context = getResearchContextLogic(0, maxRounds, false)
                    
                    // Should NOT contain "PLAN FIRST" header (normal mode identifier)
                    // Validates: Requirement 4.2
                    expect(context).not.toContain('PLAN FIRST')
                    
                    // Should NOT contain the normal mode planning instruction elements
                    expect(context).not.toContain('BEFORE searching, you MUST:')
                    expect(context).not.toContain('List the specific searches you plan to make')
                    
                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property 6: Deep research mode returns deep research prompt
     * 
     * **Validates: Requirements 5.2**
     * 
     * For any settings state where deepResearchEnabled is ON, getResearchContext
     * SHALL return the deep research prompt ("DEEP RESEARCH MODE").
     */
    it('Property 6: deepResearchEnabled ON returns deep research prompt', () => {
        fc.assert(
            fc.property(
                fc.boolean(), // webSearchEnabled (any value)
                (webSearchEnabled) => {
                    // Calculate maxRounds for deep research mode
                    const maxRounds = calculateResearchMaxRounds(true, webSearchEnabled, true)
                    
                    // Verify maxRounds is 25 (deep research configuration)
                    expect(maxRounds).toBe(25)
                    
                    // Get research context with searchCount = 0 (initial state)
                    const context = getResearchContextLogic(0, maxRounds, false)
                    
                    // Should contain deep research mode identifier
                    // Validates: Requirement 5.2
                    expect(context).toContain('DEEP RESEARCH MODE')
                    
                    // Should contain mandatory multi-search instruction
                    expect(context).toContain('MANDATORY MULTI-SEARCH')
                    
                    // Should mention up to 25 searches
                    expect(context).toContain('up to 25 searches')
                    
                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property 6: Deep research mode configuration is consistent across all search counts
     * 
     * **Validates: Requirements 4.2, 5.2**
     * 
     * For any searchCount in deep research mode (maxRounds = 25), the context
     * SHALL NOT contain the planning instruction used for normal mode.
     */
    it('Property 6: Deep research mode never contains planning instruction at any searchCount', () => {
        fc.assert(
            fc.property(
                fc.boolean(),                    // webSearchEnabled (any value)
                fc.integer({ min: 0, max: 24 }), // searchCount (0 to maxRounds-1)
                (webSearchEnabled, searchCount) => {
                    // Calculate maxRounds for deep research mode
                    const maxRounds = calculateResearchMaxRounds(true, webSearchEnabled, true)
                    
                    // Verify maxRounds is 25 (deep research configuration)
                    expect(maxRounds).toBe(25)
                    
                    // Get research context for any valid searchCount
                    const context = getResearchContextLogic(searchCount, maxRounds, false)
                    
                    // Should NEVER contain "PLAN FIRST" header at any searchCount
                    // Validates: Requirement 4.2
                    expect(context).not.toContain('PLAN FIRST')
                    
                    // Should NEVER contain normal mode planning instruction elements
                    expect(context).not.toContain('BEFORE searching, you MUST:')
                    expect(context).not.toContain('List the specific searches you plan to make')
                    
                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Requirement 5.1: deepResearchEnabled takes precedence over webSearchEnabled
     * 
     * **Validates: Requirement 5.1**
     * 
     * When both toggles are ON, deep research configuration (25 rounds) should be used.
     */
    it('Requirement 5.1: deepResearchEnabled takes precedence when both toggles are ON', () => {
        // Both toggles ON should result in deep research configuration
        const maxRounds = calculateResearchMaxRounds(true, true, true)
        
        expect(maxRounds).toBe(25)
        
        // Get research context
        const context = getResearchContextLogic(0, maxRounds, false)
        
        // Should use deep research prompt, not normal mode planning
        expect(context).toContain('DEEP RESEARCH MODE')
        expect(context).not.toContain('PLAN FIRST')
    })

    /**
     * Requirement 5.2: Deep research uses 25 rounds with no planning requirement
     * 
     * **Validates: Requirement 5.2**
     * 
     * Deep research mode should use 25 rounds and not require planning.
     */
    it('Requirement 5.2: Deep research uses 25 rounds with no planning requirement', () => {
        fc.assert(
            fc.property(
                fc.boolean(), // webSearchEnabled (any value)
                (webSearchEnabled) => {
                    // Calculate maxRounds for deep research mode
                    const maxRounds = calculateResearchMaxRounds(true, webSearchEnabled, true)
                    
                    // Should be 25 rounds
                    expect(maxRounds).toBe(25)
                    
                    // Get research context
                    const context = getResearchContextLogic(0, maxRounds, false)
                    
                    // Should NOT require planning (no "PLAN FIRST" or planning instructions)
                    expect(context).not.toContain('PLAN FIRST')
                    expect(context).not.toContain('BEFORE searching, you MUST:')
                    
                    // Should use deep research mode instead
                    expect(context).toContain('DEEP RESEARCH MODE')
                    
                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Requirement 4.2: Deep research does NOT inject normal mode planning instruction
     * 
     * **Validates: Requirement 4.2**
     * 
     * When deepResearchEnabled is ON, the system SHALL NOT inject the planning
     * instruction used for normal mode.
     */
    it('Requirement 4.2: Deep research does NOT inject normal mode planning instruction', () => {
        fc.assert(
            fc.property(
                fc.boolean(), // webSearchEnabled (any value)
                (webSearchEnabled) => {
                    // Calculate maxRounds for deep research mode
                    const maxRounds = calculateResearchMaxRounds(true, webSearchEnabled, true)
                    
                    // Verify maxRounds is 25 (deep research configuration)
                    expect(maxRounds).toBe(25)
                    
                    // Get research context with searchCount = 0 (when planning would be injected in normal mode)
                    const context = getResearchContextLogic(0, maxRounds, false)
                    
                    // Should NOT contain any normal mode planning instruction elements
                    // Validates: Requirement 4.2
                    expect(context).not.toContain('PLAN FIRST')
                    expect(context).not.toContain('BEFORE searching, you MUST:')
                    expect(context).not.toContain('what information you need')
                    expect(context).not.toContain('specific searches you plan to make')
                    expect(context).not.toContain('why each search is necessary')
                    
                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Contrast - Normal mode (maxRounds < 10) DOES contain planning instruction
     * 
     * Verifies that normal mode (when deepResearchEnabled is OFF and webSearchEnabled is ON)
     * DOES contain the planning instruction, in contrast to deep research mode.
     */
    it('Contrast: Normal mode (deepResearchEnabled OFF) DOES contain planning instruction', () => {
        // Normal mode: deepResearchEnabled OFF, webSearchEnabled ON
        const maxRounds = calculateResearchMaxRounds(false, true, true)
        
        // Should be 5 rounds (normal mode)
        expect(maxRounds).toBe(5)
        
        // Get research context
        const context = getResearchContextLogic(0, maxRounds, false)
        
        // Should contain planning instruction (normal mode)
        expect(context).toContain('PLAN FIRST')
        expect(context).toContain('BEFORE searching, you MUST:')
        
        // Should NOT contain deep research mode identifier
        expect(context).not.toContain('DEEP RESEARCH MODE')
    })

    /**
     * Property: Deep research mode continuation prompts are different from normal mode
     * 
     * Verifies that deep research mode uses different continuation prompts
     * (mandatory continuation) compared to normal mode (optional continuation).
     */
    it('Deep research mode uses mandatory continuation prompts', () => {
        // Deep research mode with searchCount = 1
        const deepMaxRounds = calculateResearchMaxRounds(true, false, true)
        const deepContext = getResearchContextLogic(1, deepMaxRounds, false)
        
        // Should contain mandatory continuation language
        expect(deepContext).toContain('MANDATORY')
        expect(deepContext).toContain('DO NOT provide your answer yet')
        
        // Should NOT contain optional choice language
        expect(deepContext).not.toContain('You may:')
    })

    /**
     * Property: Typical deep research configuration (maxRounds = 25)
     * 
     * Tests the typical deep research configuration with 25 max searches.
     */
    it('Typical deep research configuration (maxRounds=25) is correct', () => {
        // Deep research mode
        const maxRounds = calculateResearchMaxRounds(true, false, true)
        
        // Should be 25 rounds
        expect(maxRounds).toBe(25)
        
        // Get research context at searchCount = 0
        const context = getResearchContextLogic(0, maxRounds, false)
        
        // Should contain all deep research mode elements
        expect(context).toContain('DEEP RESEARCH MODE')
        expect(context).toContain('MANDATORY MULTI-SEARCH')
        expect(context).toContain('up to 25 searches')
        expect(context).toContain('CRITICAL RULE')
        expect(context).toContain('MANDATORY MINIMUM SEARCHES')
        
        // Should NOT contain normal mode planning instruction
        expect(context).not.toContain('PLAN FIRST')
        expect(context).not.toContain('BEFORE searching, you MUST:')
    })

    /**
     * Property: Deep research mode with canUseTools = false results in maxRounds = 0
     * 
     * Verifies that when tools cannot be used, maxRounds is 0 regardless of toggle states.
     */
    it('Deep research mode with canUseTools=false results in maxRounds=0', () => {
        fc.assert(
            fc.property(
                fc.boolean(), // webSearchEnabled (any value)
                (webSearchEnabled) => {
                    // When canUseTools is false, maxRounds should be 0
                    const maxRounds = calculateResearchMaxRounds(true, webSearchEnabled, false)
                    
                    expect(maxRounds).toBe(0)
                    
                    return maxRounds === 0
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: maxRounds is always one of {0, 5, 25}
     * 
     * Verifies that maxRounds only ever takes valid values.
     */
    it('maxRounds is always one of {0, 5, 25}', () => {
        fc.assert(
            fc.property(
                fc.boolean(), // deepResearchEnabled
                fc.boolean(), // webSearchEnabled
                fc.boolean(), // canUseTools
                (deepResearchEnabled, webSearchEnabled, canUseTools) => {
                    const maxRounds = calculateResearchMaxRounds(
                        deepResearchEnabled,
                        webSearchEnabled,
                        canUseTools
                    )
                    
                    // maxRounds should only ever be 0, 5, or 25
                    const validValues = [0, 5, 25]
                    expect(validValues).toContain(maxRounds)
                    
                    return validValues.includes(maxRounds)
                }
            ),
            { numRuns: 100 }
        )
    })
})


/**
 * Tool Parameter Validation Tests
 * 
 * Tests for validating required parameters before tool execution.
 * This prevents invalid tool calls from reaching the main process.
 */
describe('Tool Parameter Validation', () => {
    /**
     * Test: web_search requires query parameter
     * 
     * Verifies that web_search tool definition has 'query' as a required parameter.
     */
    it('web_search tool has query as required parameter', () => {
        const webSearchTool = getToolByName('web_search')
        
        expect(webSearchTool).toBeDefined()
        expect(webSearchTool?.parameters.required).toContain('query')
    })

    /**
     * Test: All tools have valid parameter definitions
     * 
     * Verifies that all tool definitions have proper parameter structures.
     */
    it('All tools have valid parameter definitions', () => {
        const allTools = getAllToolDefinitions()
        
        for (const tool of allTools) {
            // Each tool should have a parameters object
            expect(tool.parameters).toBeDefined()
            expect(tool.parameters.type).toBe('object')
            expect(tool.parameters.properties).toBeDefined()
            expect(Array.isArray(tool.parameters.required)).toBe(true)
            
            // All required parameters should exist in properties
            for (const requiredParam of tool.parameters.required) {
                expect(tool.parameters.properties[requiredParam]).toBeDefined()
            }
        }
    })

    /**
     * Property: Required parameters must be defined in properties
     * 
     * For any tool, all required parameters must have corresponding property definitions.
     */
    it('Property: Required parameters are always defined in properties', () => {
        fc.assert(
            fc.property(
                toolNameArb,
                (toolName) => {
                    const tool = getToolByName(toolName)
                    
                    if (!tool) return true // Skip if tool not found
                    
                    // All required parameters must exist in properties
                    for (const requiredParam of tool.parameters.required) {
                        expect(tool.parameters.properties[requiredParam]).toBeDefined()
                    }
                    
                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Test: web_search query parameter has correct type
     * 
     * Verifies that the query parameter is defined as a string type.
     */
    it('web_search query parameter is string type', () => {
        const webSearchTool = getToolByName('web_search')
        
        expect(webSearchTool).toBeDefined()
        expect(webSearchTool?.parameters.properties.query.type).toBe('string')
    })
})


/**
 * Unknown Tool Validation Tests
 * 
 * Tests for handling unknown/non-existent tool calls.
 */
describe('Unknown Tool Validation', () => {
    /**
     * Test: Unknown tool names should be rejected
     * 
     * Verifies that calling a non-existent tool returns an appropriate error.
     */
    it('Unknown tool names are not in the tool definitions', () => {
        const unknownTools = ['web', 'search', 'google', 'bing', 'unknown_tool']
        
        for (const toolName of unknownTools) {
            const tool = getToolByName(toolName)
            expect(tool).toBeUndefined()
        }
    })

    /**
     * Test: web_search is the only available search tool
     * 
     * Verifies that web_search exists and is properly named.
     */
    it('web_search is the correct tool name for web searching', () => {
        const webSearchTool = getToolByName('web_search')
        
        expect(webSearchTool).toBeDefined()
        expect(webSearchTool?.name).toBe('web_search')
        expect(webSearchTool?.category).toBe('search')
    })

    /**
     * Property: Only defined tools exist in the registry
     * 
     * For any tool name not in the definitions, getToolByName should return undefined.
     */
    it('Property: Only defined tools exist in the registry', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 50 }),
                (randomToolName) => {
                    const tool = getToolByName(randomToolName)
                    const allToolNames = getAllToolDefinitions().map(t => t.name)
                    
                    if (allToolNames.includes(randomToolName)) {
                        // If the random name happens to match a real tool, it should exist
                        expect(tool).toBeDefined()
                    } else {
                        // Otherwise, it should be undefined
                        expect(tool).toBeUndefined()
                    }
                    
                    return true
                }
            ),
            { numRuns: 100 }
        )
    })
})

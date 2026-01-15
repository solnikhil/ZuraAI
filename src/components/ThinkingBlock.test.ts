/**
 * Property-based tests for ThinkingBlock Accumulation
 * 
 * Feature: deep-research-ui-fix
 * Tests the local accumulator pattern for ThinkingBlocks during streaming operations.
 * 
 * These tests validate that the accumulator correctly preserves blocks during
 * sequential tool calls and thinking content generation.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { ThinkingBlock } from '../contexts/ChatHistoryContext'

// ============================================================================
// Accumulator Logic (extracted for testing)
// ============================================================================

/**
 * Accumulate a new thinking block into the local accumulator.
 * This is the core logic that fixes the stale state issue.
 * 
 * @param accumulator - The current array of thinking blocks
 * @param newBlock - The new block to add
 * @returns The updated accumulator with the new block appended
 */
function accumulateBlock(
    accumulator: ThinkingBlock[],
    newBlock: ThinkingBlock
): ThinkingBlock[] {
    return [...accumulator, newBlock]
}

/**
 * Create a thinking block from accumulated reasoning content.
 * Returns null if content is empty or whitespace-only.
 * 
 * @param content - The reasoning content to save
 * @param duration - Duration in milliseconds
 * @returns A ThinkingBlock or null if content is invalid
 */
function createThinkingBlock(
    content: string,
    duration: number = 0
): ThinkingBlock | null {
    // Property 5: Empty Content Rejection
    // For any string composed entirely of whitespace characters,
    // the system SHALL NOT create a thinking block for it.
    // Validates: Requirements 2.4
    if (!content || content.trim().length === 0) {
        return null
    }

    return {
        type: 'thinking',
        content: content,
        duration: duration,
        timestamp: Date.now()
    }
}

/**
 * Create a searching block for a web search query.
 * 
 * @param query - The search query
 * @returns A ThinkingBlock of type 'searching'
 */
function createSearchingBlock(query: string): ThinkingBlock {
    return {
        type: 'searching',
        query: query,
        timestamp: Date.now()
    }
}

/**
 * Validate that a thinking block has all required fields.
 * 
 * @param block - The block to validate
 * @returns true if the block has all required fields
 */
function isValidThinkingBlock(block: ThinkingBlock): boolean {
    // Must have type and timestamp
    if (!block.type || typeof block.timestamp !== 'number') {
        return false
    }

    // Thinking blocks must have content
    if (block.type === 'thinking' && (!block.content || block.content.trim().length === 0)) {
        return false
    }

    // Searching blocks must have query
    if (block.type === 'searching' && (!block.query || block.query.trim().length === 0)) {
        return false
    }

    return true
}

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generate valid non-empty, non-whitespace content strings
 */
const validContentArb = fc.string({ minLength: 1, maxLength: 500 })
    .filter(s => s.trim().length > 0)

/**
 * Generate whitespace-only strings (for testing rejection)
 */
const whitespaceOnlyArb = fc.constantFrom('', ' ', '  ', '\t', '\n', '\r\n', '   \t\n  ')

/**
 * Generate valid search queries
 */
const searchQueryArb = fc.string({ minLength: 1, maxLength: 200 })
    .filter(s => s.trim().length > 0)

/**
 * Generate valid thinking blocks
 */
const thinkingBlockArb = fc.record({
    type: fc.constant('thinking' as const),
    content: validContentArb,
    duration: fc.nat({ max: 60000 }),
    timestamp: fc.nat({ max: Date.now() + 1000000 })
}) as fc.Arbitrary<ThinkingBlock>

/**
 * Generate valid searching blocks
 */
const searchingBlockArb = fc.record({
    type: fc.constant('searching' as const),
    query: searchQueryArb,
    timestamp: fc.nat({ max: Date.now() + 1000000 })
}) as fc.Arbitrary<ThinkingBlock>

/**
 * Generate any valid thinking block (thinking or searching)
 */
const anyBlockArb = fc.oneof(thinkingBlockArb, searchingBlockArb)

/**
 * Generate a sequence of tool calls (represented as blocks to add)
 */
const toolCallSequenceArb = fc.array(anyBlockArb, { minLength: 1, maxLength: 20 })

/**
 * Generate duration in milliseconds
 */
const durationArb = fc.nat({ max: 60000 })

// ============================================================================
// Property Tests
// ============================================================================

describe('ThinkingBlock Accumulation', () => {
    /**
     * Property 1: Block Count Preservation
     * 
     * For any sequence of N tool calls during a single message response,
     * the final thinkingBlocks array SHALL contain exactly N entries.
     * 
     * **Validates: Requirements 1.3, 3.1**
     */
    describe('Property 1: Block Count Preservation', () => {
        it('accumulating N blocks results in exactly N entries', () => {
            fc.assert(
                fc.property(
                    toolCallSequenceArb,
                    (blocks) => {
                        // Start with empty accumulator
                        let accumulator: ThinkingBlock[] = []

                        // Accumulate each block
                        for (const block of blocks) {
                            accumulator = accumulateBlock(accumulator, block)
                        }

                        // Final count should equal input count
                        expect(accumulator.length).toBe(blocks.length)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('each accumulated block is preserved in order', () => {
            fc.assert(
                fc.property(
                    toolCallSequenceArb,
                    (blocks) => {
                        let accumulator: ThinkingBlock[] = []

                        for (const block of blocks) {
                            accumulator = accumulateBlock(accumulator, block)
                        }

                        // Each block should be at its expected position
                        for (let i = 0; i < blocks.length; i++) {
                            expect(accumulator[i]).toEqual(blocks[i])
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('accumulator preserves all previous blocks when adding new ones', () => {
            fc.assert(
                fc.property(
                    toolCallSequenceArb,
                    anyBlockArb,
                    (existingBlocks, newBlock) => {
                        // Start with existing blocks
                        let accumulator = [...existingBlocks]
                        const originalLength = accumulator.length

                        // Add new block
                        accumulator = accumulateBlock(accumulator, newBlock)

                        // Should have one more block
                        expect(accumulator.length).toBe(originalLength + 1)

                        // All original blocks should still be present
                        for (let i = 0; i < existingBlocks.length; i++) {
                            expect(accumulator[i]).toEqual(existingBlocks[i])
                        }

                        // New block should be at the end
                        expect(accumulator[accumulator.length - 1]).toEqual(newBlock)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })


    /**
     * Property 2: Thinking Content Preservation
     * 
     * For any non-empty, non-whitespace accumulatedReasoning string,
     * when saved to a thinking block, the block's content field
     * SHALL equal the original string.
     * 
     * **Validates: Requirements 2.1, 2.2**
     */
    describe('Property 2: Thinking Content Preservation', () => {
        it('thinking block content equals original reasoning string', () => {
            fc.assert(
                fc.property(
                    validContentArb,
                    durationArb,
                    (content, duration) => {
                        const block = createThinkingBlock(content, duration)

                        // Block should be created
                        expect(block).not.toBeNull()

                        // Content should be preserved exactly
                        expect(block!.content).toBe(content)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('thinking block includes duration and timestamp', () => {
            fc.assert(
                fc.property(
                    validContentArb,
                    durationArb,
                    (content, duration) => {
                        const beforeTimestamp = Date.now()
                        const block = createThinkingBlock(content, duration)
                        const afterTimestamp = Date.now()

                        expect(block).not.toBeNull()

                        // Duration should be preserved
                        expect(block!.duration).toBe(duration)

                        // Timestamp should be within the test execution window
                        expect(block!.timestamp).toBeGreaterThanOrEqual(beforeTimestamp)
                        expect(block!.timestamp).toBeLessThanOrEqual(afterTimestamp)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('thinking block type is correctly set', () => {
            fc.assert(
                fc.property(
                    validContentArb,
                    (content) => {
                        const block = createThinkingBlock(content)

                        expect(block).not.toBeNull()
                        expect(block!.type).toBe('thinking')
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Property 5: Empty Content Rejection
     * 
     * For any string composed entirely of whitespace characters,
     * the system SHALL NOT create a thinking block for it.
     * 
     * **Validates: Requirements 2.4**
     */
    describe('Property 5: Empty Content Rejection', () => {
        it('empty string does not create a thinking block', () => {
            const block = createThinkingBlock('')
            expect(block).toBeNull()
        })

        it('whitespace-only strings do not create thinking blocks', () => {
            fc.assert(
                fc.property(
                    whitespaceOnlyArb,
                    (whitespaceContent) => {
                        const block = createThinkingBlock(whitespaceContent)
                        expect(block).toBeNull()
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('null/undefined content does not create a thinking block', () => {
            // @ts-expect-error - Testing null input
            const nullBlock = createThinkingBlock(null)
            expect(nullBlock).toBeNull()

            // @ts-expect-error - Testing undefined input
            const undefinedBlock = createThinkingBlock(undefined)
            expect(undefinedBlock).toBeNull()
        })

        it('strings with only tabs and newlines do not create thinking blocks', () => {
            const tabsAndNewlines = fc.constantFrom('\t', '\n', '\r', '\t\t', '\n\n', '\r\n', '\t\n\r')

            fc.assert(
                fc.property(
                    tabsAndNewlines,
                    (content) => {
                        const block = createThinkingBlock(content)
                        expect(block).toBeNull()
                    }
                ),
                { numRuns: 50 }
            )
        })
    })

    /**
     * Additional Property: Required Fields Present (Property 3 from design)
     * 
     * For any thinking block in the thinkingBlocks array, it SHALL have
     * a valid type, timestamp, and either content (for thinking) or query (for searching).
     * 
     * **Validates: Requirements 2.2, 3.4**
     */
    describe('Property 3: Required Fields Present', () => {
        it('thinking blocks have type, timestamp, and content', () => {
            fc.assert(
                fc.property(
                    validContentArb,
                    durationArb,
                    (content, duration) => {
                        const block = createThinkingBlock(content, duration)

                        expect(block).not.toBeNull()
                        expect(isValidThinkingBlock(block!)).toBe(true)

                        // Verify specific fields
                        expect(block!.type).toBe('thinking')
                        expect(typeof block!.timestamp).toBe('number')
                        expect(block!.content).toBeDefined()
                        expect(block!.content!.trim().length).toBeGreaterThan(0)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('searching blocks have type, timestamp, and query', () => {
            fc.assert(
                fc.property(
                    searchQueryArb,
                    (query) => {
                        const block = createSearchingBlock(query)

                        expect(isValidThinkingBlock(block)).toBe(true)

                        // Verify specific fields
                        expect(block.type).toBe('searching')
                        expect(typeof block.timestamp).toBe('number')
                        expect(block.query).toBeDefined()
                        expect(block.query!.trim().length).toBeGreaterThan(0)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Additional Property: Chronological Ordering (Property 4 from design)
     * 
     * For any thinkingBlocks array with multiple entries,
     * the timestamps SHALL be in non-decreasing order (oldest first).
     * 
     * **Validates: Requirements 3.3**
     */
    describe('Property 4: Chronological Ordering', () => {
        it('blocks accumulated sequentially have non-decreasing timestamps', () => {
            fc.assert(
                fc.property(
                    fc.array(validContentArb, { minLength: 2, maxLength: 10 }),
                    (contents) => {
                        let accumulator: ThinkingBlock[] = []

                        // Accumulate blocks sequentially
                        for (const content of contents) {
                            const block = createThinkingBlock(content)
                            if (block) {
                                accumulator = accumulateBlock(accumulator, block)
                            }
                        }

                        // Verify timestamps are non-decreasing
                        for (let i = 1; i < accumulator.length; i++) {
                            expect(accumulator[i].timestamp).toBeGreaterThanOrEqual(
                                accumulator[i - 1].timestamp
                            )
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})

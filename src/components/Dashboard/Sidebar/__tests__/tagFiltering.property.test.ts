/**
 * Property-Based Test: Tag filtering returns exactly matching sessions
 *
 * Feature: sidebar-redesign, Property 6: Tag filtering returns exactly matching sessions
 * Validates: Requirements 8.5, 8.7
 *
 * For any list of ChatSessions and any tag string, filtering by that tag should return
 * exactly the sessions whose tags array includes that tag. No session without the tag
 * should appear, and no session with the tag should be excluded.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { filterByTag } from '../utils/filterByTag'
import type { ChatSession } from '../../../../contexts/ChatHistoryContext'

// ============================================================================
// fast-check Arbitraries
// ============================================================================

const chatSessionArb: fc.Arbitrary<ChatSession> = fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 0, maxLength: 100 }),
    messages: fc.constant([]),
    createdAt: fc.integer({ min: 0, max: Date.now() }),
    updatedAt: fc.integer({ min: 0, max: Date.now() }),
    pinned: fc.option(fc.boolean(), { nil: undefined }),
    archived: fc.option(fc.boolean(), { nil: undefined }),
    folderId: fc.option(fc.uuid(), { nil: undefined }),
    tags: fc.option(
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
        { nil: undefined }
    ),
})

// ============================================================================
// Property 6: Tag filtering returns exactly matching sessions
// ============================================================================

describe('Property 6: Tag filtering returns exactly matching sessions', () => {
    it('every returned session has the queried tag in its tags array', () => {
        fc.assert(
            fc.property(
                fc.array(chatSessionArb, { minLength: 0, maxLength: 20 }),
                fc.string({ minLength: 1, maxLength: 30 }),
                (sessions, tag) => {
                    const result = filterByTag(sessions, tag)

                    for (const session of result) {
                        const tags = session.tags ?? []
                        expect(tags).toContain(tag)
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    it('no excluded session has the queried tag', () => {
        fc.assert(
            fc.property(
                fc.array(chatSessionArb, { minLength: 0, maxLength: 20 }),
                fc.string({ minLength: 1, maxLength: 30 }),
                (sessions, tag) => {
                    const result = filterByTag(sessions, tag)
                    const resultIds = new Set(result.map(s => s.id))

                    for (const session of sessions) {
                        if (!resultIds.has(session.id)) {
                            const tags = session.tags ?? []
                            expect(tags).not.toContain(tag)
                        }
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    it('result count equals number of sessions with the tag', () => {
        fc.assert(
            fc.property(
                fc.array(chatSessionArb, { minLength: 0, maxLength: 20 }),
                fc.string({ minLength: 1, maxLength: 30 }),
                (sessions, tag) => {
                    const result = filterByTag(sessions, tag)
                    const expectedCount = sessions.filter(s => (s.tags ?? []).includes(tag)).length
                    expect(result.length).toBe(expectedCount)
                }
            ),
            { numRuns: 100 }
        )
    })

    it('sessions explicitly containing the tag are always included', () => {
        // Generate sessions where at least some have a known tag
        const knownTag = 'test-tag-property-6'

        fc.assert(
            fc.property(
                fc.array(chatSessionArb, { minLength: 0, maxLength: 10 }),
                fc.array(
                    chatSessionArb.map(s => ({
                        ...s,
                        tags: [...(s.tags ?? []), knownTag],
                    })),
                    { minLength: 1, maxLength: 5 }
                ),
                (withoutTag, withTag) => {
                    const allSessions = [...withoutTag, ...withTag]
                    const result = filterByTag(allSessions, knownTag)

                    // Every withTag session must be in the result
                    const resultIds = new Set(result.map(s => s.id))
                    for (const session of withTag) {
                        expect(resultIds.has(session.id)).toBe(true)
                    }
                }
            ),
            { numRuns: 100 }
        )
    })
})

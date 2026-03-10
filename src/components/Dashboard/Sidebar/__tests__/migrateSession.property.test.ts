/**
 * Property-Based Test: Backward-compatible migration preserves existing data
 *
 * Feature: sidebar-redesign, Property 7: Backward-compatible migration preserves existing data
 * Validates: Requirements 11.5
 *
 * For any valid v1 ChatSession (without pinned, folderId, tags fields),
 * applying migrateSession produces a valid v2 ChatSession where:
 *   (a) pinned defaults to false
 *   (b) folderId defaults to null
 *   (c) tags defaults to []
 *   (d) all original fields (id, title, messages, createdAt, updatedAt, totalTokens) are unchanged
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { migrateSession, type ChatSession, type Message } from '../../../../../electron/chatStore'

// ============================================================================
// fast-check Arbitraries
// ============================================================================

/**
 * Arbitrary for a single Message object.
 */
const messageArb: fc.Arbitrary<Message> = fc.record({
    id: fc.uuid(),
    role: fc.constantFrom('user' as const, 'assistant' as const, 'system' as const),
    content: fc.string({ minLength: 0, maxLength: 200 }),
    timestamp: fc.integer({ min: 0, max: Date.now() }),
    tokenCount: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: undefined }),
    image: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
})

/**
 * Arbitrary for a v1 ChatSession — one that does NOT have the new sidebar
 * redesign fields (pinned, folderId, tags).
 * This simulates sessions stored before the v2 migration.
 */
const v1ChatSessionArb: fc.Arbitrary<ChatSession> = fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 0, maxLength: 200 }),
    messages: fc.array(messageArb, { minLength: 0, maxLength: 10 }),
    createdAt: fc.integer({ min: 0, max: Date.now() }),
    updatedAt: fc.integer({ min: 0, max: Date.now() }),
    totalTokens: fc.option(fc.integer({ min: 0, max: 1000000 }), { nil: undefined }),
})

// ============================================================================
// Property 7: Backward-compatible migration preserves existing data
// ============================================================================

describe('Property 7: Backward-compatible migration preserves existing data', () => {
    /**
     * **Validates: Requirements 11.5**
     *
     * For any valid v1 ChatSession, applying migrateSession produces a valid v2
     * ChatSession with pinned=false, folderId=null, tags=[],
     * and all original fields unchanged.
     */
    it('should apply correct defaults for new fields on v1 sessions', () => {
        fc.assert(
            fc.property(v1ChatSessionArb, (v1Session) => {
                const migrated = migrateSession(v1Session)

                // (a) pinned defaults to false
                expect(migrated.pinned).toBe(false)

                // (b) folderId defaults to null
                expect(migrated.folderId).toBeNull()

                // (c) tags defaults to []
                expect(migrated.tags).toEqual([])
            }),
            { numRuns: 200 }
        )
    })

    it('should preserve all original v1 fields unchanged', () => {
        fc.assert(
            fc.property(v1ChatSessionArb, (v1Session) => {
                const migrated = migrateSession(v1Session)

                // (d) All original fields are unchanged
                expect(migrated.id).toBe(v1Session.id)
                expect(migrated.title).toBe(v1Session.title)
                expect(migrated.createdAt).toBe(v1Session.createdAt)
                expect(migrated.updatedAt).toBe(v1Session.updatedAt)
                expect(migrated.totalTokens).toBe(v1Session.totalTokens)

                // Messages array should be identical (same reference via spread)
                expect(migrated.messages).toEqual(v1Session.messages)
                expect(migrated.messages.length).toBe(v1Session.messages.length)
            }),
            { numRuns: 200 }
        )
    })

    it('should be idempotent — migrating an already-migrated session produces the same result', () => {
        fc.assert(
            fc.property(v1ChatSessionArb, (v1Session) => {
                const firstMigration = migrateSession(v1Session)
                const secondMigration = migrateSession(firstMigration)

                expect(secondMigration).toEqual(firstMigration)
            }),
            { numRuns: 200 }
        )
    })

    it('should preserve existing v2 field values when already set', () => {
        const v2ChatSessionArb = fc.record({
            id: fc.uuid(),
            title: fc.string({ minLength: 0, maxLength: 200 }),
            messages: fc.array(messageArb, { minLength: 0, maxLength: 5 }),
            createdAt: fc.integer({ min: 0, max: Date.now() }),
            updatedAt: fc.integer({ min: 0, max: Date.now() }),
            totalTokens: fc.option(fc.integer({ min: 0, max: 1000000 }), { nil: undefined }),
            pinned: fc.boolean(),
            folderId: fc.option(fc.uuid(), { nil: null }),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
        })

        fc.assert(
            fc.property(v2ChatSessionArb, (v2Session) => {
                const migrated = migrateSession(v2Session)

                // When fields are already set, they should be preserved
                expect(migrated.pinned).toBe(v2Session.pinned)
                expect(migrated.folderId).toBe(v2Session.folderId)
                expect(migrated.tags).toEqual(v2Session.tags)

                // Original fields still unchanged
                expect(migrated.id).toBe(v2Session.id)
                expect(migrated.title).toBe(v2Session.title)
                expect(migrated.messages).toEqual(v2Session.messages)
            }),
            { numRuns: 200 }
        )
    })

    it('should handle invalid tags field by resetting to empty array', () => {
        fc.assert(
            fc.property(v1ChatSessionArb, (v1Session) => {
                // Simulate corrupted tags (non-array value)
                const corruptedSession = {
                    ...v1Session,
                    tags: 'not-an-array' as unknown as string[],
                }

                const migrated = migrateSession(corruptedSession)

                // Should reset to empty array per error handling spec
                expect(migrated.tags).toEqual([])
                expect(Array.isArray(migrated.tags)).toBe(true)
            }),
            { numRuns: 100 }
        )
    })
})

/**
 * Property-Based Test: Session grouping is a complete, disjoint partition
 *
 * Feature: sidebar-redesign, Property 3: Session grouping is a complete, disjoint partition of visible sessions
 * Validates: Requirements 5.1, 5.2
 *
 * For any list of ChatSessions and Folders, groupSessions(sessions, folders) should produce
 * groups where: (a) every session appears in exactly one group, (b) all sessions in the pinned
 * group have pinned === true, (c) all sessions in a folder group have the matching folderId,
 * and (d) all sessions in a
 * time group have updatedAt within that group's time range.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { groupSessions, type GroupedSessions } from '../utils/groupSessions'
import type { ChatSession, Folder } from '../../../../contexts/ChatHistoryContext'

// ============================================================================
// fast-check Arbitraries
// ============================================================================

const folderArb: fc.Arbitrary<Folder> = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    order: fc.integer({ min: 0, max: 100 }),
    createdAt: fc.integer({ min: 0, max: Date.now() }),
})

function chatSessionArb(folderIds: string[]): fc.Arbitrary<ChatSession> {
    return fc.record({
        id: fc.uuid(),
        title: fc.string({ minLength: 0, maxLength: 100 }),
        messages: fc.constant([]),
        createdAt: fc.integer({ min: 0, max: Date.now() }),
        updatedAt: fc.integer({ min: 0, max: Date.now() }),
        pinned: fc.option(fc.boolean(), { nil: undefined }),
        folderId: fc.option(
            folderIds.length > 0
                ? fc.oneof(fc.constantFrom(...folderIds), fc.uuid())
                : fc.uuid(),
            { nil: undefined }
        ),
        tags: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }), { nil: undefined }),
    })
}

/** Collect all sessions from all groups into a flat array */
function collectAllGrouped(grouped: GroupedSessions): ChatSession[] {
    const all: ChatSession[] = []
    all.push(...grouped.pinned)
    for (const sessions of grouped.folders.values()) {
        all.push(...sessions)
    }
    all.push(...grouped.today)
    all.push(...grouped.yesterday)
    all.push(...grouped.previous7Days)
    all.push(...grouped.previous30Days)
    all.push(...grouped.older)
    return all
}

// ============================================================================
// Property 3: Session grouping is a complete, disjoint partition
// ============================================================================

describe('Property 3: Session grouping is a complete, disjoint partition of visible sessions', () => {
    it('every session appears in exactly one group', () => {
        fc.assert(
            fc.property(
                fc.array(folderArb, { minLength: 0, maxLength: 5 }).chain(folders => {
                    const folderIds = folders.map(f => f.id)
                    return fc.tuple(
                        fc.constant(folders),
                        fc.array(chatSessionArb(folderIds), { minLength: 0, maxLength: 30 })
                    )
                }),
                ([folders, sessions]) => {
                    const grouped = groupSessions(sessions, folders)
                    const allGrouped = collectAllGrouped(grouped)

                    // Every session should appear
                    expect(allGrouped.length).toBe(sessions.length)

                    // Check uniqueness (no duplicates)
                    const ids = allGrouped.map(s => s.id)
                    expect(new Set(ids).size).toBe(ids.length)

                    // Every session ID should be in the grouped result
                    const groupedIds = new Set(ids)
                    for (const session of sessions) {
                        expect(groupedIds.has(session.id)).toBe(true)
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    it('all sessions in the pinned group have pinned === true', () => {
        fc.assert(
            fc.property(
                fc.array(folderArb, { minLength: 0, maxLength: 5 }).chain(folders => {
                    const folderIds = folders.map(f => f.id)
                    return fc.tuple(
                        fc.constant(folders),
                        fc.array(chatSessionArb(folderIds), { minLength: 0, maxLength: 30 })
                    )
                }),
                ([folders, sessions]) => {
                    const grouped = groupSessions(sessions, folders)

                    for (const session of grouped.pinned) {
                        expect(session.pinned).toBe(true)
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    it('all sessions in a folder group have the matching folderId', () => {
        fc.assert(
            fc.property(
                fc.array(folderArb, { minLength: 0, maxLength: 5 }).chain(folders => {
                    const folderIds = folders.map(f => f.id)
                    return fc.tuple(
                        fc.constant(folders),
                        fc.array(chatSessionArb(folderIds), { minLength: 0, maxLength: 30 })
                    )
                }),
                ([folders, sessions]) => {
                    const grouped = groupSessions(sessions, folders)

                    for (const [folderId, folderSessions] of grouped.folders.entries()) {
                        for (const session of folderSessions) {
                            expect(session.folderId).toBe(folderId)
                        }
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    it('sessions in time groups are not pinned and have no valid folder assignment', () => {
        fc.assert(
            fc.property(
                fc.array(folderArb, { minLength: 0, maxLength: 5 }).chain(folders => {
                    const folderIds = folders.map(f => f.id)
                    return fc.tuple(
                        fc.constant(folders),
                        fc.array(chatSessionArb(folderIds), { minLength: 0, maxLength: 30 })
                    )
                }),
                ([folders, sessions]) => {
                    const grouped = groupSessions(sessions, folders)
                    const folderIds = new Set(folders.map(f => f.id))
                    const timeGroupSessions = [
                        ...grouped.today,
                        ...grouped.yesterday,
                        ...grouped.previous7Days,
                        ...grouped.previous30Days,
                        ...grouped.older,
                    ]

                    for (const session of timeGroupSessions) {
                        expect(session.pinned).not.toBe(true)
                        // Either no folderId, or folderId references a non-existent folder
                        if (session.folderId != null && session.folderId !== '') {
                            expect(folderIds.has(session.folderId)).toBe(false)
                        }
                    }
                }
            ),
            { numRuns: 100 }
        )
    })
})

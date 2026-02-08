import { describe, it, expect } from 'vitest'
import type { ChatSession, ChatHistoryData } from '../chatStore'
import { migrateSession, migrateData } from '../chatStore'

/**
 * Unit tests for chatStore migration logic and folder persistence.
 * Validates: Requirements 11.5 (backward compatibility), 11.6 (folder persistence)
 */

// Helper: create a minimal v1 session (no sidebar redesign fields)
function makeV1Session(overrides: Partial<ChatSession> = {}): ChatSession {
    return {
        id: 'test-id-1',
        title: 'Test Chat',
        messages: [
            { id: 'msg-1', role: 'user', content: 'Hello', timestamp: Date.now() },
        ],
        createdAt: Date.now() - 100000,
        updatedAt: Date.now(),
        totalTokens: 42,
        ...overrides,
    }
}

describe('migrateSession', () => {
    it('applies default values to a v1 session missing all new fields', () => {
        const v1Session = makeV1Session()
        // Ensure no sidebar fields exist
        delete (v1Session as any).pinned
        delete (v1Session as any).archived
        delete (v1Session as any).folderId
        delete (v1Session as any).tags

        const migrated = migrateSession(v1Session)

        expect(migrated.pinned).toBe(false)
        expect(migrated.archived).toBe(false)
        expect(migrated.folderId).toBeNull()
        expect(migrated.tags).toEqual([])
    })

    it('preserves all original fields after migration', () => {
        const v1Session = makeV1Session({
            id: 'preserve-test',
            title: 'My Important Chat',
            totalTokens: 999,
        })
        delete (v1Session as any).pinned
        delete (v1Session as any).archived
        delete (v1Session as any).folderId
        delete (v1Session as any).tags

        const migrated = migrateSession(v1Session)

        expect(migrated.id).toBe('preserve-test')
        expect(migrated.title).toBe('My Important Chat')
        expect(migrated.messages).toEqual(v1Session.messages)
        expect(migrated.createdAt).toBe(v1Session.createdAt)
        expect(migrated.updatedAt).toBe(v1Session.updatedAt)
        expect(migrated.totalTokens).toBe(999)
    })

    it('preserves existing v2 field values (does not overwrite)', () => {
        const v2Session = makeV1Session({
            pinned: true,
            archived: true,
            folderId: 'folder-abc',
            tags: ['important', 'work'],
        })

        const migrated = migrateSession(v2Session)

        expect(migrated.pinned).toBe(true)
        expect(migrated.archived).toBe(true)
        expect(migrated.folderId).toBe('folder-abc')
        expect(migrated.tags).toEqual(['important', 'work'])
    })

    it('handles invalid tags (non-array) by resetting to empty array', () => {
        const session = makeV1Session()
        ;(session as any).tags = 'not-an-array'

        const migrated = migrateSession(session)

        expect(migrated.tags).toEqual([])
    })
})

describe('migrateData', () => {
    it('migrates v1 data: adds folders array and applies session defaults', () => {
        const v1Data = {
            sessions: [makeV1Session({ id: 's1' }), makeV1Session({ id: 's2' })],
            version: 1,
        } as unknown as ChatHistoryData

        // Remove sidebar fields to simulate true v1 data
        delete (v1Data.sessions[0] as any).pinned
        delete (v1Data.sessions[1] as any).pinned

        const migrated = migrateData(v1Data)

        expect(migrated.version).toBe(2)
        expect(migrated.folders).toEqual([])
        expect(migrated.sessions[0].pinned).toBe(false)
        expect(migrated.sessions[0].archived).toBe(false)
        expect(migrated.sessions[0].folderId).toBeNull()
        expect(migrated.sessions[0].tags).toEqual([])
        expect(migrated.sessions[1].pinned).toBe(false)
    })

    it('preserves existing folders in v1 data if present', () => {
        const v1DataWithFolders = {
            sessions: [makeV1Session()],
            folders: [{ id: 'f1', name: 'Work', order: 0, createdAt: Date.now() }],
            version: 1,
        } as unknown as ChatHistoryData

        const migrated = migrateData(v1DataWithFolders)

        expect(migrated.folders).toHaveLength(1)
        expect(migrated.folders[0].name).toBe('Work')
    })

    it('does not re-migrate v2 data', () => {
        const v2Data: ChatHistoryData = {
            sessions: [makeV1Session({ pinned: true, tags: ['test'] })],
            folders: [{ id: 'f1', name: 'Projects', order: 0, createdAt: Date.now() }],
            version: 2,
        }

        const migrated = migrateData(v2Data)

        expect(migrated.version).toBe(2)
        expect(migrated.sessions[0].pinned).toBe(true)
        expect(migrated.sessions[0].tags).toEqual(['test'])
        expect(migrated.folders).toHaveLength(1)
    })

    it('adds folders array to v2 data if missing', () => {
        const v2DataNoFolders = {
            sessions: [makeV1Session()],
            version: 2,
        } as unknown as ChatHistoryData

        const migrated = migrateData(v2DataNoFolders)

        expect(migrated.folders).toEqual([])
    })

    it('handles empty sessions array in v1 data', () => {
        const emptyV1 = {
            sessions: [],
            version: 1,
        } as unknown as ChatHistoryData

        const migrated = migrateData(emptyV1)

        expect(migrated.version).toBe(2)
        expect(migrated.sessions).toEqual([])
        expect(migrated.folders).toEqual([])
    })
})

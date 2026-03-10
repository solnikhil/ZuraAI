/**
 * Unit Tests: groupSessions utility
 *
 * Feature: sidebar-redesign
 * Validates: Requirements 5.1, 5.2, 5.3
 *
 * Tests cover:
 * - Pinned sessions go to pinned group
 * - Folder-assigned (non-pinned) sessions go to folder groups
 * - Remaining sessions grouped by updatedAt into time groups
 * - Empty time groups are empty arrays (hidden by UI)
 * - Invalid folderId falls back to time grouping
 * - Edge cases (empty inputs, mixed groups, etc.)
 */

import { describe, it, expect } from 'vitest'
import { groupSessions } from '../utils/groupSessions'
import type { ChatSession, Folder } from '../../../../contexts/ChatHistoryContext'

// ============================================================================
// Test Helpers
// ============================================================================

function makeSession(overrides: Partial<ChatSession> & { title: string }): ChatSession {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    title: overrides.title,
    messages: overrides.messages ?? [],
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    pinned: overrides.pinned,
    folderId: overrides.folderId,
    tags: overrides.tags,
  }
}

function makeFolder(overrides: Partial<Folder> & { name: string }): Folder {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name,
    order: overrides.order ?? 0,
    createdAt: overrides.createdAt ?? Date.now(),
  }
}

/** Returns a timestamp for N days ago at noon (safely within that day). */
function daysAgo(n: number): number {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(12, 0, 0, 0)
  return d.getTime()
}

/** Returns a timestamp for today at noon. */
function todayNoon(): number {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  return d.getTime()
}

// ============================================================================
// Tests
// ============================================================================

describe('groupSessions', () => {
  // Requirement 5.1: Pinned section
  describe('pinned sessions', () => {
    it('should place pinned sessions in the pinned group', () => {
      const sessions = [
        makeSession({ title: 'Pinned Chat', pinned: true, updatedAt: todayNoon() }),
        makeSession({ title: 'Normal Chat', updatedAt: todayNoon() }),
      ]

      const result = groupSessions(sessions, [])

      expect(result.pinned).toHaveLength(1)
      expect(result.pinned[0].title).toBe('Pinned Chat')
      expect(result.today).toHaveLength(1)
      expect(result.today[0].title).toBe('Normal Chat')
    })

    it('should place pinned sessions in pinned group regardless of folderId', () => {
      const folder = makeFolder({ id: 'folder-1', name: 'Work' })
      const sessions = [
        makeSession({ title: 'Pinned in Folder', pinned: true, folderId: 'folder-1', updatedAt: todayNoon() }),
      ]

      const result = groupSessions(sessions, [folder])

      // Pinned takes priority over folder assignment
      expect(result.pinned).toHaveLength(1)
      expect(result.pinned[0].title).toBe('Pinned in Folder')
      expect(result.folders.get('folder-1')).toHaveLength(0)
    })
  })

  // Requirement 8.1-8.4: Folder-assigned sessions
  describe('folder-assigned sessions', () => {
    it('should place folder-assigned sessions in the correct folder group', () => {
      const folder = makeFolder({ id: 'folder-1', name: 'Work' })
      const sessions = [
        makeSession({ title: 'Work Chat', folderId: 'folder-1', updatedAt: todayNoon() }),
        makeSession({ title: 'Normal Chat', updatedAt: todayNoon() }),
      ]

      const result = groupSessions(sessions, [folder])

      expect(result.folders.get('folder-1')).toHaveLength(1)
      expect(result.folders.get('folder-1')![0].title).toBe('Work Chat')
      expect(result.today).toHaveLength(1)
      expect(result.today[0].title).toBe('Normal Chat')
    })

    it('should handle multiple folders', () => {
      const folder1 = makeFolder({ id: 'f1', name: 'Work' })
      const folder2 = makeFolder({ id: 'f2', name: 'Personal' })
      const sessions = [
        makeSession({ title: 'Work Chat', folderId: 'f1', updatedAt: todayNoon() }),
        makeSession({ title: 'Personal Chat', folderId: 'f2', updatedAt: todayNoon() }),
      ]

      const result = groupSessions(sessions, [folder1, folder2])

      expect(result.folders.get('f1')).toHaveLength(1)
      expect(result.folders.get('f2')).toHaveLength(1)
    })

    it('should fall back to time grouping when folderId references non-existent folder', () => {
      const sessions = [
        makeSession({ title: 'Orphan Chat', folderId: 'nonexistent', updatedAt: todayNoon() }),
      ]

      const result = groupSessions(sessions, [])

      expect(result.today).toHaveLength(1)
      expect(result.today[0].title).toBe('Orphan Chat')
    })

    it('should initialize empty arrays for folders with no sessions', () => {
      const folder = makeFolder({ id: 'empty-folder', name: 'Empty' })

      const result = groupSessions([], [folder])

      expect(result.folders.get('empty-folder')).toEqual([])
    })
  })

  // Requirement 5.2: Time-based grouping
  describe('time-based grouping', () => {
    it('should group sessions updated today into the today group', () => {
      const sessions = [
        makeSession({ title: 'Today Chat', updatedAt: todayNoon() }),
      ]

      const result = groupSessions(sessions, [])

      expect(result.today).toHaveLength(1)
      expect(result.today[0].title).toBe('Today Chat')
    })

    it('should group sessions updated yesterday into the yesterday group', () => {
      const sessions = [
        makeSession({ title: 'Yesterday Chat', updatedAt: daysAgo(1) }),
      ]

      const result = groupSessions(sessions, [])

      expect(result.yesterday).toHaveLength(1)
      expect(result.yesterday[0].title).toBe('Yesterday Chat')
    })

    it('should group sessions from 2-7 days ago into previous7Days', () => {
      const sessions = [
        makeSession({ title: '3 Days Ago', updatedAt: daysAgo(3) }),
        makeSession({ title: '5 Days Ago', updatedAt: daysAgo(5) }),
      ]

      const result = groupSessions(sessions, [])

      expect(result.previous7Days).toHaveLength(2)
    })

    it('should group sessions from 8-30 days ago into previous30Days', () => {
      const sessions = [
        makeSession({ title: '10 Days Ago', updatedAt: daysAgo(10) }),
        makeSession({ title: '25 Days Ago', updatedAt: daysAgo(25) }),
      ]

      const result = groupSessions(sessions, [])

      expect(result.previous30Days).toHaveLength(2)
    })

    it('should group sessions older than 30 days into older', () => {
      const sessions = [
        makeSession({ title: 'Old Chat', updatedAt: daysAgo(60) }),
        makeSession({ title: 'Very Old Chat', updatedAt: daysAgo(365) }),
      ]

      const result = groupSessions(sessions, [])

      expect(result.older).toHaveLength(2)
    })

    it('should correctly distribute sessions across all time groups', () => {
      const sessions = [
        makeSession({ title: 'Today', updatedAt: todayNoon() }),
        makeSession({ title: 'Yesterday', updatedAt: daysAgo(1) }),
        makeSession({ title: '4 Days Ago', updatedAt: daysAgo(4) }),
        makeSession({ title: '15 Days Ago', updatedAt: daysAgo(15) }),
        makeSession({ title: '60 Days Ago', updatedAt: daysAgo(60) }),
      ]

      const result = groupSessions(sessions, [])

      expect(result.today).toHaveLength(1)
      expect(result.yesterday).toHaveLength(1)
      expect(result.previous7Days).toHaveLength(1)
      expect(result.previous30Days).toHaveLength(1)
      expect(result.older).toHaveLength(1)
    })
  })

  // Requirement 5.3: Empty groups
  describe('empty groups', () => {
    it('should return empty arrays for time groups with no sessions', () => {
      const result = groupSessions([], [])

      expect(result.pinned).toEqual([])
      expect(result.today).toEqual([])
      expect(result.yesterday).toEqual([])
      expect(result.previous7Days).toEqual([])
      expect(result.previous30Days).toEqual([])
      expect(result.older).toEqual([])
      expect(result.folders.size).toBe(0)
    })
  })

  // Combined scenarios
  describe('combined scenarios', () => {
    it('should correctly partition a mixed set of sessions', () => {
      const folder = makeFolder({ id: 'work', name: 'Work' })
      const sessions = [
        makeSession({ title: 'Pinned Today', pinned: true, updatedAt: todayNoon() }),
        makeSession({ title: 'Work Chat', folderId: 'work', updatedAt: daysAgo(3) }),
        makeSession({ title: 'Regular Today', updatedAt: todayNoon() }),
        makeSession({ title: 'Regular Yesterday', updatedAt: daysAgo(1) }),
        makeSession({ title: 'Regular Old', updatedAt: daysAgo(60) }),
      ]

      const result = groupSessions(sessions, [folder])

      expect(result.pinned).toHaveLength(1)
      expect(result.pinned[0].title).toBe('Pinned Today')
      expect(result.folders.get('work')).toHaveLength(1)
      expect(result.folders.get('work')![0].title).toBe('Work Chat')
      expect(result.today).toHaveLength(1)
      expect(result.today[0].title).toBe('Regular Today')
      expect(result.yesterday).toHaveLength(1)
      expect(result.yesterday[0].title).toBe('Regular Yesterday')
      expect(result.older).toHaveLength(1)
      expect(result.older[0].title).toBe('Regular Old')
    })

    it('should handle sessions with undefined optional fields as non-pinned, no folder', () => {
      const sessions = [
        makeSession({
          title: 'Bare Session',
          updatedAt: todayNoon(),
          pinned: undefined,
          folderId: undefined,
        }),
      ]

      const result = groupSessions(sessions, [])

      expect(result.today).toHaveLength(1)
      expect(result.today[0].title).toBe('Bare Session')
      expect(result.pinned).toHaveLength(0)
    })
  })
})

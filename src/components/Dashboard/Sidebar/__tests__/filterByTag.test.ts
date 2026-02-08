/**
 * Unit Tests: filterByTag utility
 *
 * Feature: sidebar-redesign
 * Validates: Requirements 8.7
 *
 * Tests cover:
 * - Filtering sessions by a specific tag
 * - Sessions without tags are excluded
 * - Sessions with undefined/missing tags are handled gracefully
 * - Multiple sessions with the same tag
 * - No results when tag is not found
 * - Edge cases (empty sessions array, empty tags array)
 */

import { describe, it, expect } from 'vitest'
import { filterByTag } from '../utils/filterByTag'
import type { ChatSession } from '../../../../contexts/ChatHistoryContext'

// ============================================================================
// Test Helpers
// ============================================================================

function makeSession(title: string, tags?: string[], overrides?: Partial<ChatSession>): ChatSession {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    title,
    messages: [],
    createdAt: overrides?.createdAt ?? Date.now(),
    updatedAt: overrides?.updatedAt ?? Date.now(),
    tags,
    ...overrides,
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('filterByTag', () => {
  const sessions: ChatSession[] = [
    makeSession('React Project', ['react', 'frontend']),
    makeSession('Python ML', ['python', 'machine-learning']),
    makeSession('TypeScript Utils', ['typescript', 'frontend']),
    makeSession('No Tags Chat'),
    makeSession('Empty Tags Chat', []),
  ]

  describe('basic tag filtering', () => {
    it('should return sessions that have the specified tag', () => {
      const result = filterByTag(sessions, 'frontend')
      expect(result).toHaveLength(2)
      expect(result.map(s => s.title)).toEqual(['React Project', 'TypeScript Utils'])
    })

    it('should return a single session when only one matches', () => {
      const result = filterByTag(sessions, 'python')
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Python ML')
    })

    it('should return empty array when no sessions have the tag', () => {
      const result = filterByTag(sessions, 'nonexistent-tag')
      expect(result).toHaveLength(0)
    })
  })

  describe('sessions with missing/undefined tags', () => {
    it('should exclude sessions with undefined tags', () => {
      const result = filterByTag(sessions, 'react')
      // Only "React Project" has the 'react' tag; "No Tags Chat" has undefined tags
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('React Project')
    })

    it('should exclude sessions with empty tags array', () => {
      const result = filterByTag(sessions, 'react')
      // "Empty Tags Chat" has tags=[] and should not match
      expect(result).toHaveLength(1)
    })

    it('should handle all sessions having undefined tags', () => {
      const noTagSessions = [
        makeSession('Chat 1'),
        makeSession('Chat 2'),
      ]
      const result = filterByTag(noTagSessions, 'any-tag')
      expect(result).toHaveLength(0)
    })
  })

  describe('edge cases', () => {
    it('should return empty array for empty sessions array', () => {
      expect(filterByTag([], 'tag')).toEqual([])
    })

    it('should perform exact tag matching (not substring)', () => {
      const sessionsWithSimilarTags = [
        makeSession('Chat A', ['react']),
        makeSession('Chat B', ['react-native']),
      ]
      const result = filterByTag(sessionsWithSimilarTags, 'react')
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Chat A')
    })

    it('should be case-sensitive for tag matching', () => {
      const sessionsWithCaseTags = [
        makeSession('Chat A', ['React']),
        makeSession('Chat B', ['react']),
      ]
      const result = filterByTag(sessionsWithCaseTags, 'react')
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Chat B')
    })

    it('should return all sessions when all have the matching tag', () => {
      const allTagged = [
        makeSession('Chat 1', ['common']),
        makeSession('Chat 2', ['common', 'extra']),
        makeSession('Chat 3', ['common']),
      ]
      const result = filterByTag(allTagged, 'common')
      expect(result).toHaveLength(3)
    })
  })
})

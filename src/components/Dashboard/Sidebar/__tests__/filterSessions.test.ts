/**
 * Unit Tests: filterSessions utility
 *
 * Feature: sidebar-redesign
 * Validates: Requirements 3.2, 3.3, 3.4, 3.5
 *
 * Tests cover:
 * - Empty/whitespace queries return all sessions
 * - Case-insensitive title matching
 * - Message content matching (last 20 messages)
 * - No results for non-matching queries
 * - Edge cases (empty sessions, empty messages, special characters)
 */

import { describe, it, expect } from 'vitest'
import { filterSessions } from '../utils/filterSessions'
import type { ChatSession } from '../../../../contexts/ChatHistoryContext'

// ============================================================================
// Test Helpers
// ============================================================================

function makeMessage(content: string, overrides?: Partial<{ id: string; role: 'user' | 'assistant' | 'system'; timestamp: number }>) {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    role: overrides?.role ?? ('user' as const),
    content,
    timestamp: overrides?.timestamp ?? Date.now(),
  }
}

function makeSession(title: string, messages: ReturnType<typeof makeMessage>[] = [], overrides?: Partial<ChatSession>): ChatSession {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    title,
    messages: messages as ChatSession['messages'],
    createdAt: overrides?.createdAt ?? Date.now(),
    updatedAt: overrides?.updatedAt ?? Date.now(),
    ...overrides,
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('filterSessions', () => {
  const sessions: ChatSession[] = [
    makeSession('React Hooks Tutorial', [
      makeMessage('How do I use useState?'),
      makeMessage('useState is a React hook for managing state.'),
    ]),
    makeSession('Python Data Analysis', [
      makeMessage('Show me pandas examples'),
      makeMessage('Here is a DataFrame example with pandas.'),
    ]),
    makeSession('TypeScript Generics', [
      makeMessage('Explain generics in TypeScript'),
      makeMessage('Generics allow you to create reusable components.'),
    ]),
  ]

  // Requirement 3.5: Empty/whitespace query returns all sessions
  describe('empty/whitespace queries', () => {
    it('should return all sessions for empty string', () => {
      expect(filterSessions(sessions, '')).toEqual(sessions)
    })

    it('should return all sessions for whitespace-only string', () => {
      expect(filterSessions(sessions, '   ')).toEqual(sessions)
    })

    it('should return all sessions for tab/newline whitespace', () => {
      expect(filterSessions(sessions, '\t\n  ')).toEqual(sessions)
    })
  })

  // Requirement 3.2: Case-insensitive title matching
  describe('title matching', () => {
    it('should match session by exact title substring', () => {
      const result = filterSessions(sessions, 'React')
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('React Hooks Tutorial')
    })

    it('should match case-insensitively', () => {
      const result = filterSessions(sessions, 'react hooks')
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('React Hooks Tutorial')
    })

    it('should match uppercase query against lowercase title content', () => {
      const result = filterSessions(sessions, 'PYTHON')
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Python Data Analysis')
    })

    it('should return multiple sessions when query matches multiple titles', () => {
      // Both "TypeScript Generics" and "React Hooks Tutorial" don't share a common word,
      // but let's use a partial match
      const sessionsWithCommon = [
        ...sessions,
        makeSession('Advanced TypeScript Patterns', []),
      ]
      const result = filterSessions(sessionsWithCommon, 'TypeScript')
      expect(result).toHaveLength(2)
    })
  })

  // Requirement 3.3: Message content matching
  describe('message content matching', () => {
    it('should match session by message content when title does not match', () => {
      const result = filterSessions(sessions, 'useState')
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('React Hooks Tutorial')
    })

    it('should match message content case-insensitively', () => {
      const result = filterSessions(sessions, 'DATAFRAME')
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Python Data Analysis')
    })

    it('should only search last 20 messages', () => {
      // Create a session with 25 messages where the match is in message #3 (outside last 20)
      const messages = Array.from({ length: 25 }, (_, i) =>
        makeMessage(i === 2 ? 'unique-keyword-xyz' : `Message number ${i}`)
      )
      const longSession = makeSession('Long Chat', messages)

      // The keyword is at index 2, which is outside the last 20 (indices 5-24)
      const result = filterSessions([longSession], 'unique-keyword-xyz')
      expect(result).toHaveLength(0)
    })

    it('should find match in last 20 messages', () => {
      const messages = Array.from({ length: 25 }, (_, i) =>
        makeMessage(i === 22 ? 'special-search-term' : `Message number ${i}`)
      )
      const longSession = makeSession('Long Chat', messages)

      // The keyword is at index 22, which is within the last 20 (indices 5-24)
      const result = filterSessions([longSession], 'special-search-term')
      expect(result).toHaveLength(1)
    })
  })

  // Requirement 3.4: No results empty state
  describe('no results', () => {
    it('should return empty array when no sessions match', () => {
      const result = filterSessions(sessions, 'nonexistent-query-xyz')
      expect(result).toHaveLength(0)
    })
  })

  // Edge cases
  describe('edge cases', () => {
    it('should handle empty sessions array', () => {
      expect(filterSessions([], 'query')).toEqual([])
    })

    it('should handle session with no messages', () => {
      const emptySession = makeSession('Empty Chat', [])
      const result = filterSessions([emptySession], 'Empty')
      expect(result).toHaveLength(1)
    })

    it('should not match session with no messages when searching content', () => {
      const emptySession = makeSession('Empty Chat', [])
      const result = filterSessions([emptySession], 'some content')
      expect(result).toHaveLength(0)
    })

    it('should match if title matches even when messages do not', () => {
      const session = makeSession('JavaScript Basics', [
        makeMessage('This is about Python'),
      ])
      const result = filterSessions([session], 'JavaScript')
      expect(result).toHaveLength(1)
    })

    it('should match if messages match even when title does not', () => {
      const session = makeSession('My Chat', [
        makeMessage('Let me explain JavaScript closures'),
      ])
      const result = filterSessions([session], 'closures')
      expect(result).toHaveLength(1)
    })
  })
})

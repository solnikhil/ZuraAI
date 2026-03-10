/**
 * Unit Tests: filterSessions utility
 *
 *
 * Tests cover:
 * - Empty/whitespace queries return all sessions
 * - Case-insensitive title matching
 * - Message content matching (last 20 messages)
 * - No results for non-matching queries
 * - Edge cases (empty sessions, empty messages, special characters)
 */

import { describe, it, expect } from 'vitest'
import { filterSessions, getMatchSnippet } from '../utils/filterSessions'
import type { ChatSession } from '../../../../contexts/ChatHistoryContext'

// Test Helpers

function makeMessage(
  content: string,
  overrides?: Partial<{ id: string; role: 'user' | 'assistant' | 'system'; timestamp: number }>
) {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    role: overrides?.role ?? ('user' as const),
    content,
    timestamp: overrides?.timestamp ?? Date.now(),
  }
}

function makeSession(
  title: string,
  messages: ReturnType<typeof makeMessage>[] = [],
  overrides?: Partial<ChatSession>
): ChatSession {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    title,
    messages: messages as ChatSession['messages'],
    createdAt: overrides?.createdAt ?? Date.now(),
    updatedAt: overrides?.updatedAt ?? Date.now(),
    ...overrides,
  }
}

// Tests

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
      const sessionsWithCommon = [...sessions, makeSession('Advanced TypeScript Patterns', [])]
      const result = filterSessions(sessionsWithCommon, 'TypeScript')
      expect(result).toHaveLength(2)
    })
  })

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

    it('should search all messages regardless of count', () => {
      // Create a session with 25 messages where the match is in message #3
      const messages = Array.from({ length: 25 }, (_, i) =>
        makeMessage(i === 2 ? 'unique-keyword-xyz' : `Message number ${i}`)
      )
      const longSession = makeSession('Long Chat', messages)

      // The keyword is at index 2 — should still be found since we search all messages
      const result = filterSessions([longSession], 'unique-keyword-xyz')
      expect(result).toHaveLength(1)
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
      const session = makeSession('JavaScript Basics', [makeMessage('This is about Python')])
      const result = filterSessions([session], 'JavaScript')
      expect(result).toHaveLength(1)
    })

    it('should match if messages match even when title does not', () => {
      const session = makeSession('My Chat', [makeMessage('Let me explain JavaScript closures')])
      const result = filterSessions([session], 'closures')
      expect(result).toHaveLength(1)
    })
  })
})

// getMatchSnippet Tests

describe('getMatchSnippet', () => {
  it('should return null for empty query', () => {
    const session = makeSession('Chat', [makeMessage('Hello world')])
    expect(getMatchSnippet(session, '')).toBeNull()
    expect(getMatchSnippet(session, '   ')).toBeNull()
  })

  it('should return null when no message matches', () => {
    const session = makeSession('Chat', [makeMessage('Hello world')])
    expect(getMatchSnippet(session, 'nonexistent')).toBeNull()
  })

  it('should return snippet with role "You" for user messages', () => {
    const session = makeSession('Chat', [
      makeMessage('How do I use React hooks?', { role: 'user' }),
    ])
    const result = getMatchSnippet(session, 'React')
    expect(result).not.toBeNull()
    expect(result!.role).toBe('You')
    expect(result!.snippet).toContain('React')
  })

  it('should return snippet with role "Assistant" for assistant messages', () => {
    const session = makeSession('Chat', [
      makeMessage('Tell me about closures', { role: 'user' }),
      makeMessage('Closures are a fundamental concept in JavaScript.', { role: 'assistant' }),
    ])
    const result = getMatchSnippet(session, 'fundamental')
    expect(result).not.toBeNull()
    expect(result!.role).toBe('Assistant')
    expect(result!.snippet).toContain('fundamental')
  })

  it('should return snippet with role "System" for system messages', () => {
    const session = makeSession('Chat', [
      makeMessage('You are a helpful assistant.', { role: 'system' }),
    ])
    const result = getMatchSnippet(session, 'helpful')
    expect(result).not.toBeNull()
    expect(result!.role).toBe('System')
  })

  it('should return the first matching message', () => {
    const session = makeSession('Chat', [
      makeMessage('First message with keyword', { role: 'user' }),
      makeMessage('Second message with keyword', { role: 'assistant' }),
    ])
    const result = getMatchSnippet(session, 'keyword')
    expect(result).not.toBeNull()
    expect(result!.role).toBe('You')
    expect(result!.snippet).toContain('First')
  })

  it('should match case-insensitively', () => {
    const session = makeSession('Chat', [makeMessage('TypeScript is great', { role: 'assistant' })])
    const result = getMatchSnippet(session, 'typescript')
    expect(result).not.toBeNull()
    expect(result!.snippet).toContain('TypeScript')
  })

  it('should truncate long content with ellipsis', () => {
    const longContent = 'A'.repeat(40) + ' keyword ' + 'B'.repeat(40)
    const session = makeSession('Chat', [makeMessage(longContent, { role: 'assistant' })])
    const result = getMatchSnippet(session, 'keyword', 40)
    expect(result).not.toBeNull()
    expect(result!.snippet).toContain('...')
    expect(result!.snippet).toContain('keyword')
  })
})

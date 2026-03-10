/**
 * Property-Based Test: Search filtering returns only matching sessions
 *
 *
 * For any list of ChatSessions and any non-empty search query string,
 * filterSessions(sessions, query) should return only sessions where either the title
 * contains the query (case-insensitive) or at least one message's content contains
 * the query (case-insensitive). No session in the result should fail both match conditions.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { filterSessions } from '../utils/filterSessions'
import type { ChatSession, Message } from '../../../../contexts/ChatHistoryContext'

// fast-check Arbitraries

const messageArb: fc.Arbitrary<Message> = fc.record({
  id: fc.uuid(),
  role: fc.constantFrom('user' as const, 'assistant' as const, 'system' as const),
  content: fc.string({ minLength: 0, maxLength: 100 }),
  timestamp: fc.integer({ min: 0, max: Date.now() }),
})

const chatSessionArb: fc.Arbitrary<ChatSession> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 0, maxLength: 100 }),
  messages: fc.array(messageArb, { minLength: 0, maxLength: 25 }),
  createdAt: fc.integer({ min: 0, max: Date.now() }),
  updatedAt: fc.integer({ min: 0, max: Date.now() }),
  pinned: fc.option(fc.boolean(), { nil: undefined }),
  folderId: fc.option(fc.uuid(), { nil: undefined }),
  tags: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
    { nil: undefined }
  ),
})

// Arbitrary for non-whitespace queries (at least one non-whitespace character)
const nonWhitespaceQueryArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)

describe('Property 1: Search filtering returns only matching sessions', () => {
  it('every returned session matches the query in title or message content', () => {
    fc.assert(
      fc.property(
        fc.array(chatSessionArb, { minLength: 0, maxLength: 20 }),
        nonWhitespaceQueryArb,
        (sessions, query) => {
          const result = filterSessions(sessions, query)
          const lower = query.toLowerCase()

          for (const session of result) {
            const titleMatch = session.title.toLowerCase().includes(lower)
            const contentMatch = session.messages.some((m) =>
              m.content.toLowerCase().includes(lower)
            )
            expect(titleMatch || contentMatch).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('no excluded session matches the query', () => {
    fc.assert(
      fc.property(
        fc.array(chatSessionArb, { minLength: 0, maxLength: 20 }),
        nonWhitespaceQueryArb,
        (sessions, query) => {
          const result = filterSessions(sessions, query)
          const resultIds = new Set(result.map((s) => s.id))
          const lower = query.toLowerCase()

          for (const session of sessions) {
            if (!resultIds.has(session.id)) {
              const titleMatch = session.title.toLowerCase().includes(lower)
              const contentMatch = session.messages.some((m) =>
                m.content.toLowerCase().includes(lower)
              )
              expect(titleMatch || contentMatch).toBe(false)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('empty or whitespace-only queries return all sessions unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(chatSessionArb, { minLength: 0, maxLength: 20 }),
        fc.constantFrom('', ' ', '  ', '\t', '\n'),
        (sessions, query) => {
          const result = filterSessions(sessions, query)
          expect(result).toBe(sessions) // same reference
        }
      ),
      { numRuns: 100 }
    )
  })

  it('result is a subset of input sessions (preserves order)', () => {
    fc.assert(
      fc.property(
        fc.array(chatSessionArb, { minLength: 0, maxLength: 20 }),
        nonWhitespaceQueryArb,
        (sessions, query) => {
          const result = filterSessions(sessions, query)
          expect(result.length).toBeLessThanOrEqual(sessions.length)

          // Every result element should be from the original array
          for (const r of result) {
            expect(sessions).toContain(r)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

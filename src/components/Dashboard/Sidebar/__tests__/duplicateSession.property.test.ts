/**
 * Property-Based Test: Duplicate session preserves content with correct title
 *
 *
 * For any ChatSession, duplicating it should produce a new session where:
 * (a) the title equals "Copy of " + original title,
 * (b) the message count equals the original message count,
 * (c) the new session has a different id than the original,
 * (d) all original fields (messages content, timestamps) are preserved in the duplicate.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { duplicateSession } from '../utils/duplicateSession'
import type { ChatSession, Message } from '../../../../contexts/ChatHistoryContext'

// fast-check Arbitraries

const messageArb: fc.Arbitrary<Message> = fc.record({
  id: fc.uuid(),
  role: fc.constantFrom('user' as const, 'assistant' as const, 'system' as const),
  content: fc.string({ minLength: 0, maxLength: 200 }),
  timestamp: fc.integer({ min: 0, max: Date.now() }),
  tokenCount: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: undefined }),
})

const chatSessionArb: fc.Arbitrary<ChatSession> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 0, maxLength: 200 }),
  messages: fc.array(messageArb, { minLength: 0, maxLength: 20 }),
  createdAt: fc.integer({ min: 0, max: Date.now() }),
  updatedAt: fc.integer({ min: 0, max: Date.now() }),
  totalTokens: fc.option(fc.integer({ min: 0, max: 1000000 }), { nil: undefined }),
  pinned: fc.option(fc.boolean(), { nil: undefined }),
  folderId: fc.option(fc.uuid(), { nil: null }),
  tags: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
    { nil: undefined }
  ),
})

describe('Property 5: Duplicate session preserves content with correct title', () => {
  it('duplicate title equals "Copy of " + original title', () => {
    fc.assert(
      fc.property(chatSessionArb, (session) => {
        const dup = duplicateSession(session)
        expect(dup.title).toBe(`Copy of ${session.title}`)
      }),
      { numRuns: 200 }
    )
  })

  it('duplicate has same message count as original', () => {
    fc.assert(
      fc.property(chatSessionArb, (session) => {
        const dup = duplicateSession(session)
        expect(dup.messages.length).toBe(session.messages.length)
      }),
      { numRuns: 200 }
    )
  })

  it('duplicate has a different id than the original', () => {
    fc.assert(
      fc.property(chatSessionArb, (session) => {
        const dup = duplicateSession(session)
        expect(dup.id).not.toBe(session.id)
      }),
      { numRuns: 200 }
    )
  })

  it('duplicate messages preserve content from original', () => {
    fc.assert(
      fc.property(chatSessionArb, (session) => {
        const dup = duplicateSession(session)

        for (let i = 0; i < session.messages.length; i++) {
          expect(dup.messages[i].content).toBe(session.messages[i].content)
          expect(dup.messages[i].role).toBe(session.messages[i].role)
          expect(dup.messages[i].timestamp).toBe(session.messages[i].timestamp)
        }
      }),
      { numRuns: 200 }
    )
  })

  it('duplicate messages have new unique ids (different from originals)', () => {
    fc.assert(
      fc.property(chatSessionArb, (session) => {
        const dup = duplicateSession(session)

        for (let i = 0; i < session.messages.length; i++) {
          expect(dup.messages[i].id).not.toBe(session.messages[i].id)
        }
      }),
      { numRuns: 200 }
    )
  })

  it('duplicate is always unpinned', () => {
    fc.assert(
      fc.property(chatSessionArb, (session) => {
        const dup = duplicateSession(session)
        expect(dup.pinned).toBe(false)
      }),
      { numRuns: 200 }
    )
  })

  it('duplicate preserves totalTokens from original', () => {
    fc.assert(
      fc.property(chatSessionArb, (session) => {
        const dup = duplicateSession(session)
        expect(dup.totalTokens).toBe(session.totalTokens)
      }),
      { numRuns: 200 }
    )
  })
})

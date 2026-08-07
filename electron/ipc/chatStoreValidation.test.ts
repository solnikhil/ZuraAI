// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  assertChatSessionInput,
  assertSessionsInput,
  MAX_BULK_AGGREGATE_BYTES,
} from './chatStoreValidation'

function makeSession(id: string, contentSize = 0) {
  const messages =
    contentSize > 0
      ? [
          {
            id: `msg-${id}`,
            role: 'user' as const,
            content: 'x'.repeat(contentSize),
            timestamp: Date.now(),
          },
        ]
      : []
  return {
    id,
    title: `Session ${id}`,
    messages,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

describe('assertSessionsInput aggregate byte limit', () => {
  it('passes with an empty array', () => {
    expect(() => assertSessionsInput([])).not.toThrow()
  })

  it('passes with a few small sessions well under the limit', () => {
    const sessions = [makeSession('a', 100), makeSession('b', 200), makeSession('c', 300)]
    expect(() => assertSessionsInput(sessions)).not.toThrow()
  })

  it('passes with sessions totaling just under the aggregate limit', () => {
    // Each session will be relatively large but total stays under 512 MB
    // Use a single session near MAX_SESSION_BYTES (256 MB) which is under 512 MB aggregate
    const session = makeSession('large', 200 * 1024 * 1024)
    expect(() => assertSessionsInput([session])).not.toThrow()
  })

  it('rejects a bulk save that exceeds the aggregate byte limit', () => {
    // Create 3 sessions each ~200 MB content => aggregate > 512 MB
    const sessions = [
      makeSession('s1', 200 * 1024 * 1024),
      makeSession('s2', 200 * 1024 * 1024),
      makeSession('s3', 200 * 1024 * 1024),
    ]
    expect(() => assertSessionsInput(sessions)).toThrow(
      `Bulk save exceeds the ${MAX_BULK_AGGREGATE_BYTES}-byte aggregate IPC limit`
    )
  })

  it('error message includes which session triggered the limit', () => {
    const sessions = [
      makeSession('s1', 200 * 1024 * 1024),
      makeSession('s2', 200 * 1024 * 1024),
      makeSession('s3', 200 * 1024 * 1024),
    ]
    try {
      assertSessionsInput(sessions)
      expect.fail('Expected assertSessionsInput to throw')
    } catch (error: unknown) {
      const message = (error as Error).message
      expect(message).toMatch(/rejected at session \d+/)
    }
  })
})

describe('assertChatSessionInput per-session validation', () => {
  it('passes a single session within per-session limit', () => {
    const session = makeSession('valid', 1024)
    expect(() => assertChatSessionInput(session)).not.toThrow()
  })
})

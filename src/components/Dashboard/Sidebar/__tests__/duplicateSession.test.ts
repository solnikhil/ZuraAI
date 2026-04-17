/**
 * Unit Tests: duplicateSession utility
 *
 *
 * Tests cover:
 * - New session gets a unique ID different from original
 * - Title is prefixed with "Copy of "
 * - Messages are deep-copied with new unique IDs
 * - Message content is preserved exactly
 * - createdAt and updatedAt are set to current time
 * - pinned is always false
 * - folderId and tags are preserved (tags as a new array copy)
 * - totalTokens is preserved
 * - Edge cases (empty messages, no tags, no folderId)
 */

import { describe, it, expect } from 'vitest'
import { duplicateSession } from '../utils/duplicateSession'
import type { ChatSession } from '../../../../chat/types'

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
    createdAt: overrides?.createdAt ?? Date.now() - 10000,
    updatedAt: overrides?.updatedAt ?? Date.now() - 5000,
    ...overrides,
  }
}

// Tests

describe('duplicateSession', () => {
  const baseSession = makeSession(
    'My Chat',
    [makeMessage('Hello, how are you?'), makeMessage('I am fine, thanks!', { role: 'assistant' })],
    {
      totalTokens: 150,
      pinned: true,
      folderId: 'folder-123',
      tags: ['important', 'work'],
    }
  )

  describe('unique ID', () => {
    it('should generate a new unique ID different from the original', () => {
      const duplicate = duplicateSession(baseSession)
      expect(duplicate.id).not.toBe(baseSession.id)
      expect(duplicate.id).toBeTruthy()
    })
  })

  describe('title', () => {
    it('should prefix the title with "Copy of "', () => {
      const duplicate = duplicateSession(baseSession)
      expect(duplicate.title).toBe('Copy of My Chat')
    })

    it('should handle already-copied titles', () => {
      const copiedSession = makeSession('Copy of Original', [])
      const duplicate = duplicateSession(copiedSession)
      expect(duplicate.title).toBe('Copy of Copy of Original')
    })

    it('should handle empty title', () => {
      const emptyTitleSession = makeSession('', [])
      const duplicate = duplicateSession(emptyTitleSession)
      expect(duplicate.title).toBe('Copy of ')
    })
  })

  describe('messages', () => {
    it('should have the same number of messages', () => {
      const duplicate = duplicateSession(baseSession)
      expect(duplicate.messages).toHaveLength(baseSession.messages.length)
    })

    it('should preserve message content', () => {
      const duplicate = duplicateSession(baseSession)
      duplicate.messages.forEach((msg, i) => {
        expect(msg.content).toBe(baseSession.messages[i].content)
      })
    })

    it('should preserve message roles', () => {
      const duplicate = duplicateSession(baseSession)
      duplicate.messages.forEach((msg, i) => {
        expect(msg.role).toBe(baseSession.messages[i].role)
      })
    })

    it('should assign new unique IDs to each message', () => {
      const duplicate = duplicateSession(baseSession)
      duplicate.messages.forEach((msg, i) => {
        expect(msg.id).not.toBe(baseSession.messages[i].id)
        expect(msg.id).toBeTruthy()
      })
    })

    it('should preserve message timestamps', () => {
      const duplicate = duplicateSession(baseSession)
      duplicate.messages.forEach((msg, i) => {
        expect(msg.timestamp).toBe(baseSession.messages[i].timestamp)
      })
    })

    it('should handle empty messages array', () => {
      const emptySession = makeSession('Empty', [])
      const duplicate = duplicateSession(emptySession)
      expect(duplicate.messages).toHaveLength(0)
    })
  })

  describe('timestamps', () => {
    it('should set createdAt and updatedAt to current time', () => {
      const before = Date.now()
      const duplicate = duplicateSession(baseSession)
      const after = Date.now()

      expect(duplicate.createdAt).toBeGreaterThanOrEqual(before)
      expect(duplicate.createdAt).toBeLessThanOrEqual(after)
      expect(duplicate.updatedAt).toBeGreaterThanOrEqual(before)
      expect(duplicate.updatedAt).toBeLessThanOrEqual(after)
    })

    it('should have createdAt equal to updatedAt', () => {
      const duplicate = duplicateSession(baseSession)
      expect(duplicate.createdAt).toBe(duplicate.updatedAt)
    })
  })

  describe('pinned', () => {
    it('should set pinned to false even if original is pinned', () => {
      const duplicate = duplicateSession(baseSession)
      expect(duplicate.pinned).toBe(false)
    })
  })

  describe('preserved fields', () => {
    it('should preserve totalTokens', () => {
      const duplicate = duplicateSession(baseSession)
      expect(duplicate.totalTokens).toBe(baseSession.totalTokens)
    })

    it('should preserve folderId', () => {
      const duplicate = duplicateSession(baseSession)
      expect(duplicate.folderId).toBe(baseSession.folderId)
    })

    it('should preserve tags as a new array copy', () => {
      const duplicate = duplicateSession(baseSession)
      expect(duplicate.tags).toEqual(baseSession.tags)
      // Ensure it's a new array (not the same reference)
      expect(duplicate.tags).not.toBe(baseSession.tags)
    })

    it('should handle session with no tags', () => {
      const noTagsSession = makeSession('No Tags', [])
      const duplicate = duplicateSession(noTagsSession)
      expect(duplicate.tags).toEqual([])
    })

    it('should handle session with undefined totalTokens', () => {
      const noTokensSession = makeSession('No Tokens', [])
      const duplicate = duplicateSession(noTokensSession)
      expect(duplicate.totalTokens).toBeUndefined()
    })

    it('should handle session with undefined folderId', () => {
      const noFolderSession = makeSession('No Folder', [])
      const duplicate = duplicateSession(noFolderSession)
      expect(duplicate.folderId).toBeUndefined()
    })
  })
})

/**
 * Property-Based Tests for ChatSessionManager Memory Optimization
 *
 *
 * These tests verify the correctness properties defined in the design document
 * for memory optimization in chat session management:
 * - Property 15: Metadata-Only Initial Load
 * - Property 16: On-Demand Session Loading
 * - Property 18: Inactive Session Unloading
 * - Property 19: Maximum Loaded Sessions
 *
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import {
  ChatSessionManager,
  type SessionMetadata,
  type LoadedSession,
  type SessionManagerConfig,
} from './ChatSessionManager'
import type { ChatSession, Message } from './ChatHistoryContext'

// Helper to generate a valid Message
const messageArbitrary = fc.record({
  id: fc.uuid(),
  role: fc.constantFrom('user', 'assistant', 'system') as fc.Arbitrary<
    'user' | 'assistant' | 'system'
  >,
  content: fc.string({ minLength: 1, maxLength: 500 }),
  timestamp: fc.integer({ min: 1000000000000, max: 2000000000000 }),
})

// Helper to generate a valid ChatSession
const chatSessionArbitrary = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  messages: fc.array(messageArbitrary, { minLength: 0, maxLength: 50 }),
  createdAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
  updatedAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
})

// Helper to generate multiple unique sessions
const uniqueSessionsArbitrary = (minLength: number, maxLength: number) =>
  fc
    .array(chatSessionArbitrary, { minLength, maxLength })
    .map((sessions) => {
      // Ensure unique IDs
      const seen = new Set<string>()
      return sessions.filter((s) => {
        if (seen.has(s.id)) return false
        seen.add(s.id)
        return true
      })
    })
    .filter((sessions) => sessions.length >= minLength)

describe('ChatSessionManager Memory Optimization Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  /**
   *
   * session metadata (id, title, timestamps) without full message content.
   *
   */
  describe('Property 15: Metadata-Only Initial Load', () => {
    it('should load only metadata (id, title, timestamps) during initialization', async () => {
      await fc.assert(
        fc.asyncProperty(uniqueSessionsArbitrary(1, 10), async (sessions) => {
          // Create mock loaders
          const sessionLoader = vi.fn().mockImplementation(async (id: string) => {
            return sessions.find((s) => s.id === id) ?? null
          })
          const allSessionsLoader = vi.fn().mockResolvedValue(sessions)

          const manager = new ChatSessionManager(sessionLoader, allSessionsLoader)

          // Initialize the manager
          await manager.initialize()

          // Property: After initialization, we should have metadata for all sessions
          const metadata = manager.getSessionMetadata()
          expect(metadata.length).toBe(sessions.length)

          // Property: Each metadata entry should contain only lightweight fields
          for (const meta of metadata) {
            expect(meta).toHaveProperty('id')
            expect(meta).toHaveProperty('title')
            expect(meta).toHaveProperty('createdAt')
            expect(meta).toHaveProperty('updatedAt')
            expect(meta).toHaveProperty('messageCount')

            // Property: Metadata should NOT contain full message content
            expect(meta).not.toHaveProperty('messages')
            expect(meta).not.toHaveProperty('content')
          }

          // Property: No sessions should be fully loaded after initialization
          for (const session of sessions) {
            expect(manager.isSessionLoaded(session.id)).toBe(false)
          }

          // Property: The session loader should NOT have been called during initialization
          expect(sessionLoader).not.toHaveBeenCalled()
        }),
        { numRuns: 100 }
      )
    })

    it('should correctly extract messageCount from sessions during initialization', async () => {
      await fc.assert(
        fc.asyncProperty(uniqueSessionsArbitrary(1, 10), async (sessions) => {
          const allSessionsLoader = vi.fn().mockResolvedValue(sessions)
          const sessionLoader = vi.fn()

          const manager = new ChatSessionManager(sessionLoader, allSessionsLoader)
          await manager.initialize()

          const metadata = manager.getSessionMetadata()

          // Property: messageCount in metadata should match actual message array length
          for (const meta of metadata) {
            const originalSession = sessions.find((s) => s.id === meta.id)
            expect(originalSession).toBeDefined()
            expect(meta.messageCount).toBe(originalSession!.messages?.length ?? 0)
          }
        }),
        { numRuns: 100 }
      )
    })

    it('should preserve session ordering by updatedAt (most recent first)', async () => {
      await fc.assert(
        fc.asyncProperty(uniqueSessionsArbitrary(2, 10), async (sessions) => {
          const allSessionsLoader = vi.fn().mockResolvedValue(sessions)
          const sessionLoader = vi.fn()

          const manager = new ChatSessionManager(sessionLoader, allSessionsLoader)
          await manager.initialize()

          const metadata = manager.getSessionMetadata()

          // Property: Metadata should be sorted by updatedAt descending
          for (let i = 1; i < metadata.length; i++) {
            expect(metadata[i - 1].updatedAt).toBeGreaterThanOrEqual(metadata[i].updatedAt)
          }
        }),
        { numRuns: 100 }
      )
    })
  })

  /**
   *
   * the session is explicitly selected by the user.
   *
   */
  describe('Property 16: On-Demand Session Loading', () => {
    it('should only load full session content when explicitly requested', async () => {
      await fc.assert(
        fc.asyncProperty(
          uniqueSessionsArbitrary(2, 8),
          fc.integer({ min: 0, max: 7 }),
          async (sessions, selectedIndex) => {
            if (sessions.length === 0) return
            const actualIndex = selectedIndex % sessions.length
            const selectedSession = sessions[actualIndex]

            const sessionLoader = vi.fn().mockImplementation(async (id: string) => {
              return sessions.find((s) => s.id === id) ?? null
            })
            const allSessionsLoader = vi.fn().mockResolvedValue(sessions)

            const manager = new ChatSessionManager(sessionLoader, allSessionsLoader)
            await manager.initialize()

            // Property: Before loading, session should not be in memory
            expect(manager.isSessionLoaded(selectedSession.id)).toBe(false)

            // Load the selected session
            const loadedSession = await manager.loadSession(selectedSession.id)

            // Property: After loading, session should be in memory
            expect(manager.isSessionLoaded(selectedSession.id)).toBe(true)
            expect(loadedSession).not.toBeNull()
            expect(loadedSession!.messages).toEqual(selectedSession.messages)

            // Property: Session loader should have been called exactly once for this session
            expect(sessionLoader).toHaveBeenCalledWith(selectedSession.id)
            expect(sessionLoader).toHaveBeenCalledTimes(1)

            // Property: Other sessions should still not be loaded
            for (const session of sessions) {
              if (session.id !== selectedSession.id) {
                expect(manager.isSessionLoaded(session.id)).toBe(false)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return cached session on subsequent loads without calling loader', async () => {
      await fc.assert(
        fc.asyncProperty(
          uniqueSessionsArbitrary(1, 5),
          fc.integer({ min: 2, max: 5 }),
          async (sessions, loadCount) => {
            if (sessions.length === 0) return
            const selectedSession = sessions[0]

            const sessionLoader = vi.fn().mockImplementation(async (id: string) => {
              return sessions.find((s) => s.id === id) ?? null
            })
            const allSessionsLoader = vi.fn().mockResolvedValue(sessions)

            const manager = new ChatSessionManager(sessionLoader, allSessionsLoader)
            await manager.initialize()

            // Load the same session multiple times
            for (let i = 0; i < loadCount; i++) {
              const loaded = await manager.loadSession(selectedSession.id)
              expect(loaded).not.toBeNull()
              expect(loaded!.messages).toEqual(selectedSession.messages)
            }

            // Property: Session loader should only be called once (first load)
            expect(sessionLoader).toHaveBeenCalledTimes(1)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return null for non-existent session IDs', async () => {
      await fc.assert(
        fc.asyncProperty(
          uniqueSessionsArbitrary(1, 5),
          fc.uuid(),
          async (sessions, nonExistentId) => {
            // Ensure the ID doesn't exist in sessions
            if (sessions.some((s) => s.id === nonExistentId)) return

            const sessionLoader = vi.fn().mockResolvedValue(null)
            const allSessionsLoader = vi.fn().mockResolvedValue(sessions)

            const manager = new ChatSessionManager(sessionLoader, allSessionsLoader)
            await manager.initialize()

            const loaded = await manager.loadSession(nonExistentId)

            // Property: Should return null for non-existent sessions
            expect(loaded).toBeNull()
            expect(manager.isSessionLoaded(nonExistentId)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   *
   * *For any* chat session that has not been active for 5 minutes, its full message
   *
   */
  describe('Property 18: Inactive Session Unloading', () => {
    it('should unload sessions after 5 minutes of inactivity', async () => {
      await fc.assert(
        fc.asyncProperty(uniqueSessionsArbitrary(1, 5), async (sessions) => {
          if (sessions.length === 0) return
          const selectedSession = sessions[0]

          const sessionLoader = vi.fn().mockImplementation(async (id: string) => {
            return sessions.find((s) => s.id === id) ?? null
          })
          const allSessionsLoader = vi.fn().mockResolvedValue(sessions)

          const manager = new ChatSessionManager(sessionLoader, allSessionsLoader, {
            maxLoadedSessions: 10, // High limit to not trigger max sessions unloading
            unloadAfterMs: 300000, // 5 minutes
            preloadMessageCount: 20,
          })
          await manager.initialize()

          // Load the session
          await manager.loadSession(selectedSession.id)
          expect(manager.isSessionLoaded(selectedSession.id)).toBe(true)

          // Advance time by less than 5 minutes - should still be loaded
          await vi.advanceTimersByTimeAsync(299999)
          manager.unloadInactiveSessions()
          expect(manager.isSessionLoaded(selectedSession.id)).toBe(true)

          // Advance time to exactly 5 minutes - should be unloaded
          await vi.advanceTimersByTimeAsync(1)
          manager.unloadInactiveSessions()
          expect(manager.isSessionLoaded(selectedSession.id)).toBe(false)

          // Property: Metadata should still be available after unloading
          const metadata = manager.getMetadataById(selectedSession.id)
          expect(metadata).not.toBeNull()
          expect(metadata!.id).toBe(selectedSession.id)
        }),
        { numRuns: 100 }
      )
    })

    it('should reset inactivity timer when session is accessed', async () => {
      await fc.assert(
        fc.asyncProperty(
          uniqueSessionsArbitrary(1, 3),
          fc.integer({ min: 1, max: 4 }),
          async (sessions, accessCount) => {
            if (sessions.length === 0) return
            const selectedSession = sessions[0]

            const sessionLoader = vi.fn().mockImplementation(async (id: string) => {
              return sessions.find((s) => s.id === id) ?? null
            })
            const allSessionsLoader = vi.fn().mockResolvedValue(sessions)

            const manager = new ChatSessionManager(sessionLoader, allSessionsLoader, {
              maxLoadedSessions: 10,
              unloadAfterMs: 300000, // 5 minutes
              preloadMessageCount: 20,
            })
            await manager.initialize()

            // Load the session
            await manager.loadSession(selectedSession.id)

            // Access the session multiple times, each time advancing 4 minutes
            for (let i = 0; i < accessCount; i++) {
              await vi.advanceTimersByTimeAsync(240000) // 4 minutes

              // Access the session (resets timer)
              manager.getLoadedSession(selectedSession.id)

              // Should still be loaded because we accessed it
              manager.unloadInactiveSessions()
              expect(manager.isSessionLoaded(selectedSession.id)).toBe(true)
            }

            // Now wait full 5 minutes without access
            await vi.advanceTimersByTimeAsync(300000)
            manager.unloadInactiveSessions()

            // Property: Should be unloaded after 5 minutes of no access
            expect(manager.isSessionLoaded(selectedSession.id)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should unload multiple inactive sessions at once', async () => {
      await fc.assert(
        fc.asyncProperty(uniqueSessionsArbitrary(3, 6), async (sessions) => {
          if (sessions.length < 3) return

          const sessionLoader = vi.fn().mockImplementation(async (id: string) => {
            return sessions.find((s) => s.id === id) ?? null
          })
          const allSessionsLoader = vi.fn().mockResolvedValue(sessions)

          const manager = new ChatSessionManager(sessionLoader, allSessionsLoader, {
            maxLoadedSessions: 10,
            unloadAfterMs: 300000,
            preloadMessageCount: 20,
          })
          await manager.initialize()

          // Load all sessions
          for (const session of sessions) {
            await manager.loadSession(session.id)
          }

          // All should be loaded
          expect(manager.getLoadedSessionCount()).toBe(sessions.length)

          // Advance time past inactivity threshold
          await vi.advanceTimersByTimeAsync(300001)
          manager.unloadInactiveSessions()

          // Property: All sessions should be unloaded
          expect(manager.getLoadedSessionCount()).toBe(0)

          // Property: All metadata should still be available
          for (const session of sessions) {
            const metadata = manager.getMetadataById(session.id)
            expect(metadata).not.toBeNull()
          }
        }),
        { numRuns: 100 }
      )
    })
  })

  /**
   *
   * *For any* application state, the number of fully-loaded chat sessions in memory
   *
   */
  describe('Property 19: Maximum Loaded Sessions', () => {
    it('should never exceed maxLoadedSessions limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          uniqueSessionsArbitrary(5, 10),
          fc.integer({ min: 1, max: 5 }),
          async (sessions, maxLoadedSessions) => {
            if (sessions.length < maxLoadedSessions + 1) return

            const sessionLoader = vi.fn().mockImplementation(async (id: string) => {
              return sessions.find((s) => s.id === id) ?? null
            })
            const allSessionsLoader = vi.fn().mockResolvedValue(sessions)

            const manager = new ChatSessionManager(sessionLoader, allSessionsLoader, {
              maxLoadedSessions,
              unloadAfterMs: 300000,
              preloadMessageCount: 20,
            })
            await manager.initialize()

            // Load more sessions than the limit
            for (const session of sessions) {
              await manager.loadSession(session.id)

              // Property: Loaded count should never exceed maxLoadedSessions
              expect(manager.getLoadedSessionCount()).toBeLessThanOrEqual(maxLoadedSessions)
            }

            // Property: Final count should be exactly maxLoadedSessions
            expect(manager.getLoadedSessionCount()).toBe(maxLoadedSessions)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should unload least recently accessed session when limit is reached', async () => {
      await fc.assert(
        fc.asyncProperty(uniqueSessionsArbitrary(4, 6), async (sessions) => {
          if (sessions.length < 4) return

          const sessionLoader = vi.fn().mockImplementation(async (id: string) => {
            return sessions.find((s) => s.id === id) ?? null
          })
          const allSessionsLoader = vi.fn().mockResolvedValue(sessions)

          const manager = new ChatSessionManager(sessionLoader, allSessionsLoader, {
            maxLoadedSessions: 3,
            unloadAfterMs: 300000,
            preloadMessageCount: 20,
          })
          await manager.initialize()

          // Load first 3 sessions with time gaps
          await manager.loadSession(sessions[0].id)
          await vi.advanceTimersByTimeAsync(100)
          await manager.loadSession(sessions[1].id)
          await vi.advanceTimersByTimeAsync(100)
          await manager.loadSession(sessions[2].id)

          // All 3 should be loaded
          expect(manager.getLoadedSessionCount()).toBe(3)
          expect(manager.isSessionLoaded(sessions[0].id)).toBe(true)
          expect(manager.isSessionLoaded(sessions[1].id)).toBe(true)
          expect(manager.isSessionLoaded(sessions[2].id)).toBe(true)

          // Load a 4th session
          await vi.advanceTimersByTimeAsync(100)
          await manager.loadSession(sessions[3].id)

          // Property: Should still have only 3 loaded
          expect(manager.getLoadedSessionCount()).toBe(3)

          // Property: The least recently accessed (first) should be unloaded
          expect(manager.isSessionLoaded(sessions[0].id)).toBe(false)
          expect(manager.isSessionLoaded(sessions[1].id)).toBe(true)
          expect(manager.isSessionLoaded(sessions[2].id)).toBe(true)
          expect(manager.isSessionLoaded(sessions[3].id)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    it('should keep most recently accessed sessions when enforcing limit', async () => {
      await fc.assert(
        fc.asyncProperty(uniqueSessionsArbitrary(5, 8), async (sessions) => {
          if (sessions.length < 5) return

          const sessionLoader = vi.fn().mockImplementation(async (id: string) => {
            return sessions.find((s) => s.id === id) ?? null
          })
          const allSessionsLoader = vi.fn().mockResolvedValue(sessions)

          const manager = new ChatSessionManager(sessionLoader, allSessionsLoader, {
            maxLoadedSessions: 3,
            unloadAfterMs: 300000,
            preloadMessageCount: 20,
          })
          await manager.initialize()

          // Load first 3 sessions
          await manager.loadSession(sessions[0].id)
          await vi.advanceTimersByTimeAsync(100)
          await manager.loadSession(sessions[1].id)
          await vi.advanceTimersByTimeAsync(100)
          await manager.loadSession(sessions[2].id)

          // Access the first session again (making it most recent)
          await vi.advanceTimersByTimeAsync(100)
          manager.getLoadedSession(sessions[0].id)

          // Load a 4th session
          await vi.advanceTimersByTimeAsync(100)
          await manager.loadSession(sessions[3].id)

          // Property: The second session (least recently accessed) should be unloaded
          expect(manager.getLoadedSessionCount()).toBe(3)
          expect(manager.isSessionLoaded(sessions[0].id)).toBe(true) // Recently accessed
          expect(manager.isSessionLoaded(sessions[1].id)).toBe(false) // Least recent
          expect(manager.isSessionLoaded(sessions[2].id)).toBe(true)
          expect(manager.isSessionLoaded(sessions[3].id)).toBe(true) // Just loaded
        }),
        { numRuns: 100 }
      )
    })

    it('should maintain limit with default config of 3 sessions', async () => {
      await fc.assert(
        fc.asyncProperty(uniqueSessionsArbitrary(5, 10), async (sessions) => {
          if (sessions.length < 5) return

          const sessionLoader = vi.fn().mockImplementation(async (id: string) => {
            return sessions.find((s) => s.id === id) ?? null
          })
          const allSessionsLoader = vi.fn().mockResolvedValue(sessions)

          // Use default config (maxLoadedSessions: 3)
          const manager = new ChatSessionManager(sessionLoader, allSessionsLoader)
          await manager.initialize()

          // Verify default config
          expect(manager.getConfig().maxLoadedSessions).toBe(3)

          // Load all sessions
          for (const session of sessions) {
            await manager.loadSession(session.id)
            await vi.advanceTimersByTimeAsync(10)
          }

          // Property: Should never exceed default limit of 3
          expect(manager.getLoadedSessionCount()).toBe(3)
        }),
        { numRuns: 100 }
      )
    })

    it('should handle rapid session switching without exceeding limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          uniqueSessionsArbitrary(5, 8),
          fc.array(fc.integer({ min: 0, max: 7 }), { minLength: 10, maxLength: 20 }),
          async (sessions, accessPattern) => {
            if (sessions.length < 5) return

            const sessionLoader = vi.fn().mockImplementation(async (id: string) => {
              return sessions.find((s) => s.id === id) ?? null
            })
            const allSessionsLoader = vi.fn().mockResolvedValue(sessions)

            const manager = new ChatSessionManager(sessionLoader, allSessionsLoader, {
              maxLoadedSessions: 3,
              unloadAfterMs: 300000,
              preloadMessageCount: 20,
            })
            await manager.initialize()

            // Simulate rapid session switching
            for (const index of accessPattern) {
              const sessionIndex = index % sessions.length
              await manager.loadSession(sessions[sessionIndex].id)

              // Property: Should never exceed limit during rapid switching
              expect(manager.getLoadedSessionCount()).toBeLessThanOrEqual(3)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Additional property tests for edge cases and combined behaviors
   */
  describe('Combined Memory Optimization Properties', () => {
    it('should preserve metadata when sessions are unloaded', async () => {
      await fc.assert(
        fc.asyncProperty(uniqueSessionsArbitrary(3, 6), async (sessions) => {
          if (sessions.length < 3) return

          const sessionLoader = vi.fn().mockImplementation(async (id: string) => {
            return sessions.find((s) => s.id === id) ?? null
          })
          const allSessionsLoader = vi.fn().mockResolvedValue(sessions)

          const manager = new ChatSessionManager(sessionLoader, allSessionsLoader, {
            maxLoadedSessions: 2,
            unloadAfterMs: 300000,
            preloadMessageCount: 20,
          })
          await manager.initialize()

          // Load all sessions (will trigger unloading)
          for (const session of sessions) {
            await manager.loadSession(session.id)
            await vi.advanceTimersByTimeAsync(10)
          }

          // Property: All metadata should still be available
          const metadata = manager.getSessionMetadata()
          expect(metadata.length).toBe(sessions.length)

          for (const session of sessions) {
            const meta = manager.getMetadataById(session.id)
            expect(meta).not.toBeNull()
            expect(meta!.id).toBe(session.id)
            expect(meta!.title).toBe(session.title)
          }
        }),
        { numRuns: 100 }
      )
    })

    it('should allow reloading previously unloaded sessions', async () => {
      await fc.assert(
        fc.asyncProperty(uniqueSessionsArbitrary(4, 6), async (sessions) => {
          if (sessions.length < 4) return

          const sessionLoader = vi.fn().mockImplementation(async (id: string) => {
            return sessions.find((s) => s.id === id) ?? null
          })
          const allSessionsLoader = vi.fn().mockResolvedValue(sessions)

          const manager = new ChatSessionManager(sessionLoader, allSessionsLoader, {
            maxLoadedSessions: 2,
            unloadAfterMs: 300000,
            preloadMessageCount: 20,
          })
          await manager.initialize()

          // Load first 2 sessions
          await manager.loadSession(sessions[0].id)
          await vi.advanceTimersByTimeAsync(10)
          await manager.loadSession(sessions[1].id)

          // Load 3rd session (will unload first)
          await vi.advanceTimersByTimeAsync(10)
          await manager.loadSession(sessions[2].id)
          expect(manager.isSessionLoaded(sessions[0].id)).toBe(false)

          // Reload the first session
          await vi.advanceTimersByTimeAsync(10)
          const reloaded = await manager.loadSession(sessions[0].id)

          // Property: Should be able to reload with correct data
          expect(reloaded).not.toBeNull()
          expect(reloaded!.messages).toEqual(sessions[0].messages)
          expect(manager.isSessionLoaded(sessions[0].id)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })
  })
})

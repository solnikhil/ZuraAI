/**
 * Tests for ChatSessionManager
 *
 * - Requirement 4.1: Load only session metadata initially
 * - Requirement 4.2: Load full message content on demand
 * - Requirement 4.4: Unload inactive sessions after 5 minutes
 * - Requirement 4.5: Maximum 3 fully-loaded sessions in memory
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ChatSessionManager,
  createChatSessionManager,
  type SessionMetadata,
  type LoadedSession,
  type SessionManagerConfig,
} from './ChatSessionManager'
import type { ChatSession, Message } from '../chat/types'

// Helper to create mock messages
function createMockMessage(id: string, content: string): Message {
  return {
    id,
    role: 'user',
    content,
    timestamp: Date.now(),
  }
}

// Helper to create mock sessions
function createMockSession(id: string, title: string, messageCount: number): ChatSession {
  const messages: Message[] = []
  for (let i = 0; i < messageCount; i++) {
    messages.push(createMockMessage(`msg-${id}-${i}`, `Message ${i} in session ${id}`))
  }

  return {
    id,
    title,
    messages,
    createdAt: Date.now() - 1000,
    updatedAt: Date.now(),
  }
}

describe('ChatSessionManager', () => {
  let manager: ChatSessionManager
  let mockSessions: ChatSession[]
  let sessionLoader: ReturnType<typeof vi.fn>
  let allSessionsLoader: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Create mock sessions
    mockSessions = [
      createMockSession('session-1', 'First Session', 10),
      createMockSession('session-2', 'Second Session', 50),
      createMockSession('session-3', 'Third Session', 100),
      createMockSession('session-4', 'Fourth Session', 5),
      createMockSession('session-5', 'Fifth Session', 25),
    ]

    // Create mock loaders
    sessionLoader = vi.fn(async (id: string) => {
      return mockSessions.find((s) => s.id === id) ?? null
    })

    allSessionsLoader = vi.fn(async () => {
      return mockSessions
    })

    // Create manager with test config
    manager = new ChatSessionManager(sessionLoader, allSessionsLoader, {
      maxLoadedSessions: 3,
      unloadAfterMs: 300000, // 5 minutes
      preloadMessageCount: 20,
    })
  })

  afterEach(() => {
    manager.dispose()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    /**
     * session metadata (id, title, timestamps) initially
     */
    it('should load only metadata on initialization (Requirement 4.1)', async () => {
      await manager.initialize()

      // Should have metadata for all sessions
      const metadata = manager.getSessionMetadata()
      expect(metadata).toHaveLength(5)

      // Should NOT have any loaded sessions (full content)
      expect(manager.getLoadedSessionCount()).toBe(0)

      // Verify metadata structure
      const firstMeta = metadata.find((m) => m.id === 'session-1')
      expect(firstMeta).toBeDefined()
      expect(firstMeta?.title).toBe('First Session')
      expect(firstMeta?.messageCount).toBe(10)
      expect(firstMeta?.createdAt).toBeDefined()
      expect(firstMeta?.updatedAt).toBeDefined()
    })

    it('should call allSessionsLoader once during initialization', async () => {
      await manager.initialize()
      expect(allSessionsLoader).toHaveBeenCalledTimes(1)
    })

    it('should return metadata sorted by updatedAt (most recent first)', async () => {
      // Modify mock sessions to have different updatedAt times
      mockSessions[0].updatedAt = 1000
      mockSessions[1].updatedAt = 3000
      mockSessions[2].updatedAt = 2000
      mockSessions[3].updatedAt = 5000
      mockSessions[4].updatedAt = 4000

      await manager.initialize()
      const metadata = manager.getSessionMetadata()

      expect(metadata[0].id).toBe('session-4') // updatedAt: 5000
      expect(metadata[1].id).toBe('session-5') // updatedAt: 4000
      expect(metadata[2].id).toBe('session-2') // updatedAt: 3000
      expect(metadata[3].id).toBe('session-3') // updatedAt: 2000
      expect(metadata[4].id).toBe('session-1') // updatedAt: 1000
    })
  })

  describe('On-Demand Loading', () => {
    /**
     * the full message content on demand
     */
    it('should load full session content on demand (Requirement 4.2)', async () => {
      await manager.initialize()

      // Initially no sessions loaded
      expect(manager.getLoadedSessionCount()).toBe(0)

      // Load a session
      const loaded = await manager.loadSession('session-1')

      // Should have full content
      expect(loaded).not.toBeNull()
      expect(loaded?.messages).toHaveLength(10)
      expect(loaded?.metadata.id).toBe('session-1')
      expect(loaded?.metadata.title).toBe('First Session')

      // Should now have 1 loaded session
      expect(manager.getLoadedSessionCount()).toBe(1)
    })

    it('should call sessionLoader when loading a session', async () => {
      await manager.initialize()
      await manager.loadSession('session-2')

      expect(sessionLoader).toHaveBeenCalledWith('session-2')
    })

    it('should return cached session without calling loader again', async () => {
      await manager.initialize()

      // First load
      await manager.loadSession('session-1')
      expect(sessionLoader).toHaveBeenCalledTimes(1)

      // Second load - should use cache
      const cached = await manager.loadSession('session-1')
      expect(sessionLoader).toHaveBeenCalledTimes(1) // Still 1
      expect(cached).not.toBeNull()
    })

    it('should return null for non-existent session', async () => {
      await manager.initialize()
      const result = await manager.loadSession('non-existent')
      expect(result).toBeNull()
    })

    it('should update access time when loading cached session', async () => {
      await manager.initialize()

      const first = await manager.loadSession('session-1')
      const firstLoadedAt = first?.loadedAt

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10))

      const second = await manager.loadSession('session-1')
      expect(second?.loadedAt).toBeGreaterThanOrEqual(firstLoadedAt!)
    })
  })

  describe('Maximum Loaded Sessions', () => {
    /**
     * sessions in memory at any time
     */
    it('should enforce maximum loaded sessions limit (Requirement 4.5)', async () => {
      await manager.initialize()

      // Load 3 sessions (the max)
      await manager.loadSession('session-1')
      await manager.loadSession('session-2')
      await manager.loadSession('session-3')

      expect(manager.getLoadedSessionCount()).toBe(3)

      // Load a 4th session - should unload the oldest
      await manager.loadSession('session-4')

      expect(manager.getLoadedSessionCount()).toBe(3)

      // session-1 should have been unloaded (oldest)
      expect(manager.isSessionLoaded('session-1')).toBe(false)
      expect(manager.isSessionLoaded('session-4')).toBe(true)
    })

    it('should unload least recently accessed session when at limit', async () => {
      await manager.initialize()

      // Load sessions in order
      await manager.loadSession('session-1')
      await new Promise((resolve) => setTimeout(resolve, 5))
      await manager.loadSession('session-2')
      await new Promise((resolve) => setTimeout(resolve, 5))
      await manager.loadSession('session-3')

      // Access session-1 again to make it more recent
      await manager.loadSession('session-1')

      // Load session-4 - should unload session-2 (least recently accessed)
      await manager.loadSession('session-4')

      expect(manager.isSessionLoaded('session-1')).toBe(true)
      expect(manager.isSessionLoaded('session-2')).toBe(false)
      expect(manager.isSessionLoaded('session-3')).toBe(true)
      expect(manager.isSessionLoaded('session-4')).toBe(true)
    })
  })

  describe('Inactive Session Unloading', () => {
    /**
     * WHEN a chat session is not active for 5 minutes, THE ChatHistoryContext
     */
    it('should unload inactive sessions (Requirement 4.4)', async () => {
      // Use a short timeout for testing
      const testManager = new ChatSessionManager(sessionLoader, allSessionsLoader, {
        maxLoadedSessions: 3,
        unloadAfterMs: 100, // 100ms for testing
        preloadMessageCount: 20,
      })

      await testManager.initialize()
      await testManager.loadSession('session-1')

      expect(testManager.isSessionLoaded('session-1')).toBe(true)

      // Wait for inactivity timeout
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Trigger cleanup
      testManager.unloadInactiveSessions()

      expect(testManager.isSessionLoaded('session-1')).toBe(false)

      // Metadata should still be available
      const meta = testManager.getMetadataById('session-1')
      expect(meta).not.toBeNull()
      expect(meta?.title).toBe('First Session')

      testManager.dispose()
    })

    it('should not unload recently accessed sessions', async () => {
      const testManager = new ChatSessionManager(sessionLoader, allSessionsLoader, {
        maxLoadedSessions: 3,
        unloadAfterMs: 100,
        preloadMessageCount: 20,
      })

      await testManager.initialize()
      await testManager.loadSession('session-1')

      // Access it again before timeout
      await new Promise((resolve) => setTimeout(resolve, 50))
      await testManager.loadSession('session-1')

      // Wait a bit more but not enough for full timeout from last access
      await new Promise((resolve) => setTimeout(resolve, 60))

      testManager.unloadInactiveSessions()

      // Should still be loaded because we accessed it recently
      expect(testManager.isSessionLoaded('session-1')).toBe(true)

      testManager.dispose()
    })

    it('should preserve metadata when unloading session', async () => {
      await manager.initialize()
      await manager.loadSession('session-1')

      // Manually unload
      manager.unloadSession('session-1')

      // Session should not be loaded
      expect(manager.isSessionLoaded('session-1')).toBe(false)

      // But metadata should still exist
      const meta = manager.getMetadataById('session-1')
      expect(meta).not.toBeNull()
      expect(meta?.id).toBe('session-1')
      expect(meta?.title).toBe('First Session')
      expect(meta?.messageCount).toBe(10)
    })
  })

  describe('Session Management', () => {
    it('should add new session correctly', async () => {
      await manager.initialize()

      const newSession = createMockSession('new-session', 'New Session', 3)
      manager.addSession(newSession)

      const meta = manager.getMetadataById('new-session')
      expect(meta).not.toBeNull()
      expect(meta?.title).toBe('New Session')
      expect(meta?.messageCount).toBe(3)
    })

    it('should remove session correctly', async () => {
      await manager.initialize()
      await manager.loadSession('session-1')

      manager.removeSession('session-1')

      expect(manager.getMetadataById('session-1')).toBeNull()
      expect(manager.isSessionLoaded('session-1')).toBe(false)
    })

    it('should update metadata correctly', async () => {
      await manager.initialize()

      manager.updateMetadata('session-1', { title: 'Updated Title' })

      const meta = manager.getMetadataById('session-1')
      expect(meta?.title).toBe('Updated Title')
    })

    it('should update loaded session messages', async () => {
      await manager.initialize()
      await manager.loadSession('session-1')

      const newMessages = [
        createMockMessage('new-1', 'New message 1'),
        createMockMessage('new-2', 'New message 2'),
      ]

      manager.updateLoadedSessionMessages('session-1', newMessages)

      const loaded = manager.getLoadedSession('session-1')
      expect(loaded?.messages).toHaveLength(2)
      expect(loaded?.metadata.messageCount).toBe(2)
    })

    it('should clear all sessions', async () => {
      await manager.initialize()
      await manager.loadSession('session-1')
      await manager.loadSession('session-2')

      manager.clear()

      expect(manager.getTotalSessionCount()).toBe(0)
      expect(manager.getLoadedSessionCount()).toBe(0)
    })
  })

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const defaultManager = new ChatSessionManager(sessionLoader, allSessionsLoader)
      const config = defaultManager.getConfig()

      expect(config.maxLoadedSessions).toBe(3)
      expect(config.unloadAfterMs).toBe(300000)
      expect(config.preloadMessageCount).toBe(20)

      defaultManager.dispose()
    })

    it('should allow custom configuration', () => {
      const customManager = new ChatSessionManager(sessionLoader, allSessionsLoader, {
        maxLoadedSessions: 5,
        unloadAfterMs: 600000,
      })
      const config = customManager.getConfig()

      expect(config.maxLoadedSessions).toBe(5)
      expect(config.unloadAfterMs).toBe(600000)
      expect(config.preloadMessageCount).toBe(20) // Default

      customManager.dispose()
    })

    it('should allow updating configuration', () => {
      manager.setConfig({ maxLoadedSessions: 10 })
      const config = manager.getConfig()

      expect(config.maxLoadedSessions).toBe(10)
    })
  })

  describe('Factory Function', () => {
    it('should create manager with createChatSessionManager', async () => {
      const factoryManager = createChatSessionManager(sessionLoader, allSessionsLoader)

      await factoryManager.initialize()
      expect(factoryManager.getTotalSessionCount()).toBe(5)

      factoryManager.dispose()
    })

    it('should accept custom config in factory function', () => {
      const factoryManager = createChatSessionManager(sessionLoader, allSessionsLoader, {
        maxLoadedSessions: 7,
      })

      expect(factoryManager.getConfig().maxLoadedSessions).toBe(7)

      factoryManager.dispose()
    })
  })

  describe('Auto Cleanup', () => {
    it('should start and stop auto cleanup', () => {
      vi.useFakeTimers()

      manager.startAutoCleanup()

      // Should not throw when starting again
      manager.startAutoCleanup()

      manager.stopAutoCleanup()

      // Should not throw when stopping again
      manager.stopAutoCleanup()

      vi.useRealTimers()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty sessions list', async () => {
      allSessionsLoader.mockResolvedValueOnce([])

      await manager.initialize()

      expect(manager.getTotalSessionCount()).toBe(0)
      expect(manager.getSessionMetadata()).toHaveLength(0)
    })

    it('should handle session with no messages', async () => {
      const emptySession: ChatSession = {
        id: 'empty',
        title: 'Empty Session',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      mockSessions.push(emptySession)

      await manager.initialize()

      const meta = manager.getMetadataById('empty')
      expect(meta?.messageCount).toBe(0)
    })

    it('should handle getLoadedSession for non-loaded session', async () => {
      await manager.initialize()

      const result = manager.getLoadedSession('session-1')
      expect(result).toBeNull()
    })

    it('should handle updateLoadedSessionMessages for non-loaded session', async () => {
      await manager.initialize()

      // Should not throw
      manager.updateLoadedSessionMessages('non-existent', [])
    })

    it('should handle updateMetadata for non-existent session', async () => {
      await manager.initialize()

      // Should not throw
      manager.updateMetadata('non-existent', { title: 'Test' })

      // Should not create metadata
      expect(manager.getMetadataById('non-existent')).toBeNull()
    })
  })
})

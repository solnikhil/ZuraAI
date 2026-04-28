/**
 * ChatSessionManager - Lazy loading manager for chat sessions
 *
 * This class implements memory-efficient chat session management by:
 * - Loading only session metadata (id, title, timestamps) initially
 * - Loading full message content on demand when a session is selected
 * - Automatically unloading inactive sessions after a configurable timeout
 * - Maintaining a maximum number of fully-loaded sessions in memory
 *
 * - 4.1: Load only session metadata initially
 * - 4.2: Load full message content on demand
 * - 4.4: Unload inactive sessions after 5 minutes
 * - 4.5: Maximum 3 fully-loaded sessions in memory
 */

import type { Message, ChatSession } from '../chat/types'

/**
 * Lightweight metadata for a chat session (without full message content)
 */
export interface SessionMetadata {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

/**
 * A fully-loaded session with messages and tracking info
 */
export interface LoadedSession {
  metadata: SessionMetadata
  messages: Message[]
  loadedAt: number
}

/**
 * Configuration options for the session manager
 */
export interface SessionManagerConfig {
  /** Maximum number of fully-loaded sessions to keep in memory (default: 3) */
  maxLoadedSessions: number
  /** Time in ms after which inactive sessions are unloaded (default: 300000 = 5 min) */
  unloadAfterMs: number
  /** Number of messages to preload for preview (default: 20) */
  preloadMessageCount: number
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: SessionManagerConfig = {
  maxLoadedSessions: 3,
  unloadAfterMs: 300000, // 5 minutes
  preloadMessageCount: 20,
}

/**
 * Function type for loading full session data from storage
 */
export type SessionLoader = (id: string) => Promise<ChatSession | null>

/**
 * Function type for loading all sessions from storage
 */
export type AllSessionsLoader = () => Promise<ChatSession[]>

/**
 * ChatSessionManager handles lazy loading of chat sessions to optimize memory usage.
 *
 * Usage:
 * ```typescript
 * const manager = new ChatSessionManager(loadSessionFn, loadAllSessionsFn)
 *
 * // Initialize with metadata only
 * await manager.initialize()
 *
 * // Get lightweight metadata for sidebar
 * const metadata = manager.getSessionMetadata()
 *
 * // Load full session when user selects it
 * const session = await manager.loadSession(sessionId)
 *
 * // Periodically clean up inactive sessions
 * manager.unloadInactiveSessions()
 * ```
 */
export class ChatSessionManager {
  private metadata: Map<string, SessionMetadata> = new Map()
  private loadedSessions: Map<string, LoadedSession> = new Map()
  private config: SessionManagerConfig
  private sessionLoader: SessionLoader
  private allSessionsLoader: AllSessionsLoader
  private lastAccessTime: Map<string, number> = new Map()
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null

  constructor(
    sessionLoader: SessionLoader,
    allSessionsLoader: AllSessionsLoader,
    config: Partial<SessionManagerConfig> = {}
  ) {
    this.sessionLoader = sessionLoader
    this.allSessionsLoader = allSessionsLoader
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Initialize the manager by loading metadata for all sessions.
   * This loads only lightweight metadata, not full message content.
   *
   */
  async initialize(): Promise<void> {
    const sessions = await this.allSessionsLoader()

    this.metadata.clear()

    for (const session of sessions) {
      const meta: SessionMetadata = {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages?.length ?? 0,
      }
      this.metadata.set(session.id, meta)
    }
  }

  /**
   * Start automatic cleanup of inactive sessions.
   * Runs every minute to check for sessions that should be unloaded.
   */
  startAutoCleanup(): void {
    if (this.cleanupIntervalId) {
      return // Already running
    }

    this.cleanupIntervalId = setInterval(() => {
      this.unloadInactiveSessions()
    }, 60000)
  }

  /**
   * Stop automatic cleanup of inactive sessions.
   */
  stopAutoCleanup(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId)
      this.cleanupIntervalId = null
    }
  }

  /**
   * Get metadata for all sessions (lightweight, no message content).
   * Returns sessions sorted by updatedAt (most recent first).
   */
  getSessionMetadata(): SessionMetadata[] {
    return Array.from(this.metadata.values()).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /**
   * Get metadata for a specific session.
   */
  getMetadataById(id: string): SessionMetadata | null {
    return this.metadata.get(id) ?? null
  }

  /**
   * Load a full session with all messages.
   * If already loaded, returns from cache and updates access time.
   *
   *
   * @param id - The session ID to load
   * @returns The loaded session or null if not found
   */
  async loadSession(id: string): Promise<LoadedSession | null> {
    this.lastAccessTime.set(id, Date.now())

    const existing = this.loadedSessions.get(id)
    if (existing) {
      existing.loadedAt = Date.now()
      return existing
    }

    // Enforce max loaded sessions limit before loading new one
    await this.enforceMaxLoadedSessions()

    const session = await this.sessionLoader(id)
    if (!session) {
      return null
    }

    const loadedSession: LoadedSession = {
      metadata: {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages?.length ?? 0,
      },
      messages: session.messages ?? [],
      loadedAt: Date.now(),
    }

    this.loadedSessions.set(id, loadedSession)

    this.metadata.set(id, loadedSession.metadata)

    return loadedSession
  }

  /**
   * Get a loaded session from cache without loading from storage.
   * Returns null if the session is not currently loaded.
   *
   * @param id - The session ID to get
   * @returns The loaded session or null if not in cache
   */
  getLoadedSession(id: string): LoadedSession | null {
    const session = this.loadedSessions.get(id)
    if (session) {
        this.lastAccessTime.set(id, Date.now())
    }
    return session ?? null
  }

  /**
   * Check if a session is currently loaded in memory.
   */
  isSessionLoaded(id: string): boolean {
    return this.loadedSessions.has(id)
  }

  /**
   * Unload sessions that have been inactive for longer than the configured timeout.
   *
   */
  unloadInactiveSessions(): void {
    const now = Date.now()
    const sessionsToUnload: string[] = []

    for (const [id, session] of this.loadedSessions) {
      const lastAccess = this.lastAccessTime.get(id) ?? session.loadedAt
      const inactiveTime = now - lastAccess

      if (inactiveTime >= this.config.unloadAfterMs) {
        sessionsToUnload.push(id)
      }
    }

    for (const id of sessionsToUnload) {
      this.unloadSession(id)
    }
  }

  /**
   * Unload a specific session from memory.
   * The metadata is preserved, only the full message content is removed.
   *
   * @param id - The session ID to unload
   */
  unloadSession(id: string): void {
    const session = this.loadedSessions.get(id)
    if (session) {
      // Keep metadata updated
      this.metadata.set(id, session.metadata)
      this.loadedSessions.delete(id)
      this.lastAccessTime.delete(id)
    }
  }

  /**
   * Update metadata for a session (e.g., when title changes).
   */
  updateMetadata(id: string, updates: Partial<SessionMetadata>): void {
    const existing = this.metadata.get(id)
    if (existing) {
      this.metadata.set(id, { ...existing, ...updates })
    }

    // Also update in loaded session if present
    const loaded = this.loadedSessions.get(id)
    if (loaded) {
      loaded.metadata = { ...loaded.metadata, ...updates }
    }
  }

  /**
   * Update messages in a loaded session.
   * This is used for streaming updates and adding new messages.
   */
  updateLoadedSessionMessages(id: string, messages: Message[]): void {
    const loaded = this.loadedSessions.get(id)
    if (loaded) {
      loaded.messages = messages
      loaded.metadata.messageCount = messages.length
      loaded.metadata.updatedAt = Date.now()

        this.metadata.set(id, loaded.metadata)

        this.lastAccessTime.set(id, Date.now())
    }
  }

  /**
   * Add a new session to the manager.
   */
  addSession(session: ChatSession): void {
    const meta: SessionMetadata = {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages?.length ?? 0,
    }
    this.metadata.set(session.id, meta)

    if (this.loadedSessions.size < this.config.maxLoadedSessions) {
      const loadedSession: LoadedSession = {
        metadata: meta,
        messages: session.messages ?? [],
        loadedAt: Date.now(),
      }
      this.loadedSessions.set(session.id, loadedSession)
      this.lastAccessTime.set(session.id, Date.now())
    }
  }

  /**
   * Remove a session from the manager entirely.
   */
  removeSession(id: string): void {
    this.metadata.delete(id)
    this.loadedSessions.delete(id)
    this.lastAccessTime.delete(id)
  }

  /**
   * Clear all sessions from the manager.
   */
  clear(): void {
    this.metadata.clear()
    this.loadedSessions.clear()
    this.lastAccessTime.clear()
  }

  /**
   * Get the number of currently loaded sessions.
   */
  getLoadedSessionCount(): number {
    return this.loadedSessions.size
  }

  /**
   * Get the total number of sessions (metadata count).
   */
  getTotalSessionCount(): number {
    return this.metadata.size
  }

  /**
   * Get the current configuration.
   */
  getConfig(): SessionManagerConfig {
    return { ...this.config }
  }

  /**
   * Update the configuration.
   */
  setConfig(config: Partial<SessionManagerConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Enforce the maximum loaded sessions limit.
   * Unloads the least recently accessed sessions if over the limit.
   *
   */
  private async enforceMaxLoadedSessions(): Promise<void> {
    while (this.loadedSessions.size >= this.config.maxLoadedSessions) {
      // Find the least recently accessed session
      let oldestId: string | null = null
      let oldestTime = Infinity

      for (const [id] of this.loadedSessions) {
        const lastAccess = this.lastAccessTime.get(id) ?? 0
        if (lastAccess < oldestTime) {
          oldestTime = lastAccess
          oldestId = id
        }
      }

      if (oldestId) {
        this.unloadSession(oldestId)
      } else {
        break // Safety: avoid infinite loop
      }
    }
  }

  /**
   * Dispose of the manager and clean up resources.
   */
  dispose(): void {
    this.stopAutoCleanup()
    this.clear()
  }
}

/**
 * Create a ChatSessionManager instance with default configuration.
 * This is a convenience factory function.
 */
export function createChatSessionManager(
  sessionLoader: SessionLoader,
  allSessionsLoader: AllSessionsLoader,
  config?: Partial<SessionManagerConfig>
): ChatSessionManager {
  return new ChatSessionManager(sessionLoader, allSessionsLoader, config)
}

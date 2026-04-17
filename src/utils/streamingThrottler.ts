/**
 * Streaming Update Throttler - Limits the rate of streaming message updates
 *
 *
 * This throttler ensures that streaming updates don't overwhelm the UI with too many
 * re-renders while still ensuring the final update is always applied.
 */

import type { Message } from '../chat/types'

interface ThrottlerConfig {
  /** Maximum updates per second (default: 8) */
  maxUpdatesPerSecond: number
  /** Buffer size for pending updates (default: 1) */
  bufferSize: number
}

interface PendingUpdate {
  sessionId: string
  messageId: string
  updates: Partial<Message>
  timestamp: number
}

const DEFAULT_CONFIG: ThrottlerConfig = {
  maxUpdatesPerSecond: 8,
  bufferSize: 1,
}

/**
 * StreamingThrottler limits the rate of streaming message updates to prevent
 * excessive re-renders while ensuring the final update is always applied.
 */
export class StreamingThrottler {
  private config: ThrottlerConfig
  private lastUpdateTime: Map<string, number> = new Map()
  private pendingUpdates: Map<string, PendingUpdate> = new Map()
  private flushTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private updateCount: Map<string, number> = new Map()
  private windowStart: Map<string, number> = new Map()

  constructor(config: Partial<ThrottlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Get the minimum interval between updates in milliseconds
   */
  private get minIntervalMs(): number {
    return 1000 / this.config.maxUpdatesPerSecond
  }

  /**
   * Generate a unique key for a session/message pair
   */
  private getKey(sessionId: string, messageId: string): string {
    return `${sessionId}:${messageId}`
  }

  /**
   * Throttle a streaming message update
   * @param sessionId - The chat session ID
   * @param messageId - The message ID being updated
   * @param updates - The partial message updates to apply
   * @param updateFn - The actual update function to call
   */
  throttle(
    sessionId: string,
    messageId: string,
    updates: Partial<Message>,
    updateFn: (sessionId: string, messageId: string, updates: Partial<Message>) => void
  ): void {
    const key = this.getKey(sessionId, messageId)
    const now = Date.now()

    // Initialize tracking for this key if needed
    if (!this.windowStart.has(key)) {
      this.windowStart.set(key, now)
      this.updateCount.set(key, 0)
    }

    // Reset window if it's been more than 1 second
    const windowStartTime = this.windowStart.get(key)!
    if (now - windowStartTime >= 1000) {
      this.windowStart.set(key, now)
      this.updateCount.set(key, 0)
    }

    const currentCount = this.updateCount.get(key) || 0
    const lastUpdate = this.lastUpdateTime.get(key) || 0
    const timeSinceLastUpdate = now - lastUpdate

    // Check if we can update immediately
    if (
      currentCount < this.config.maxUpdatesPerSecond &&
      timeSinceLastUpdate >= this.minIntervalMs
    ) {
      // Execute update immediately
      this.executeUpdate(key, sessionId, messageId, updates, updateFn)
    } else {
      // Buffer the update for later
      this.bufferUpdate(key, sessionId, messageId, updates, updateFn)
    }
  }

  /**
   * Execute an update immediately
   */
  private executeUpdate(
    key: string,
    sessionId: string,
    messageId: string,
    updates: Partial<Message>,
    updateFn: (sessionId: string, messageId: string, updates: Partial<Message>) => void
  ): void {
    const now = Date.now()

    // Update tracking
    this.lastUpdateTime.set(key, now)
    this.updateCount.set(key, (this.updateCount.get(key) || 0) + 1)

    // Clear any pending update for this key
    this.pendingUpdates.delete(key)
    const timeout = this.flushTimeouts.get(key)
    if (timeout) {
      clearTimeout(timeout)
      this.flushTimeouts.delete(key)
    }

    // Execute the update
    updateFn(sessionId, messageId, updates)
  }

  /**
   * Buffer an update for later execution
   */
  private bufferUpdate(
    key: string,
    sessionId: string,
    messageId: string,
    updates: Partial<Message>,
    updateFn: (sessionId: string, messageId: string, updates: Partial<Message>) => void
  ): void {
    // Store the pending update (overwrites previous pending update)
    this.pendingUpdates.set(key, {
      sessionId,
      messageId,
      updates,
      timestamp: Date.now(),
    })

    // Schedule flush if not already scheduled
    if (!this.flushTimeouts.has(key)) {
      const lastUpdate = this.lastUpdateTime.get(key) || 0
      const timeSinceLastUpdate = Date.now() - lastUpdate
      const delay = Math.max(0, this.minIntervalMs - timeSinceLastUpdate)

      const timeout = setTimeout(() => {
        this.flushPending(key, updateFn)
      }, delay)
      this.flushTimeouts.set(key, timeout)
    }
  }

  /**
   * Flush a pending update
   */
  private flushPending(
    key: string,
    updateFn: (sessionId: string, messageId: string, updates: Partial<Message>) => void
  ): void {
    this.flushTimeouts.delete(key)

    const pending = this.pendingUpdates.get(key)
    if (pending) {
      this.executeUpdate(key, pending.sessionId, pending.messageId, pending.updates, updateFn)
    }
  }

  /**
   * Force flush all pending updates immediately
   * This ensures the final update is always applied
   */
  flush(updateFn: (sessionId: string, messageId: string, updates: Partial<Message>) => void): void {
    // Clear all timeouts
    for (const timeout of this.flushTimeouts.values()) {
      clearTimeout(timeout)
    }
    this.flushTimeouts.clear()

    // Execute all pending updates
    for (const [key, pending] of this.pendingUpdates.entries()) {
      updateFn(pending.sessionId, pending.messageId, pending.updates)
      this.lastUpdateTime.set(key, Date.now())
    }
    this.pendingUpdates.clear()
  }

  /**
   * Flush pending updates for a specific session/message
   */
  flushOne(
    sessionId: string,
    messageId: string,
    updateFn: (sessionId: string, messageId: string, updates: Partial<Message>) => void
  ): void {
    const key = this.getKey(sessionId, messageId)

    // Clear timeout
    const timeout = this.flushTimeouts.get(key)
    if (timeout) {
      clearTimeout(timeout)
      this.flushTimeouts.delete(key)
    }

    // Execute pending update
    const pending = this.pendingUpdates.get(key)
    if (pending) {
      updateFn(pending.sessionId, pending.messageId, pending.updates)
      this.lastUpdateTime.set(key, Date.now())
      this.pendingUpdates.delete(key)
    }
  }

  /**
   * Clear all state for a specific session/message
   */
  clear(sessionId: string, messageId: string): void {
    const key = this.getKey(sessionId, messageId)

    // Clear timeout
    const timeout = this.flushTimeouts.get(key)
    if (timeout) {
      clearTimeout(timeout)
      this.flushTimeouts.delete(key)
    }

    // Clear all tracking
    this.pendingUpdates.delete(key)
    this.lastUpdateTime.delete(key)
    this.updateCount.delete(key)
    this.windowStart.delete(key)
  }

  /**
   * Clear all state
   */
  clearAll(): void {
    // Clear all timeouts
    for (const timeout of this.flushTimeouts.values()) {
      clearTimeout(timeout)
    }
    this.flushTimeouts.clear()
    this.pendingUpdates.clear()
    this.lastUpdateTime.clear()
    this.updateCount.clear()
    this.windowStart.clear()
  }

  /**
   * Get the number of updates in the current window for a session/message
   */
  getUpdateCount(sessionId: string, messageId: string): number {
    const key = this.getKey(sessionId, messageId)
    return this.updateCount.get(key) || 0
  }

  /**
   * Check if there's a pending update for a session/message
   */
  hasPending(sessionId: string, messageId: string): boolean {
    const key = this.getKey(sessionId, messageId)
    return this.pendingUpdates.has(key)
  }

  /**
   * Get current configuration
   */
  getConfig(): ThrottlerConfig {
    return { ...this.config }
  }
}

// Singleton instance for global use
let globalThrottler: StreamingThrottler | null = null

/**
 * Reset the global streaming throttler (useful for testing)
 */
export function resetStreamingThrottler(): void {
  if (globalThrottler) {
    globalThrottler.clearAll()
    globalThrottler = null
  }
}

export type { ThrottlerConfig }

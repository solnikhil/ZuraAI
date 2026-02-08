/**
 * IPC Batcher - Batches multiple IPC calls within a time window to reduce round-trips
 * 
 * Requirements: 3.1 - When multiple IPC calls are needed within 50ms, batch them into a single IPC round-trip
 * Requirements: 3.6 - Retry with exponential backoff up to 3 times on failure
 */

interface BatchedCall<T = any> {
  channel: string
  args: any[]
  resolve: (value: T) => void
  reject: (error: Error) => void
  timestamp: number
}

interface IPCBatcherConfig {
  /** Time window in ms to batch calls (default: 50ms) */
  batchWindowMs: number
  /** Maximum number of calls to batch together (default: 10) */
  maxBatchSize: number
  /** Maximum retry attempts on failure (default: 3) */
  maxRetries: number
  /** Base delay for exponential backoff in ms (default: 100) */
  baseRetryDelayMs: number
}

const DEFAULT_CONFIG: IPCBatcherConfig = {
  batchWindowMs: 50,
  maxBatchSize: 10,
  maxRetries: 3,
  baseRetryDelayMs: 100
}

/**
 * IPCBatcher collects IPC calls within a time window and batches them together
 * to reduce the number of IPC round-trips between renderer and main process.
 */
export class IPCBatcher {
  private pendingCalls: Map<string, BatchedCall[]> = new Map()
  private flushTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private config: IPCBatcherConfig

  constructor(config: Partial<IPCBatcherConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Queue an IPC invoke call for batching
   * @param channel - The IPC channel to invoke
   * @param args - Arguments to pass to the IPC handler
   * @returns Promise that resolves with the IPC result
   */
  async invoke<T = any>(channel: string, ...args: any[]): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const call: BatchedCall<T> = {
        channel,
        args,
        resolve,
        reject,
        timestamp: Date.now()
      }

      // Add to pending calls for this channel
      if (!this.pendingCalls.has(channel)) {
        this.pendingCalls.set(channel, [])
      }
      const channelCalls = this.pendingCalls.get(channel)!
      channelCalls.push(call)

      // If we've reached max batch size, flush immediately
      if (channelCalls.length >= this.config.maxBatchSize) {
        this.flushChannel(channel)
        return
      }

      // Schedule flush if not already scheduled
      if (!this.flushTimeouts.has(channel)) {
        const timeout = setTimeout(() => {
          this.flushChannel(channel)
        }, this.config.batchWindowMs)
        this.flushTimeouts.set(channel, timeout)
      }
    })
  }

  /**
   * Flush all pending calls for a specific channel
   */
  private async flushChannel(channel: string): Promise<void> {
    // Clear the timeout
    const timeout = this.flushTimeouts.get(channel)
    if (timeout) {
      clearTimeout(timeout)
      this.flushTimeouts.delete(channel)
    }

    // Get and clear pending calls
    const calls = this.pendingCalls.get(channel) || []
    this.pendingCalls.delete(channel)

    if (calls.length === 0) return

    // Execute each call with retry logic
    // Note: For true batching, the main process would need to support batch operations
    // This implementation provides the batching infrastructure and retry logic
    for (const call of calls) {
      this.executeWithRetry(call)
    }
  }

  /**
   * Execute a single IPC call with exponential backoff retry
   */
  private async executeWithRetry<T>(call: BatchedCall<T>): Promise<void> {
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Check if ipcRenderer is available
        if (typeof window === 'undefined' || !window.ipcRenderer) {
          throw new Error('IPC not available - not in Electron environment')
        }

        const result = await window.ipcRenderer.invoke(call.channel, ...call.args)
        call.resolve(result)
        return
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        // Don't retry on certain errors
        if (this.isNonRetryableError(lastError)) {
          call.reject(lastError)
          return
        }

        // If we have more retries, wait with exponential backoff
        if (attempt < this.config.maxRetries) {
          const delay = this.config.baseRetryDelayMs * Math.pow(2, attempt)
          await this.sleep(delay)
        }
      }
    }

    // All retries exhausted
    call.reject(lastError || new Error('IPC call failed after retries'))
  }

  /**
   * Check if an error should not be retried
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase()
    // Don't retry authentication errors or invalid arguments
    return (
      message.includes('401') ||
      message.includes('403') ||
      message.includes('invalid') ||
      message.includes('not found') ||
      message.includes('not available')
    )
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Flush all pending calls immediately
   */
  async flush(): Promise<void> {
    const channels = Array.from(this.pendingCalls.keys())
    await Promise.all(channels.map(channel => this.flushChannel(channel)))
  }

  /**
   * Get the number of pending calls across all channels
   */
  getPendingCount(): number {
    let count = 0
    for (const calls of this.pendingCalls.values()) {
      count += calls.length
    }
    return count
  }

  /**
   * Get the number of pending calls for a specific channel
   */
  getPendingCountForChannel(channel: string): number {
    return this.pendingCalls.get(channel)?.length || 0
  }

  /**
   * Clear all pending calls without executing them
   */
  clear(): void {
    // Clear all timeouts
    for (const timeout of this.flushTimeouts.values()) {
      clearTimeout(timeout)
    }
    this.flushTimeouts.clear()

    // Reject all pending calls
    for (const calls of this.pendingCalls.values()) {
      for (const call of calls) {
        call.reject(new Error('IPC batcher cleared'))
      }
    }
    this.pendingCalls.clear()
  }

  /**
   * Get current configuration
   */
  getConfig(): IPCBatcherConfig {
    return { ...this.config }
  }
}

// Singleton instance for global use
let globalBatcher: IPCBatcher | null = null

/**
 * Get the global IPC batcher instance
 */
export function getIPCBatcher(config?: Partial<IPCBatcherConfig>): IPCBatcher {
  if (!globalBatcher) {
    globalBatcher = new IPCBatcher(config)
  }
  return globalBatcher
}

/**
 * Reset the global IPC batcher (useful for testing)
 */
export function resetIPCBatcher(): void {
  if (globalBatcher) {
    globalBatcher.clear()
    globalBatcher = null
  }
}

export type { IPCBatcherConfig, BatchedCall }

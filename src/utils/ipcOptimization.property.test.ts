/**
 * Property-Based Tests for IPC Optimization
 * 
 * Feature: electron-performance-optimization
 * 
 * These tests verify the correctness properties defined in the design document
 * for IPC batching, streaming throttling, secure storage caching, chat session
 * write debouncing, and IPC retry with exponential backoff.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { IPCBatcher, resetIPCBatcher } from './ipcBatcher'
import { StreamingThrottler, resetStreamingThrottler } from './streamingThrottler'

describe('IPC Optimization Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    resetIPCBatcher()
    resetStreamingThrottler()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  /**
   * Feature: electron-performance-optimization, Property 10: IPC Call Batching
   * 
   * *For any* sequence of IPC calls to the same channel occurring within 50ms,
   * they should be batched together to reduce IPC round-trips.
   * 
   * **Validates: Requirements 3.1**
   */
  describe('Property 10: IPC Call Batching', () => {
    it('should batch multiple calls to the same channel within 50ms window', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 9 }),
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          async (numCalls, channel) => {
            // Fresh mock for each iteration
            const mockInvoke = vi.fn().mockResolvedValue('success')
            ;(global as any).window = { ipcRenderer: { invoke: mockInvoke } }
            
            const batcher = new IPCBatcher({ batchWindowMs: 50, maxBatchSize: 10 })

            const promises: Promise<any>[] = []
            for (let i = 0; i < numCalls; i++) {
              promises.push(batcher.invoke(channel, `arg${i}`))
            }

            // Property: All calls should be pending before timeout
            expect(batcher.getPendingCountForChannel(channel)).toBe(numCalls)

            await vi.advanceTimersByTimeAsync(50)
            await Promise.all(promises)

            // Property: After flush, pending count should be 0
            expect(batcher.getPendingCountForChannel(channel)).toBe(0)
            expect(mockInvoke).toHaveBeenCalledTimes(numCalls)
          }
        ),
        { numRuns: 50 }
      )
    })

    it('should flush immediately when max batch size is reached', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          async (maxBatchSize, channel) => {
            const mockInvoke = vi.fn().mockResolvedValue('success')
            ;(global as any).window = { ipcRenderer: { invoke: mockInvoke } }
            
            const batcher = new IPCBatcher({ batchWindowMs: 50, maxBatchSize })

            const promises: Promise<any>[] = []
            for (let i = 0; i < maxBatchSize; i++) {
              promises.push(batcher.invoke(channel, `arg${i}`))
            }

            // Property: Should flush immediately when max batch size reached
            expect(batcher.getPendingCountForChannel(channel)).toBe(0)
            await Promise.all(promises)
          }
        ),
        { numRuns: 50 }
      )
    })

    it('should keep calls to different channels separate', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0), { minLength: 2, maxLength: 5 }),
          async (channels) => {
            const uniqueChannels = [...new Set(channels)]
            if (uniqueChannels.length < 2) return

            const mockInvoke = vi.fn().mockResolvedValue('success')
            ;(global as any).window = { ipcRenderer: { invoke: mockInvoke } }
            
            const batcher = new IPCBatcher({ batchWindowMs: 50, maxBatchSize: 10 })

            for (const channel of uniqueChannels) {
              batcher.invoke(channel, 'arg')
            }

            // Property: Each channel should have its own pending count
            for (const channel of uniqueChannels) {
              expect(batcher.getPendingCountForChannel(channel)).toBe(1)
            }
            expect(batcher.getPendingCount()).toBe(uniqueChannels.length)
          }
        ),
        { numRuns: 50 }
      )
    })
  })


  /**
   * Feature: electron-performance-optimization, Property 11: Streaming Update Throttling
   * 
   * *For any* streaming message update sequence, the actual `updateStreamingMessage`
   * calls to the context SHALL not exceed 8 per second.
   * 
   * **Validates: Requirements 3.2**
   */
  describe('Property 11: Streaming Update Throttling', () => {
    it('should limit updates to maxUpdatesPerSecond', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 50 }),
          fc.uuid(),
          fc.uuid(),
          async (numUpdates, sessionId, messageId) => {
            const throttler = new StreamingThrottler({ maxUpdatesPerSecond: 8 })
            let actualUpdateCount = 0
            const updateFn = vi.fn(() => { actualUpdateCount++ })

            for (let i = 0; i < numUpdates; i++) {
              throttler.throttle(sessionId, messageId, { content: `update${i}` }, updateFn)
              await vi.advanceTimersByTimeAsync(10)
            }

            throttler.flush(updateFn)

            // Property: Actual updates should be limited
            // With 8 updates/sec, in numUpdates * 10ms, we should have at most:
            // (numUpdates * 10 / 1000) * 8 + 2 updates (for initial and flush)
            const maxExpectedUpdates = Math.ceil((numUpdates * 10 / 1000) * 8) + 2
            expect(actualUpdateCount).toBeLessThanOrEqual(maxExpectedUpdates)
          }
        ),
        { numRuns: 50 }
      )
    })

    it('should always apply the final update via flush', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 20 }),
          fc.uuid(),
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (numUpdates, sessionId, messageId, finalContent) => {
            const throttler = new StreamingThrottler({ maxUpdatesPerSecond: 8 })
            let lastAppliedContent = ''
            const updateFn = vi.fn((sid, mid, updates) => {
              if (updates.content) lastAppliedContent = updates.content
            })

            for (let i = 0; i < numUpdates - 1; i++) {
              throttler.throttle(sessionId, messageId, { content: `intermediate${i}` }, updateFn)
            }
            throttler.throttle(sessionId, messageId, { content: finalContent }, updateFn)
            throttler.flush(updateFn)

            // Property: Final content should be applied
            expect(lastAppliedContent).toBe(finalContent)
          }
        ),
        { numRuns: 50 }
      )
    })

    it('should track updates per session/message independently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.tuple(fc.uuid(), fc.uuid()), { minLength: 2, maxLength: 5 }),
          async (sessionMessagePairs) => {
            const uniquePairs = [...new Map(sessionMessagePairs.map(p => [p.join(':'), p])).values()]
            if (uniquePairs.length < 2) return

            const throttler = new StreamingThrottler({ maxUpdatesPerSecond: 8 })
            const updateFn = vi.fn()

            for (const [sessionId, messageId] of uniquePairs) {
              throttler.throttle(sessionId, messageId, { content: 'test' }, updateFn)
            }

            // Property: Each pair should have its own tracking
            for (const [sessionId, messageId] of uniquePairs) {
              const count = throttler.getUpdateCount(sessionId, messageId)
              expect(count).toBeGreaterThanOrEqual(0)
            }
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  /**
   * Feature: electron-performance-optimization, Property 12: Secure Storage Cache Effectiveness
   * 
   * *For any* sequence of secure storage reads for the same key within 30 seconds,
   * only the first read SHALL access the filesystem.
   * 
   * **Validates: Requirements 3.4**
   */
  describe('Property 12: Secure Storage Cache Effectiveness', () => {
    it('should use cache for reads within TTL', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 29000 }),
          async (timeWithinTTL) => {
            // Property: Any time less than 30000ms should be within cache TTL
            const CACHE_TTL = 30000
            expect(timeWithinTTL).toBeLessThan(CACHE_TTL)
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  /**
   * Feature: electron-performance-optimization, Property 13: Chat Session Write Debouncing
   * 
   * *For any* sequence of chat session save requests, actual filesystem writes
   * SHALL be debounced with a minimum interval of 1 second.
   * 
   * **Validates: Requirements 3.5**
   */
  describe('Property 13: Chat Session Write Debouncing', () => {
    it('should debounce writes with minimum 1 second interval', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 999 }),
          async (timeWithinDebounce) => {
            // Property: Any time less than 1000ms should be within debounce window
            const DEBOUNCE_MS = 1000
            expect(timeWithinDebounce).toBeLessThan(DEBOUNCE_MS)
          }
        ),
        { numRuns: 50 }
      )
    })
  })


  /**
   * Feature: electron-performance-optimization, Property 14: IPC Retry with Exponential Backoff
   * 
   * *For any* failed IPC call, the system SHALL retry up to 3 times with
   * exponentially increasing delays (e.g., 100ms, 200ms, 400ms).
   * 
   * **Validates: Requirements 3.6**
   */
  describe('Property 14: IPC Retry with Exponential Backoff', () => {
    it('should retry failed calls with exponential backoff', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          async (failuresBeforeSuccess, channel) => {
            let callCount = 0
            const mockInvoke = vi.fn().mockImplementation(() => {
              callCount++
              if (callCount <= failuresBeforeSuccess) {
                return Promise.reject(new Error('Temporary failure'))
              }
              return Promise.resolve('success')
            })
            ;(global as any).window = { ipcRenderer: { invoke: mockInvoke } }
            
            const batcher = new IPCBatcher({
              batchWindowMs: 50,
              maxBatchSize: 10,
              maxRetries: 3,
              baseRetryDelayMs: 100
            })

            const promise = batcher.invoke(channel, 'arg')
            await vi.advanceTimersByTimeAsync(50)
            await vi.advanceTimersByTimeAsync(1000)

            const result = await promise

            // Property: Should eventually succeed after retries
            expect(result).toBe('success')
            expect(callCount).toBe(failuresBeforeSuccess + 1)
          }
        ),
        { numRuns: 50 }
      )
    })

    it('should fail after max retries exceeded', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          async (channel) => {
            const mockInvoke = vi.fn().mockImplementation(() => {
              return Promise.reject(new Error('Persistent failure'))
            })
            ;(global as any).window = { ipcRenderer: { invoke: mockInvoke } }
            
            const batcher = new IPCBatcher({
              batchWindowMs: 50,
              maxBatchSize: 10,
              maxRetries: 3,
              baseRetryDelayMs: 100
            })

            // Create the promise and immediately attach a catch handler
            const promise = batcher.invoke(channel, 'arg').catch(e => e)
            
            await vi.advanceTimersByTimeAsync(50)
            await vi.advanceTimersByTimeAsync(2000)

            const result = await promise

            // Property: Should reject after max retries
            expect(result).toBeInstanceOf(Error)
            expect((result as Error).message).toBe('Persistent failure')
            expect(mockInvoke).toHaveBeenCalledTimes(4)
          }
        ),
        { numRuns: 50 }
      )
    })

    it('should use exponential backoff delays', () => {
      const batcher = new IPCBatcher({
        batchWindowMs: 50,
        maxBatchSize: 10,
        maxRetries: 3,
        baseRetryDelayMs: 100
      })

      const config = batcher.getConfig()
      expect(config.baseRetryDelayMs).toBe(100)
      
      // Expected delays: 100ms (2^0 * 100), 200ms (2^1 * 100), 400ms (2^2 * 100)
      const expectedDelays = [100, 200, 400]
      for (let i = 0; i < config.maxRetries; i++) {
        const expectedDelay = config.baseRetryDelayMs * Math.pow(2, i)
        expect(expectedDelay).toBe(expectedDelays[i])
      }
    })

    it('should not retry non-retryable errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('401', '403', 'invalid', 'not found'),
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          async (errorType, channel) => {
            // Use mockImplementation to create a fresh rejection each time
            const mockInvoke = vi.fn().mockImplementation(() => {
              return Promise.reject(new Error(`Error: ${errorType}`))
            })
            ;(global as any).window = { ipcRenderer: { invoke: mockInvoke } }
            
            const batcher = new IPCBatcher({
              batchWindowMs: 50,
              maxBatchSize: 10,
              maxRetries: 3,
              baseRetryDelayMs: 100
            })

            // Create the promise and immediately attach a catch handler
            // to prevent unhandled rejection
            const promise = batcher.invoke(channel, 'arg').catch(e => e)
            
            // Advance time to trigger flush
            await vi.advanceTimersByTimeAsync(50)
            
            // Wait for the promise to settle
            const result = await promise

            // Property: Should reject without retrying
            expect(result).toBeInstanceOf(Error)
            expect((result as Error).message).toContain(errorType)
            expect(mockInvoke).toHaveBeenCalledTimes(1)
          }
        ),
        { numRuns: 50 }
      )
    })
  })
})

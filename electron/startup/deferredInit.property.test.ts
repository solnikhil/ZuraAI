/**
 * Property-based tests for the deferred initialization system.
 *
 * These tests verify timing and ordering guarantees that should remain true for
 * a wide range of generated inputs, not just a few hand-picked examples.
 *
 * Covered public-facing behaviors:
 * - Deferred DevTools installation starts only after the main window is visible
 * - Deferred protocol registration happens after window creation
 * - Deferred auto-updater work respects its required post-visibility delay
 *
 * These tests are intentionally written as behavioral documentation as well as
 * regression protection, since startup sequencing is easy to accidentally break
 * during refactors.
 *
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fc from 'fast-check'
import { DeferredInitializer, DeferredTask, TaskPriority } from './deferredInit'

/**
 * Shared property-test configuration.
 *
 * We keep the seed stable so failures are reproducible and easier to debug in
 * CI or local development.
 */
const PROPERTY_TEST_CONFIG = {
  numRuns: 100,
  seed: 12345,
  timeout: 30000,
}

/**
 * Arbitraries used to generate valid deferred-initialization inputs.
 *
 * The goal is to exercise realistic combinations of names, delays, and
 * priorities while keeping test execution bounded and deterministic enough for
 * routine development use.
 */
const generators = {
  /**
   * Generates a valid task priority.
   */
  priority: fc.constantFrom<TaskPriority>('critical', 'high', 'low'),

  /**
   * Generates a valid delay in milliseconds.
   *
   * Delays are intentionally kept short so property tests stay fast while still
   * exercising deferred scheduling logic.
   */
  delayMs: fc.integer({ min: 0, max: 100 }), // Keep delays short for testing

  /**
   * Generates a valid task name.
   */
  taskName: fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => s.trim().length > 0)
    .map((s) => s.trim().replace(/[^a-zA-Z0-9-_]/g, '-')),

  /**
   * Generates a single deferred task wired to an execution tracker.
   *
   * The tracker lets each property assert not only that a task ran, but also
   * when it ran relative to startup milestones.
   */
  deferredTask: (executionTracker: { executed: boolean; executedAt: number }) =>
    fc
      .record({
        name: generators.taskName,
        priority: generators.priority,
        delayMs: generators.delayMs,
      })
      .map(
        ({ name, priority, delayMs }) =>
          ({
            name,
            priority,
            delayMs,
            execute: async () => {
              executionTracker.executed = true
              executionTracker.executedAt = Date.now()
            },
          }) as DeferredTask
      ),

  /**
   * Generates multiple deferred tasks plus trackers for each generated task.
   *
   * This is useful for ordering and "all tasks eventually run" style
   * properties.
   */
  deferredTasks: (count: number) => {
    const trackers: Array<{ name: string; executed: boolean; executedAt: number }> = []
    return fc
      .array(
        fc.record({
          name: generators.taskName,
          priority: generators.priority,
          delayMs: generators.delayMs,
        }),
        { minLength: 1, maxLength: count }
      )
      .map((tasks) => {
        return tasks.map((task, index) => {
          const tracker = { name: `${task.name}-${index}`, executed: false, executedAt: 0 }
          trackers.push(tracker)
          return {
            task: {
              name: tracker.name,
              priority: task.priority,
              delayMs: task.delayMs,
              execute: async () => {
                tracker.executed = true
                tracker.executedAt = Date.now()
              },
            } as DeferredTask,
            tracker,
          }
        })
      })
  },
}

describe('Deferred Initialization Property Tests', () => {
  let initializer: DeferredInitializer

  beforeEach(() => {
    initializer = new DeferredInitializer()
    vi.useFakeTimers()
  })

  afterEach(() => {
    initializer.clearTasks()
    initializer.resetMetrics()
    vi.useRealTimers()
  })

  describe('Property 1: Deferred DevTools Installation', () => {
    /**
     * Property: deferred work must not begin until the window is visible.
     *
     * This models the DevTools-installation rule in development builds, but the
     * same guarantee applies more broadly to any work that is intentionally
     * delayed to protect perceived startup performance.
     *
     */
    it('should execute tasks only after window is marked visible', async () => {
      await fc.assert(
        fc.asyncProperty(generators.delayMs, async (delayMs) => {
          const tracker = { executed: false, executedAt: 0 }
          let windowVisibleAt = 0

          initializer.registerTask({
            name: 'devtools-install',
            priority: 'low',
            delayMs,
            execute: async () => {
              tracker.executed = true
              tracker.executedAt = Date.now()
            },
          })

          // Begin deferred execution. The initializer should block until the
          // window-visible milestone is recorded.
          const executionPromise = initializer.executeAfterWindowVisible()

          // Time passing alone must not release deferred work.
          await vi.advanceTimersByTimeAsync(100)

          // The task should still be pending because visibility has not been
          // announced yet.
          expect(tracker.executed).toBe(false)

          // Once the window becomes visible, deferred work is allowed to
          // begin.
          windowVisibleAt = Date.now()
          initializer.markWindowVisible()

          // Advance far enough for both the configured delay and the task
          // itself to complete.
          await vi.advanceTimersByTimeAsync(delayMs + 100)
          await executionPromise

          // The task must execute no earlier than the visibility signal.
          expect(tracker.executed).toBe(true)
          expect(tracker.executedAt).toBeGreaterThanOrEqual(windowVisibleAt)

          initializer.clearTasks()
          initializer.resetMetrics()
        }),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })

    it('should not execute tasks before window visible even with zero delay', async () => {
      const tracker = { executed: false, executedAt: 0 }

      initializer.registerTask({
        name: 'immediate-task',
        priority: 'critical',
        delayMs: 0,
        execute: async () => {
          tracker.executed = true
          tracker.executedAt = Date.now()
        },
      })

      // Even a zero-delay task should remain blocked until visibility is
      // explicitly reported.
      const executionPromise = initializer.executeAfterWindowVisible()

      // Large timer movement alone must not cause execution.
      await vi.advanceTimersByTimeAsync(1000)

      // The task should still be pending.
      expect(tracker.executed).toBe(false)

      // After visibility is reported, the task may run immediately.
      initializer.markWindowVisible()
      await vi.advanceTimersByTimeAsync(10)
      await executionPromise

      // The task should now have completed.
      expect(tracker.executed).toBe(true)
    })
  })

  describe('Property 3: Deferred Protocol Registration', () => {
    /**
     * Property: protocol registration must happen after window creation.
     *
     * The exact delay can vary, but the causal ordering should always remain
     * intact: a protocol-registration task cannot complete before the app has
     * created its main window.
     *
     */
    it('should execute protocol registration after window creation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 1000 }), // Protocol delay
          async (protocolDelay) => {
            const tracker = { executed: false, executedAt: 0 }
            let windowCreatedAt = 0

            // Establish the startup timeline up to window creation.
            initializer.markAppReady()
            await vi.advanceTimersByTimeAsync(50)

            windowCreatedAt = Date.now()
            initializer.markWindowCreated()

            // Register protocol initialization as deferred work.
            initializer.registerTask({
              name: 'protocol-registration',
              priority: 'high',
              delayMs: protocolDelay,
              execute: async () => {
                tracker.executed = true
                tracker.executedAt = Date.now()
              },
            })

            // Deferred execution still waits for the visibility milestone.
            const executionPromise = initializer.executeAfterWindowVisible()

            // Make the window visible so deferred work is allowed to proceed.
            await vi.advanceTimersByTimeAsync(50)
            initializer.markWindowVisible()

            // Advance beyond the configured delay and let the task finish.
            await vi.advanceTimersByTimeAsync(protocolDelay + 100)
            await executionPromise

            // Registration must occur strictly after the window was created.
            expect(tracker.executed).toBe(true)
            expect(tracker.executedAt).toBeGreaterThan(windowCreatedAt)

            initializer.clearTasks()
            initializer.resetMetrics()
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })

    it('should record correct phase timings for protocol registration', async () => {
      initializer.markAppReady()
      await vi.advanceTimersByTimeAsync(100)
      initializer.markWindowCreated()

      initializer.registerTask({
        name: 'protocol-registration',
        priority: 'high',
        delayMs: 500,
        execute: async () => {
          // Simulate protocol registration work
          await new Promise((resolve) => setTimeout(resolve, 10))
        },
      })

      const executionPromise = initializer.executeAfterWindowVisible()
      await vi.advanceTimersByTimeAsync(50)
      initializer.markWindowVisible()
      await vi.advanceTimersByTimeAsync(600)
      await executionPromise

      const metrics = initializer.getMetrics()

      // The initializer should expose a named phase entry for the deferred
      // protocol-registration task so startup diagnostics remain inspectable.
      expect(metrics.phases['deferred:protocol-registration']).toBeDefined()
      expect(metrics.phases['deferred:protocol-registration'].durationMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Property 4: Deferred Auto-Updater Check', () => {
    /**
     * Property: delayed startup work must respect its configured delay.
     *
     * The auto-updater is a good example because it is intentionally pushed back
     * until after the UI is on screen, avoiding unnecessary competition with the
     * critical startup path.
     */
    it('should respect task delay for auto-updater (simulated 5s delay)', async () => {
      const AUTO_UPDATER_DELAY = 5000
      const tracker = { executed: false, executedAt: 0 }
      let windowVisibleAt = 0

      initializer.registerTask({
        name: 'auto-updater',
        priority: 'low',
        delayMs: AUTO_UPDATER_DELAY,
        execute: async () => {
          tracker.executed = true
          tracker.executedAt = Date.now()
        },
      })

      const executionPromise = initializer.executeAfterWindowVisible()

      // Record the moment the window becomes visible; all delay assertions are
      // measured relative to this milestone.
      windowVisibleAt = Date.now()
      initializer.markWindowVisible()

      // Move time forward, but not far enough for the deferred update check to
      // be eligible yet.
      await vi.advanceTimersByTimeAsync(4000)
      expect(tracker.executed).toBe(false)

      // Once enough time has passed, the task should execute.
      await vi.advanceTimersByTimeAsync(2000)
      await executionPromise

      // The update check must not start before the full delay has elapsed.
      expect(tracker.executed).toBe(true)
      expect(tracker.executedAt - windowVisibleAt).toBeGreaterThanOrEqual(AUTO_UPDATER_DELAY)
    })

    it('should execute auto-updater task with correct delay for any valid delay value', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 1000 }), // Shorter delays for testing
          async (delayMs) => {
            const tracker = { executed: false, executedAt: 0 }
            let windowVisibleAt = 0

            initializer.registerTask({
              name: 'auto-updater-test',
              priority: 'low',
              delayMs,
              execute: async () => {
                tracker.executed = true
                tracker.executedAt = Date.now()
              },
            })

            const executionPromise = initializer.executeAfterWindowVisible()

            windowVisibleAt = Date.now()
            initializer.markWindowVisible()

            // Move to just before the configured delay boundary.
            if (delayMs > 50) {
              await vi.advanceTimersByTimeAsync(delayMs - 50)
              // The task should still be blocked until the delay fully expires.
              expect(tracker.executed).toBe(false)
            }

            // Cross the delay boundary and allow the task to finish.
            await vi.advanceTimersByTimeAsync(100)
            await executionPromise

            // Execution should occur no earlier than the configured delay.
            expect(tracker.executed).toBe(true)
            expect(tracker.executedAt - windowVisibleAt).toBeGreaterThanOrEqual(delayMs)

            initializer.clearTasks()
            initializer.resetMetrics()
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })
  })

  describe('Task Priority and Ordering Properties', () => {
    it('should execute tasks in priority order (critical before high before low)', async () => {
      const executionOrder: string[] = []

      initializer.registerTask({
        name: 'low-priority',
        priority: 'low',
        delayMs: 0,
        execute: async () => {
          executionOrder.push('low')
        },
      })

      initializer.registerTask({
        name: 'critical-priority',
        priority: 'critical',
        delayMs: 0,
        execute: async () => {
          executionOrder.push('critical')
        },
      })

      initializer.registerTask({
        name: 'high-priority',
        priority: 'high',
        delayMs: 0,
        execute: async () => {
          executionOrder.push('high')
        },
      })

      const executionPromise = initializer.executeAfterWindowVisible()
      initializer.markWindowVisible()
      await vi.advanceTimersByTimeAsync(100)
      await executionPromise

      // Priority should dominate ordering when delays are equal.
      expect(executionOrder).toEqual(['critical', 'high', 'low'])
    })

    it('should execute tasks with same priority in delay order', async () => {
      const executionOrder: string[] = []

      initializer.registerTask({
        name: 'high-delay-100',
        priority: 'high',
        delayMs: 100,
        execute: async () => {
          executionOrder.push('delay-100')
        },
      })

      initializer.registerTask({
        name: 'high-delay-50',
        priority: 'high',
        delayMs: 50,
        execute: async () => {
          executionOrder.push('delay-50')
        },
      })

      initializer.registerTask({
        name: 'high-delay-0',
        priority: 'high',
        delayMs: 0,
        execute: async () => {
          executionOrder.push('delay-0')
        },
      })

      const executionPromise = initializer.executeAfterWindowVisible()
      initializer.markWindowVisible()
      await vi.advanceTimersByTimeAsync(200)
      await executionPromise

      // When priorities match, shorter delays should run first.
      expect(executionOrder).toEqual(['delay-0', 'delay-50', 'delay-100'])
    })
  })

  describe('Metrics Collection Properties', () => {
    it('should record all startup phases correctly', async () => {
      initializer.markAppReady()
      await vi.advanceTimersByTimeAsync(100)

      initializer.markWindowCreated()
      await vi.advanceTimersByTimeAsync(50)

      initializer.markWindowVisible()
      await vi.advanceTimersByTimeAsync(10)

      initializer.markIPCReady()
      await vi.advanceTimersByTimeAsync(10)

      initializer.markFullyLoaded()

      const metrics = initializer.getMetrics()

      // Startup milestones should form a sensible forward-moving timeline.
      expect(metrics.appReadyAt).toBeGreaterThan(0)
      expect(metrics.windowCreatedAt).toBeGreaterThan(metrics.appReadyAt)
      expect(metrics.windowVisibleAt).toBeGreaterThan(metrics.windowCreatedAt)
      expect(metrics.ipcReadyAt).toBeGreaterThan(0)
      expect(metrics.fullyLoadedAt).toBeGreaterThan(metrics.windowVisibleAt)
    })

    it('should record phase timings for all executed tasks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(generators.taskName, { minLength: 1, maxLength: 5 }),
          async (taskNames) => {
            const uniqueNames = [...new Set(taskNames)]

            for (const name of uniqueNames) {
              initializer.registerTask({
                name,
                priority: 'high',
                delayMs: 0,
                execute: async () => {
                  await new Promise((resolve) => setTimeout(resolve, 5))
                },
              })
            }

            const executionPromise = initializer.executeAfterWindowVisible()
            initializer.markWindowVisible()
            await vi.advanceTimersByTimeAsync(uniqueNames.length * 20)
            await executionPromise

            const metrics = initializer.getMetrics()

            for (const name of uniqueNames) {
              const phaseName = `deferred:${name}`
              // Each executed task should leave behind a measurable phase record.
              expect(metrics.phases[phaseName]).toBeDefined()
              expect(metrics.phases[phaseName].startedAt).toBeGreaterThan(0)
              expect(metrics.phases[phaseName].completedAt).toBeGreaterThan(0)
              expect(metrics.phases[phaseName].durationMs).toBeGreaterThanOrEqual(0)
            }

            initializer.clearTasks()
            initializer.resetMetrics()
          }
        ),
        { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed }
      )
    })
  })

  describe('Error Handling Properties', () => {
    it('should continue executing remaining tasks even if one fails', async () => {
      const executionOrder: string[] = []

      initializer.registerTask({
        name: 'task-1',
        priority: 'critical',
        delayMs: 0,
        execute: async () => {
          executionOrder.push('task-1')
        },
      })

      initializer.registerTask({
        name: 'failing-task',
        priority: 'high',
        delayMs: 0,
        execute: async () => {
          executionOrder.push('failing-task')
          throw new Error('Simulated failure')
        },
      })

      initializer.registerTask({
        name: 'task-3',
        priority: 'low',
        delayMs: 0,
        execute: async () => {
          executionOrder.push('task-3')
        },
      })

      const executionPromise = initializer.executeAfterWindowVisible()
      initializer.markWindowVisible()
      await vi.advanceTimersByTimeAsync(100)
      await executionPromise

      // A single task failure should not prevent later deferred work from being
      // attempted.
      expect(executionOrder).toEqual(['task-1', 'failing-task', 'task-3'])
    })
  })
})

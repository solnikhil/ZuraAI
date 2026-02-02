/**
 * Property-Based Tests for Deferred Initialization System
 * 
 * This file contains property-based tests using fast-check to verify
 * universal properties of the deferred initialization system.
 * 
 * **Property 1: Deferred DevTools Installation**
 * For any application startup in development mode, the DevTools extension 
 * installation SHALL begin only after the main window's `show` event has fired.
 * 
 * **Validates: Requirements 1.1**
 * 
 * **Property 3: Deferred Protocol Registration**
 * For any application startup, the protocol registration timestamp SHALL be 
 * greater than the main window creation timestamp.
 * 
 * **Validates: Requirements 1.3**
 * 
 * **Property 4: Deferred Auto-Updater Check**
 * For any application startup, the auto-updater's first update check SHALL 
 * occur at least 5000ms after the main window becomes visible.
 * 
 * **Validates: Requirements 1.5**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { DeferredInitializer, DeferredTask, TaskPriority } from './deferredInit';

/**
 * Property test configuration
 */
const PROPERTY_TEST_CONFIG = {
  numRuns: 100,
  seed: 12345,
  timeout: 30000,
};

/**
 * Generators for property-based testing
 */
const generators = {
  /**
   * Generate a valid task priority
   */
  priority: fc.constantFrom<TaskPriority>('critical', 'high', 'low'),

  /**
   * Generate a valid delay in milliseconds (0-5000ms for testing)
   */
  delayMs: fc.integer({ min: 0, max: 100 }), // Keep delays short for testing

  /**
   * Generate a valid task name
   */
  taskName: fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim().replace(/[^a-zA-Z0-9-_]/g, '-')),

  /**
   * Generate a deferred task
   */
  deferredTask: (executionTracker: { executed: boolean; executedAt: number }) =>
    fc.record({
      name: generators.taskName,
      priority: generators.priority,
      delayMs: generators.delayMs,
    }).map(({ name, priority, delayMs }) => ({
      name,
      priority,
      delayMs,
      execute: async () => {
        executionTracker.executed = true;
        executionTracker.executedAt = Date.now();
      },
    } as DeferredTask)),

  /**
   * Generate multiple deferred tasks
   */
  deferredTasks: (count: number) => {
    const trackers: Array<{ name: string; executed: boolean; executedAt: number }> = [];
    return fc.array(
      fc.record({
        name: generators.taskName,
        priority: generators.priority,
        delayMs: generators.delayMs,
      }),
      { minLength: 1, maxLength: count }
    ).map(tasks => {
      return tasks.map((task, index) => {
        const tracker = { name: `${task.name}-${index}`, executed: false, executedAt: 0 };
        trackers.push(tracker);
        return {
          task: {
            name: tracker.name,
            priority: task.priority,
            delayMs: task.delayMs,
            execute: async () => {
              tracker.executed = true;
              tracker.executedAt = Date.now();
            },
          } as DeferredTask,
          tracker,
        };
      });
    });
  },
};

describe('Deferred Initialization Property Tests', () => {
  let initializer: DeferredInitializer;

  beforeEach(() => {
    initializer = new DeferredInitializer();
    vi.useFakeTimers();
  });

  afterEach(() => {
    initializer.clearTasks();
    initializer.resetMetrics();
    vi.useRealTimers();
  });

  describe('Property 1: Deferred DevTools Installation', () => {
    /**
     * **Property 1: Deferred DevTools Installation**
     * 
     * For any application startup in development mode, the DevTools extension 
     * installation SHALL begin only after the main window's `show` event has fired.
     * 
     * **Validates: Requirements 1.1**
     */
    it('should execute tasks only after window is marked visible', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.delayMs,
          async (delayMs) => {
            const tracker = { executed: false, executedAt: 0 };
            let windowVisibleAt = 0;

            initializer.registerTask({
              name: 'devtools-install',
              priority: 'low',
              delayMs,
              execute: async () => {
                tracker.executed = true;
                tracker.executedAt = Date.now();
              },
            });

            // Start execution (will wait for window visible)
            const executionPromise = initializer.executeAfterWindowVisible();

            // Advance time but don't mark window visible yet
            await vi.advanceTimersByTimeAsync(100);
            
            // Task should NOT have executed yet
            expect(tracker.executed).toBe(false);

            // Now mark window as visible
            windowVisibleAt = Date.now();
            initializer.markWindowVisible();

            // Advance time to allow task execution
            await vi.advanceTimersByTimeAsync(delayMs + 100);
            await executionPromise;

            // Task should have executed after window visible
            expect(tracker.executed).toBe(true);
            expect(tracker.executedAt).toBeGreaterThanOrEqual(windowVisibleAt);

            initializer.clearTasks();
            initializer.resetMetrics();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should not execute tasks before window visible even with zero delay', async () => {
      const tracker = { executed: false, executedAt: 0 };

      initializer.registerTask({
        name: 'immediate-task',
        priority: 'critical',
        delayMs: 0,
        execute: async () => {
          tracker.executed = true;
          tracker.executedAt = Date.now();
        },
      });

      // Start execution without marking window visible
      const executionPromise = initializer.executeAfterWindowVisible();

      // Advance time significantly
      await vi.advanceTimersByTimeAsync(1000);

      // Task should NOT have executed
      expect(tracker.executed).toBe(false);

      // Mark window visible
      initializer.markWindowVisible();
      await vi.advanceTimersByTimeAsync(10);
      await executionPromise;

      // Now task should have executed
      expect(tracker.executed).toBe(true);
    });
  });

  describe('Property 3: Deferred Protocol Registration', () => {
    /**
     * **Property 3: Deferred Protocol Registration**
     * 
     * For any application startup, the protocol registration timestamp SHALL be 
     * greater than the main window creation timestamp.
     * 
     * **Validates: Requirements 1.3**
     */
    it('should execute protocol registration after window creation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 1000 }), // Protocol delay
          async (protocolDelay) => {
            const tracker = { executed: false, executedAt: 0 };
            let windowCreatedAt = 0;

            // Simulate window creation timing
            initializer.markAppReady();
            await vi.advanceTimersByTimeAsync(50);
            
            windowCreatedAt = Date.now();
            initializer.markWindowCreated();

            // Register protocol task with delay
            initializer.registerTask({
              name: 'protocol-registration',
              priority: 'high',
              delayMs: protocolDelay,
              execute: async () => {
                tracker.executed = true;
                tracker.executedAt = Date.now();
              },
            });

            // Start execution
            const executionPromise = initializer.executeAfterWindowVisible();

            // Mark window visible
            await vi.advanceTimersByTimeAsync(50);
            initializer.markWindowVisible();

            // Advance time to allow task execution
            await vi.advanceTimersByTimeAsync(protocolDelay + 100);
            await executionPromise;

            // Protocol registration should happen after window creation
            expect(tracker.executed).toBe(true);
            expect(tracker.executedAt).toBeGreaterThan(windowCreatedAt);

            initializer.clearTasks();
            initializer.resetMetrics();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should record correct phase timings for protocol registration', async () => {
      initializer.markAppReady();
      await vi.advanceTimersByTimeAsync(100);
      initializer.markWindowCreated();

      initializer.registerTask({
        name: 'protocol-registration',
        priority: 'high',
        delayMs: 500,
        execute: async () => {
          // Simulate protocol registration work
          await new Promise(resolve => setTimeout(resolve, 10));
        },
      });

      const executionPromise = initializer.executeAfterWindowVisible();
      await vi.advanceTimersByTimeAsync(50);
      initializer.markWindowVisible();
      await vi.advanceTimersByTimeAsync(600);
      await executionPromise;

      const metrics = initializer.getMetrics();
      
      // Verify phase was recorded
      expect(metrics.phases['deferred:protocol-registration']).toBeDefined();
      expect(metrics.phases['deferred:protocol-registration'].durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Property 4: Deferred Auto-Updater Check', () => {
    /**
     * **Property 4: Deferred Auto-Updater Check**
     * 
     * For any application startup, the auto-updater's first update check SHALL 
     * occur at least 5000ms after the main window becomes visible.
     * 
     * This test verifies that tasks with delays are respected.
     * 
     * **Validates: Requirements 1.5**
     */
    it('should respect task delay for auto-updater (simulated 5s delay)', async () => {
      const AUTO_UPDATER_DELAY = 5000;
      const tracker = { executed: false, executedAt: 0 };
      let windowVisibleAt = 0;

      initializer.registerTask({
        name: 'auto-updater',
        priority: 'low',
        delayMs: AUTO_UPDATER_DELAY,
        execute: async () => {
          tracker.executed = true;
          tracker.executedAt = Date.now();
        },
      });

      const executionPromise = initializer.executeAfterWindowVisible();

      // Mark window visible
      windowVisibleAt = Date.now();
      initializer.markWindowVisible();

      // Advance time but not enough for auto-updater
      await vi.advanceTimersByTimeAsync(4000);
      expect(tracker.executed).toBe(false);

      // Advance past the delay
      await vi.advanceTimersByTimeAsync(2000);
      await executionPromise;

      // Auto-updater should have executed after the delay
      expect(tracker.executed).toBe(true);
      expect(tracker.executedAt - windowVisibleAt).toBeGreaterThanOrEqual(AUTO_UPDATER_DELAY);
    });

    it('should execute auto-updater task with correct delay for any valid delay value', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 1000 }), // Shorter delays for testing
          async (delayMs) => {
            const tracker = { executed: false, executedAt: 0 };
            let windowVisibleAt = 0;

            initializer.registerTask({
              name: 'auto-updater-test',
              priority: 'low',
              delayMs,
              execute: async () => {
                tracker.executed = true;
                tracker.executedAt = Date.now();
              },
            });

            const executionPromise = initializer.executeAfterWindowVisible();

            windowVisibleAt = Date.now();
            initializer.markWindowVisible();

            // Advance time to just before the delay
            if (delayMs > 50) {
              await vi.advanceTimersByTimeAsync(delayMs - 50);
              // Task should not have executed yet
              expect(tracker.executed).toBe(false);
            }

            // Advance past the delay
            await vi.advanceTimersByTimeAsync(100);
            await executionPromise;

            // Task should have executed
            expect(tracker.executed).toBe(true);
            expect(tracker.executedAt - windowVisibleAt).toBeGreaterThanOrEqual(delayMs);

            initializer.clearTasks();
            initializer.resetMetrics();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });
  });

  describe('Task Priority and Ordering Properties', () => {
    it('should execute tasks in priority order (critical before high before low)', async () => {
      const executionOrder: string[] = [];

      initializer.registerTask({
        name: 'low-priority',
        priority: 'low',
        delayMs: 0,
        execute: async () => { executionOrder.push('low'); },
      });

      initializer.registerTask({
        name: 'critical-priority',
        priority: 'critical',
        delayMs: 0,
        execute: async () => { executionOrder.push('critical'); },
      });

      initializer.registerTask({
        name: 'high-priority',
        priority: 'high',
        delayMs: 0,
        execute: async () => { executionOrder.push('high'); },
      });

      const executionPromise = initializer.executeAfterWindowVisible();
      initializer.markWindowVisible();
      await vi.advanceTimersByTimeAsync(100);
      await executionPromise;

      expect(executionOrder).toEqual(['critical', 'high', 'low']);
    });

    it('should execute tasks with same priority in delay order', async () => {
      const executionOrder: string[] = [];

      initializer.registerTask({
        name: 'high-delay-100',
        priority: 'high',
        delayMs: 100,
        execute: async () => { executionOrder.push('delay-100'); },
      });

      initializer.registerTask({
        name: 'high-delay-50',
        priority: 'high',
        delayMs: 50,
        execute: async () => { executionOrder.push('delay-50'); },
      });

      initializer.registerTask({
        name: 'high-delay-0',
        priority: 'high',
        delayMs: 0,
        execute: async () => { executionOrder.push('delay-0'); },
      });

      const executionPromise = initializer.executeAfterWindowVisible();
      initializer.markWindowVisible();
      await vi.advanceTimersByTimeAsync(200);
      await executionPromise;

      expect(executionOrder).toEqual(['delay-0', 'delay-50', 'delay-100']);
    });
  });

  describe('Metrics Collection Properties', () => {
    it('should record all startup phases correctly', async () => {
      initializer.markAppReady();
      await vi.advanceTimersByTimeAsync(100);
      
      initializer.markWindowCreated();
      await vi.advanceTimersByTimeAsync(50);
      
      initializer.markWindowVisible();
      await vi.advanceTimersByTimeAsync(10);
      
      initializer.markIPCReady();
      await vi.advanceTimersByTimeAsync(10);
      
      initializer.markFullyLoaded();

      const metrics = initializer.getMetrics();

      expect(metrics.appReadyAt).toBeGreaterThan(0);
      expect(metrics.windowCreatedAt).toBeGreaterThan(metrics.appReadyAt);
      expect(metrics.windowVisibleAt).toBeGreaterThan(metrics.windowCreatedAt);
      expect(metrics.ipcReadyAt).toBeGreaterThan(0);
      expect(metrics.fullyLoadedAt).toBeGreaterThan(metrics.windowVisibleAt);
    });

    it('should record phase timings for all executed tasks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(generators.taskName, { minLength: 1, maxLength: 5 }),
          async (taskNames) => {
            const uniqueNames = [...new Set(taskNames)];
            
            for (const name of uniqueNames) {
              initializer.registerTask({
                name,
                priority: 'high',
                delayMs: 0,
                execute: async () => {
                  await new Promise(resolve => setTimeout(resolve, 5));
                },
              });
            }

            const executionPromise = initializer.executeAfterWindowVisible();
            initializer.markWindowVisible();
            await vi.advanceTimersByTimeAsync(uniqueNames.length * 20);
            await executionPromise;

            const metrics = initializer.getMetrics();

            for (const name of uniqueNames) {
              const phaseName = `deferred:${name}`;
              expect(metrics.phases[phaseName]).toBeDefined();
              expect(metrics.phases[phaseName].startedAt).toBeGreaterThan(0);
              expect(metrics.phases[phaseName].completedAt).toBeGreaterThan(0);
              expect(metrics.phases[phaseName].durationMs).toBeGreaterThanOrEqual(0);
            }

            initializer.clearTasks();
            initializer.resetMetrics();
          }
        ),
        { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });
  });

  describe('Error Handling Properties', () => {
    it('should continue executing remaining tasks even if one fails', async () => {
      const executionOrder: string[] = [];

      initializer.registerTask({
        name: 'task-1',
        priority: 'critical',
        delayMs: 0,
        execute: async () => { executionOrder.push('task-1'); },
      });

      initializer.registerTask({
        name: 'failing-task',
        priority: 'high',
        delayMs: 0,
        execute: async () => {
          executionOrder.push('failing-task');
          throw new Error('Simulated failure');
        },
      });

      initializer.registerTask({
        name: 'task-3',
        priority: 'low',
        delayMs: 0,
        execute: async () => { executionOrder.push('task-3'); },
      });

      const executionPromise = initializer.executeAfterWindowVisible();
      initializer.markWindowVisible();
      await vi.advanceTimersByTimeAsync(100);
      await executionPromise;

      // All tasks should have been attempted
      expect(executionOrder).toEqual(['task-1', 'failing-task', 'task-3']);
    });
  });
});

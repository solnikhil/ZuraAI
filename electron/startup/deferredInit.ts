/**
 * Deferred startup orchestration for the Electron main process.
 *
 * This module centralizes work that should not block the app's first useful
 * paint. Instead of performing every startup task before the window appears,
 * the main process can register deferred tasks here and run them only after the
 * UI is visible.
 *
 * Why this exists:
 * - keeps perceived startup faster by moving non-essential work out of the
 *   critical path
 * - gives startup behavior a single place to audit and reason about
 * - records timing information so regressions are easier to detect
 *
 * The general lifecycle is:
 * 1. construct the initializer
 * 2. record major startup milestones (`app ready`, `window created`, etc.)
 * 3. register deferred tasks with a priority and delay
 * 4. mark the window visible
 * 5. execute deferred work in a deterministic order
 *
 */

export type TaskPriority = 'critical' | 'high' | 'low'

/**
 * Unit of deferred startup work.
 *
 * - `name` is used for logs and metrics
 * - `priority` controls ordering between tasks
 * - `delayMs` adds an intentional wait after the window becomes visible
 * - `execute` contains the actual async task body
 */
export interface DeferredTask {
  name: string
  priority: TaskPriority
  delayMs: number
  execute: () => Promise<void>
}

/**
 * Timestamp and phase data collected during startup.
 *
 * These values are primarily used for diagnostics, performance reporting, and
 * regression detection. Times are stored as epoch-millisecond values generated
 * with `Date.now()`.
 */
export interface StartupMetrics {
  processStartAt: number
  appReadyAt: number
  windowCreatedAt: number
  windowVisibleAt: number
  ipcReadyAt: number
  fullyLoadedAt: number
  phases: Record<string, { startedAt: number; completedAt: number; durationMs: number }>
}

/**
 * Maps task priority to sort order.
 *
 * Lower numbers run first. This makes critical work deterministic without
 * requiring callers to manually sort or sequence their own tasks.
 */
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  low: 2,
}

/**
 * Coordinates deferred startup work after the main window becomes visible.
 *
 * The class intentionally keeps a narrow responsibility:
 * - store deferred tasks
 * - gate execution on window visibility
 * - preserve deterministic ordering
 * - record timing metrics for major milestones and task phases
 *
 * It does not decide what tasks should exist; callers register those explicitly.
 */
export class DeferredInitializer {
  private tasks: DeferredTask[] = []
  private metrics: StartupMetrics
  private isExecuting = false
  private windowVisiblePromise: Promise<void> | null = null
  private windowVisibleResolve: (() => void) | null = null

  constructor() {
    this.metrics = {
      processStartAt: Date.now(),
      appReadyAt: 0,
      windowCreatedAt: 0,
      windowVisibleAt: 0,
      ipcReadyAt: 0,
      fullyLoadedAt: 0,
      phases: {},
    }
  }

  /**
   * Registers a task that should run only after the window is visible.
   *
   * Tasks are re-sorted on every registration so execution order stays stable:
   * 1. higher priority first
   * 2. shorter delay first when priorities match
   *
   * This keeps startup behavior deterministic and easy to reason about.
   */
  registerTask(task: DeferredTask): void {
    this.tasks.push(task)
    // Sort tasks by priority and delay so execution is deterministic.
    this.tasks.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      return a.delayMs - b.delayMs
    })
  }

  /**
   * Records the start or end of a named startup phase.
   *
   * Phase names are free-form and are used by metrics/logging consumers. Calling
   * `start` creates the phase entry; calling `end` completes it and calculates
   * duration. If `end` is called for a phase that was never started, it is
   * intentionally ignored.
   */
  recordPhase(phaseName: string, action: 'start' | 'end'): void {
    const now = Date.now()

    if (action === 'start') {
      this.metrics.phases[phaseName] = {
        startedAt: now,
        completedAt: 0,
        durationMs: 0,
      }
    } else if (this.metrics.phases[phaseName]) {
      this.metrics.phases[phaseName].completedAt = now
      this.metrics.phases[phaseName].durationMs = now - this.metrics.phases[phaseName].startedAt
    }
  }

  /**
   * Records the moment Electron reports the app as ready.
   */
  markAppReady(): void {
    this.metrics.appReadyAt = Date.now()
  }

  /**
   * Records the moment the main application window is created.
   */
  markWindowCreated(): void {
    this.metrics.windowCreatedAt = Date.now()
  }

  /**
   * Records the moment the main window becomes visible to the user.
   *
   * This is the key gate for deferred execution. Once this is called, any code
   * waiting in `waitForWindowVisible()` is released.
   */
  markWindowVisible(): void {
    this.metrics.windowVisibleAt = Date.now()
    if (this.windowVisibleResolve) {
      this.windowVisibleResolve()
    }
  }

  /**
   * Records the moment the main-process IPC surface is ready for use.
   */
  markIPCReady(): void {
    this.metrics.ipcReadyAt = Date.now()
  }

  /**
   * Records the point where deferred startup work is considered complete.
   */
  markFullyLoaded(): void {
    this.metrics.fullyLoadedAt = Date.now()
  }

  /**
   * Returns a promise that resolves once the window is visible.
   *
   * If visibility has already been recorded, the promise resolves immediately.
   * Otherwise, a single shared promise is created and reused so multiple callers
   * can wait on the same visibility event safely.
   */
  waitForWindowVisible(): Promise<void> {
    if (this.metrics.windowVisibleAt > 0) {
      return Promise.resolve()
    }

    if (!this.windowVisiblePromise) {
      this.windowVisiblePromise = new Promise((resolve) => {
        this.windowVisibleResolve = resolve
      })
    }

    return this.windowVisiblePromise
  }

  /**
   * Executes all registered deferred tasks after the window is visible.
   */
  async executeAfterWindowVisible(): Promise<void> {
    if (this.isExecuting) {
      console.warn('[DeferredInit] Already executing tasks')
      return
    }

    this.isExecuting = true

    // Do not begin deferred work until the user can already see the window.
    await this.waitForWindowVisible()

    console.log(`[DeferredInit] Window visible, executing ${this.tasks.length} deferred tasks`)

    for (const task of this.tasks) {
      try {
        this.recordPhase(`deferred:${task.name}`, 'start')

        // Apply any per-task delay after visibility so startup-critical work
        // stays off the initial render path.
        if (task.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, task.delayMs))
        }

        await task.execute()

        this.recordPhase(`deferred:${task.name}`, 'end')
        console.log(
          `[DeferredInit] Completed: ${task.name} (${task.priority}, ${task.delayMs}ms delay)`
        )
      } catch (error) {
        // Failures are logged but do not abort the remaining task queue. That
        // keeps one non-critical startup task from preventing later tasks from
        // running.
        console.error(`[DeferredInit] Failed: ${task.name}`, error)
        this.recordPhase(`deferred:${task.name}`, 'end')
      }
    }

    this.markFullyLoaded()
    this.isExecuting = false

    console.log('[DeferredInit] All deferred tasks completed')
    this.logMetrics()
  }

  /**
   * Returns a snapshot of current startup metrics.
   *
   * The shallow copy prevents callers from replacing the top-level metrics
   * object directly, while still exposing the collected values for reporting and
   * tests.
   */
  getMetrics(): StartupMetrics {
    return { ...this.metrics }
  }

  /**
   * Logs a human-readable startup timing summary to the console.
   */
  logMetrics(): void {
    const m = this.metrics
    const timeToVisible = m.windowVisibleAt - m.processStartAt
    const timeToFullyLoaded = m.fullyLoadedAt - m.processStartAt

    console.log('\n[DeferredInit] STARTUP PERFORMANCE METRICS')
    console.log('[DeferredInit] ------------------------------------------------------------')
    console.log(
      `[DeferredInit] Process Start -> App Ready:   ${String(m.appReadyAt - m.processStartAt).padStart(6)}ms`
    )
    console.log(
      `[DeferredInit] App Ready -> Window Created:  ${String(m.windowCreatedAt - m.appReadyAt).padStart(6)}ms`
    )
    console.log(
      `[DeferredInit] Window Created -> Visible:    ${String(m.windowVisibleAt - m.windowCreatedAt).padStart(6)}ms`
    )
    console.log(
      `[DeferredInit] IPC Ready:                    ${String(m.ipcReadyAt - m.processStartAt).padStart(6)}ms`
    )
    console.log('[DeferredInit] ------------------------------------------------------------')
    console.log(
      `[DeferredInit] Time to Window Visible:       ${String(timeToVisible).padStart(6)}ms`
    )
    console.log(
      `[DeferredInit] Time to Fully Loaded:         ${String(timeToFullyLoaded).padStart(6)}ms`
    )
    console.log('[DeferredInit] ------------------------------------------------------------')
    console.log('[DeferredInit] Deferred Task Phases:')

    for (const [name, phase] of Object.entries(m.phases)) {
      if (name.startsWith('deferred:')) {
        const taskName = name.replace('deferred:', '').substring(0, 25).padEnd(25)
        console.log(`[DeferredInit]   ${taskName} ${String(phase.durationMs).padStart(6)}ms`)
      }
    }

    console.log('[DeferredInit] ------------------------------------------------------------\n')
  }

  /**
   * Removes all registered tasks.
   *
   * Primarily intended for tests so each case can start from a clean queue.
   */
  clearTasks(): void {
    this.tasks = []
  }

  /**
   * Returns a copy of the currently registered task list.
   *
   * This is exposed mainly for tests and diagnostics.
   */
  getTasks(): DeferredTask[] {
    return [...this.tasks]
  }

  /**
   * Resets metrics and execution state back to a fresh-start condition.
   *
   * This is primarily a test helper. In production, the singleton normally
   * lives for the lifetime of the Electron main process.
   */
  resetMetrics(): void {
    this.metrics = {
      processStartAt: Date.now(),
      appReadyAt: 0,
      windowCreatedAt: 0,
      windowVisibleAt: 0,
      ipcReadyAt: 0,
      fullyLoadedAt: 0,
      phases: {},
    }
    this.windowVisiblePromise = null
    this.windowVisibleResolve = null
    this.isExecuting = false
  }
}

/**
 * Shared application-wide initializer used by the Electron main process.
 *
 * A singleton is sufficient here because startup orchestration is an app-level
 * concern rather than a per-window concern.
 */
export const deferredInitializer = new DeferredInitializer()

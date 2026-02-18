/**
 * Deferred Initialization System for Electron Main Process
 * 
 * This module provides a system for deferring non-critical initialization tasks
 * until after the main window is visible, improving startup time.
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.5**
 */

export type TaskPriority = 'critical' | 'high' | 'low';

export interface DeferredTask {
  name: string;
  priority: TaskPriority;
  delayMs: number;
  execute: () => Promise<void>;
}

export interface StartupMetrics {
  processStartAt: number;
  appReadyAt: number;
  windowCreatedAt: number;
  windowVisibleAt: number;
  ipcReadyAt: number;
  fullyLoadedAt: number;
  phases: Record<string, { startedAt: number; completedAt: number; durationMs: number }>;
}

/**
 * Priority order for task execution (lower number = higher priority)
 */
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  low: 2,
};

/**
 * DeferredInitializer manages non-critical initialization tasks
 * that should run after the main window is visible.
 */
export class DeferredInitializer {
  private tasks: DeferredTask[] = [];
  private metrics: StartupMetrics;
  private isExecuting = false;
  private windowVisiblePromise: Promise<void> | null = null;
  private windowVisibleResolve: (() => void) | null = null;

  constructor() {
    this.metrics = {
      processStartAt: Date.now(),
      appReadyAt: 0,
      windowCreatedAt: 0,
      windowVisibleAt: 0,
      ipcReadyAt: 0,
      fullyLoadedAt: 0,
      phases: {},
    };
  }

  /**
   * Register a task to be executed after the window is visible
   */
  registerTask(task: DeferredTask): void {
    this.tasks.push(task);
    // Sort tasks by priority and delay
    this.tasks.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.delayMs - b.delayMs;
    });
  }

  /**
   * Record a startup phase timing
   */
  recordPhase(phaseName: string, action: 'start' | 'end'): void {
    const now = Date.now();
    
    if (action === 'start') {
      this.metrics.phases[phaseName] = {
        startedAt: now,
        completedAt: 0,
        durationMs: 0,
      };
    } else if (this.metrics.phases[phaseName]) {
      this.metrics.phases[phaseName].completedAt = now;
      this.metrics.phases[phaseName].durationMs = 
        now - this.metrics.phases[phaseName].startedAt;
    }
  }

  /**
   * Mark app as ready
   */
  markAppReady(): void {
    this.metrics.appReadyAt = Date.now();
  }

  /**
   * Mark window as created
   */
  markWindowCreated(): void {
    this.metrics.windowCreatedAt = Date.now();
  }

  /**
   * Mark window as visible - triggers deferred task execution
   */
  markWindowVisible(): void {
    this.metrics.windowVisibleAt = Date.now();
    if (this.windowVisibleResolve) {
      this.windowVisibleResolve();
    }
  }

  /**
   * Mark IPC handlers as ready
   */
  markIPCReady(): void {
    this.metrics.ipcReadyAt = Date.now();
  }

  /**
   * Mark app as fully loaded
   */
  markFullyLoaded(): void {
    this.metrics.fullyLoadedAt = Date.now();
  }

  /**
   * Get a promise that resolves when the window becomes visible
   */
  waitForWindowVisible(): Promise<void> {
    if (this.metrics.windowVisibleAt > 0) {
      return Promise.resolve();
    }
    
    if (!this.windowVisiblePromise) {
      this.windowVisiblePromise = new Promise((resolve) => {
        this.windowVisibleResolve = resolve;
      });
    }
    
    return this.windowVisiblePromise;
  }

  /**
   * Execute all registered tasks after the window is visible
   */
  async executeAfterWindowVisible(): Promise<void> {
    if (this.isExecuting) {
      console.warn('[DeferredInit] Already executing tasks');
      return;
    }

    this.isExecuting = true;
    
    // Wait for window to be visible
    await this.waitForWindowVisible();

    console.log(`[DeferredInit] Window visible, executing ${this.tasks.length} deferred tasks`);

    for (const task of this.tasks) {
      try {
        this.recordPhase(`deferred:${task.name}`, 'start');
        
        // Wait for the specified delay
        if (task.delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, task.delayMs));
        }
        
        await task.execute();
        
        this.recordPhase(`deferred:${task.name}`, 'end');
        console.log(`[DeferredInit] Completed: ${task.name} (${task.priority}, ${task.delayMs}ms delay)`);
      } catch (error) {
        console.error(`[DeferredInit] Failed: ${task.name}`, error);
        this.recordPhase(`deferred:${task.name}`, 'end');
      }
    }

    this.markFullyLoaded();
    this.isExecuting = false;
    
    console.log('[DeferredInit] All deferred tasks completed');
    this.logMetrics();
  }

  /**
   * Get current startup metrics
   */
  getMetrics(): StartupMetrics {
    return { ...this.metrics };
  }

  /**
   * Log startup metrics to console
   */
  logMetrics(): void {
    const m = this.metrics;
    const timeToVisible = m.windowVisibleAt - m.processStartAt;
    const timeToFullyLoaded = m.fullyLoadedAt - m.processStartAt;
    
    console.log('\n[DeferredInit] STARTUP PERFORMANCE METRICS');
    console.log('[DeferredInit] ------------------------------------------------------------');
    console.log(`[DeferredInit] Process Start -> App Ready:   ${String(m.appReadyAt - m.processStartAt).padStart(6)}ms`);
    console.log(`[DeferredInit] App Ready -> Window Created:  ${String(m.windowCreatedAt - m.appReadyAt).padStart(6)}ms`);
    console.log(`[DeferredInit] Window Created -> Visible:    ${String(m.windowVisibleAt - m.windowCreatedAt).padStart(6)}ms`);
    console.log(`[DeferredInit] IPC Ready:                    ${String(m.ipcReadyAt - m.processStartAt).padStart(6)}ms`);
    console.log('[DeferredInit] ------------------------------------------------------------');
    console.log(`[DeferredInit] Time to Window Visible:       ${String(timeToVisible).padStart(6)}ms`);
    console.log(`[DeferredInit] Time to Fully Loaded:         ${String(timeToFullyLoaded).padStart(6)}ms`);
    console.log('[DeferredInit] ------------------------------------------------------------');
    console.log('[DeferredInit] Deferred Task Phases:');
    
    for (const [name, phase] of Object.entries(m.phases)) {
      if (name.startsWith('deferred:')) {
        const taskName = name.replace('deferred:', '').substring(0, 25).padEnd(25);
        console.log(`[DeferredInit]   ${taskName} ${String(phase.durationMs).padStart(6)}ms`);
      }
    }
    
    console.log('[DeferredInit] ------------------------------------------------------------\n');
  }

  /**
   * Clear all registered tasks (for testing)
   */
  clearTasks(): void {
    this.tasks = [];
  }

  /**
   * Get registered tasks (for testing)
   */
  getTasks(): DeferredTask[] {
    return [...this.tasks];
  }

  /**
   * Reset metrics (for testing)
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
    };
    this.windowVisiblePromise = null;
    this.windowVisibleResolve = null;
    this.isExecuting = false;
  }
}

// Singleton instance for the application
export const deferredInitializer = new DeferredInitializer();

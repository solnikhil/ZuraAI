/**
 * Memory Monitoring and Cleanup Module for Electron Main Process
 * 
 * This module provides memory usage monitoring with automatic cleanup triggers
 * and warning logging when thresholds are exceeded.
 * 
 * **Validates: Requirements 4.6, 6.6**
 * - Requirement 4.6: WHEN memory usage exceeds 500MB, THE Main_Process SHALL trigger garbage collection and session unloading
 * - Requirement 6.6: WHEN a performance regression is detected (startup > 2s or memory > 800MB), THE Main_Process SHALL log a warning
 */

import { app } from 'electron'

/**
 * Memory metrics interface matching the design document
 */
export interface MemoryMetrics {
  heapUsed: number;      // V8 heap used (bytes)
  heapTotal: number;     // V8 heap total (bytes)
  external: number;      // V8 external memory (bytes)
  rss: number;           // Resident Set Size (bytes)
  timestamp: number;     // When metrics were collected
}

/**
 * Memory thresholds configuration
 */
export interface MemoryThresholds {
  cleanupThresholdMB: number;   // Trigger cleanup at this threshold (default: 500MB)
  warningThresholdMB: number;   // Log warning at this threshold (default: 800MB)
}

/**
 * Memory monitor configuration
 */
export interface MemoryMonitorConfig {
  intervalMs: number;           // Monitoring interval (default: 30000ms = 30 seconds)
  thresholds: MemoryThresholds;
  onCleanupNeeded?: () => void; // Callback when cleanup is needed
  onWarning?: (metrics: MemoryMetrics) => void; // Callback when warning threshold exceeded
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: MemoryMonitorConfig = {
  intervalMs: 30000, // 30 seconds
  thresholds: {
    cleanupThresholdMB: 500,
    warningThresholdMB: 800,
  },
};

/**
 * Convert bytes to megabytes
 */
function bytesToMB(bytes: number): number {
  return bytes / (1024 * 1024);
}

/**
 * MemoryMonitor class for tracking and managing memory usage
 */
export class MemoryMonitor {
  private config: MemoryMonitorConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastMetrics: MemoryMetrics | null = null;
  private cleanupCallbacks: Array<() => void | Promise<void>> = [];
  private warningLogged = false; // Prevent spam logging

  constructor(config: Partial<MemoryMonitorConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      thresholds: {
        ...DEFAULT_CONFIG.thresholds,
        ...config.thresholds,
      },
    };
  }

  /**
   * Get current memory metrics from the main process
   */
  getMemoryMetrics(): MemoryMetrics {
    const memoryUsage = process.memoryUsage();
    
    return {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      rss: memoryUsage.rss,
      timestamp: Date.now(),
    };
  }

  /**
   * Get aggregated memory metrics from all Electron processes
   */
  getAggregatedMetrics(): { total: MemoryMetrics; processes: Array<{ pid: number; type: string; memory: number }> } {
    const appMetrics = app.getAppMetrics();
    
    let totalRss = 0;
    const processes = appMetrics.map((metric) => {
      const memoryKB = metric.memory.workingSetSize;
      totalRss += memoryKB * 1024; // Convert KB to bytes
      return {
        pid: metric.pid,
        type: metric.type,
        memory: memoryKB * 1024, // bytes
      };
    });

    // Get main process memory for heap metrics
    const mainMetrics = this.getMemoryMetrics();

    return {
      total: {
        ...mainMetrics,
        rss: totalRss, // Use aggregated RSS from all processes
      },
      processes,
    };
  }

  /**
   * Check memory thresholds and trigger appropriate actions
   */
  private checkThresholds(metrics: MemoryMetrics): void {
    const rssMB = bytesToMB(metrics.rss);
    const { cleanupThresholdMB, warningThresholdMB } = this.config.thresholds;

    // Check warning threshold (800MB) - Requirement 6.6
    if (rssMB > warningThresholdMB) {
      if (!this.warningLogged) {
        console.warn(
          `[MemoryMonitor] ⚠️ WARNING: Memory usage (${rssMB.toFixed(1)}MB) exceeds ${warningThresholdMB}MB threshold!`
        );
        console.warn('[MemoryMonitor] Performance regression detected - memory > 800MB');
        this.logDetailedMetrics(metrics);
        this.warningLogged = true;
        
        // Call warning callback if provided
        this.config.onWarning?.(metrics);
      }
    } else if (this.warningLogged && rssMB < warningThresholdMB * 0.9) {
      // Reset warning flag when memory drops below 90% of threshold
      this.warningLogged = false;
      console.log(`[MemoryMonitor] Memory usage normalized (${rssMB.toFixed(1)}MB)`);
    }

    // Check cleanup threshold (500MB) - Requirement 4.6
    if (rssMB > cleanupThresholdMB) {
      console.log(
        `[MemoryMonitor] Memory usage (${rssMB.toFixed(1)}MB) exceeds ${cleanupThresholdMB}MB - triggering cleanup`
      );
      this.triggerCleanup();
    }
  }

  /**
   * Log detailed memory metrics
   */
  private logDetailedMetrics(metrics: MemoryMetrics): void {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║              MEMORY USAGE DETAILS                         ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  Heap Used:     ${bytesToMB(metrics.heapUsed).toFixed(1).padStart(8)} MB                        ║`);
    console.log(`║  Heap Total:    ${bytesToMB(metrics.heapTotal).toFixed(1).padStart(8)} MB                        ║`);
    console.log(`║  External:      ${bytesToMB(metrics.external).toFixed(1).padStart(8)} MB                        ║`);
    console.log(`║  RSS (Total):   ${bytesToMB(metrics.rss).toFixed(1).padStart(8)} MB                        ║`);
    console.log('╚══════════════════════════════════════════════════════════╝\n');
  }

  /**
   * Trigger garbage collection and cleanup callbacks
   * Requirement 4.6: Trigger garbage collection and session unloading
   */
  triggerCleanup(): void {
    console.log('[MemoryMonitor] Triggering cleanup...');

    // Attempt to trigger garbage collection if exposed
    // Note: --expose-gc flag must be set for this to work
    if (typeof global.gc === 'function') {
      console.log('[MemoryMonitor] Running garbage collection...');
      global.gc();
    } else {
      console.log('[MemoryMonitor] GC not exposed (run with --expose-gc to enable)');
    }

    // Execute registered cleanup callbacks
    for (const callback of this.cleanupCallbacks) {
      try {
        const result = callback();
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error('[MemoryMonitor] Cleanup callback error:', error);
          });
        }
      } catch (error) {
        console.error('[MemoryMonitor] Cleanup callback error:', error);
      }
    }

    // Call the config cleanup callback if provided
    this.config.onCleanupNeeded?.();

    // Log memory after cleanup attempt
    setTimeout(() => {
      const afterMetrics = this.getMemoryMetrics();
      console.log(
        `[MemoryMonitor] Memory after cleanup: ${bytesToMB(afterMetrics.rss).toFixed(1)}MB`
      );
    }, 1000);
  }

  /**
   * Register a cleanup callback to be called when memory threshold is exceeded
   */
  registerCleanupCallback(callback: () => void | Promise<void>): () => void {
    this.cleanupCallbacks.push(callback);
    
    // Return unregister function
    return () => {
      const index = this.cleanupCallbacks.indexOf(callback);
      if (index > -1) {
        this.cleanupCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Start periodic memory monitoring
   */
  start(): void {
    if (this.isRunning) {
      console.warn('[MemoryMonitor] Already running');
      return;
    }

    console.log(
      `[MemoryMonitor] Starting memory monitoring (interval: ${this.config.intervalMs}ms, ` +
      `cleanup: ${this.config.thresholds.cleanupThresholdMB}MB, warning: ${this.config.thresholds.warningThresholdMB}MB)`
    );

    this.isRunning = true;

    // Initial check
    this.performCheck();

    // Set up periodic monitoring
    this.intervalId = setInterval(() => {
      this.performCheck();
    }, this.config.intervalMs);
  }

  /**
   * Perform a single memory check
   */
  private performCheck(): void {
    const metrics = this.getMemoryMetrics();
    this.lastMetrics = metrics;
    this.checkThresholds(metrics);
  }

  /**
   * Stop memory monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[MemoryMonitor] Stopping memory monitoring');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
  }

  /**
   * Check if monitoring is currently running
   */
  isMonitoring(): boolean {
    return this.isRunning;
  }

  /**
   * Get the last collected metrics
   */
  getLastMetrics(): MemoryMetrics | null {
    return this.lastMetrics;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MemoryMonitorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      thresholds: {
        ...this.config.thresholds,
        ...config.thresholds,
      },
    };

    // Restart monitoring if running to apply new interval
    if (this.isRunning && config.intervalMs !== undefined) {
      this.stop();
      this.start();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): MemoryMonitorConfig {
    return { ...this.config };
  }

  /**
   * Force an immediate memory check (useful for debugging)
   */
  forceCheck(): MemoryMetrics {
    this.performCheck();
    return this.lastMetrics!;
  }
}

// Singleton instance for the application
export const memoryMonitor = new MemoryMonitor();

/**
 * Initialize memory monitoring with default settings
 * Call this after the main window is visible
 */
export function initializeMemoryMonitoring(
  onCleanupNeeded?: () => void,
  onWarning?: (metrics: MemoryMetrics) => void
): void {
  if (onCleanupNeeded) {
    memoryMonitor.registerCleanupCallback(onCleanupNeeded);
  }
  
  if (onWarning) {
    memoryMonitor.updateConfig({ onWarning });
  }
  
  memoryMonitor.start();
}

/**
 * Cleanup memory monitoring (call on app quit)
 */
export function cleanupMemoryMonitoring(): void {
  memoryMonitor.stop();
}

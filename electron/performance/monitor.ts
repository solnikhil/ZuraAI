/**
 * Performance Monitor Module for Electron Main Process
 * 
 * This module provides a unified performance monitoring interface that combines
 * startup timing, memory usage tracking, and IPC metrics collection.
 * 
 * **Validates: Requirements 6.1, 6.2**
 * - Requirement 6.1: THE Main_Process SHALL expose a performance metrics API via IPC that reports startup timing, memory usage, and IPC latency
 * - Requirement 6.2: WHEN the application starts, THE Main_Process SHALL log startup phase timings (window creation, IPC registration, first paint)
 */

import { memoryMonitor, type MemoryMetrics } from './memoryMonitor';
import { deferredInitializer, type StartupMetrics } from '../startup/deferredInit';

/**
 * Startup timing metrics
 */
export interface StartupTimingMetrics {
  windowCreated: number;   // Time from process start to window created (ms)
  windowVisible: number;   // Time from process start to window visible (ms)
  ipcReady: number;        // Time from process start to IPC ready (ms)
  fullyLoaded: number;     // Time from process start to fully loaded (ms)
}

/**
 * IPC performance metrics
 */
export interface IPCMetrics {
  callCount: number;       // Total IPC calls since startup
  averageLatency: number;  // Average IPC round-trip time (ms)
  batchedCalls: number;    // Number of batched IPC calls
}

/**
 * Renderer performance metrics (from renderer process)
 * **Validates: Requirement 6.3**
 */
export interface RendererMetrics {
  /** First Contentful Paint - time until first content is painted (ms) */
  fcp: number | null;
  /** Time To Interactive - time until the page is fully interactive (ms) */
  tti: number | null;
  /** Largest Contentful Paint - time until largest content element is painted (ms) */
  lcp: number | null;
  /** First Input Delay - time from first user interaction to browser response (ms) */
  fid: number | null;
  /** Cumulative Layout Shift - measure of visual stability */
  cls: number | null;
  /** Navigation start timestamp */
  navigationStart: number;
  /** DOM Content Loaded timestamp */
  domContentLoaded: number | null;
  /** Load event timestamp */
  loadComplete: number | null;
  /** When metrics were collected */
  timestamp: number;
}

/**
 * Complete performance metrics interface matching the design document
 */
export interface PerformanceMetrics {
  startup: StartupTimingMetrics;
  memory: MemoryMetrics;
  ipc: IPCMetrics;
  renderer: RendererMetrics | null;  // Renderer metrics (may be null if not yet reported)
  timestamp: number;       // When metrics were collected
}

/**
 * Performance thresholds for regression detection
 */
export interface PerformanceThresholds {
  startupWarningMs: number;    // Warn if startup exceeds this (default: 2000ms)
  memoryWarningMB: number;     // Warn if memory exceeds this (default: 800MB)
}

/**
 * Default performance thresholds
 */
const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  startupWarningMs: 2000,      // 2 seconds
  memoryWarningMB: 800,        // 800MB
};

/**
 * Convert bytes to megabytes
 */
function bytesToMB(bytes: number): number {
  return bytes / (1024 * 1024);
}

/**
 * PerformanceMonitor class for unified performance tracking
 * 
 * This class integrates with:
 * - DeferredInitializer for startup timing metrics
 * - MemoryMonitor for memory usage metrics
 * - IPC tracking for communication metrics
 * - Renderer metrics for web vitals (FCP, TTI, LCP, etc.)
 */
export class PerformanceMonitor {
  private thresholds: PerformanceThresholds;
  private ipcMetrics: IPCMetrics;
  private rendererMetrics: RendererMetrics | null = null;
  private startupPhases: Map<string, { startedAt: number; completedAt?: number }>;
  private startupWarningLogged = false;
  private memoryWarningLogged = false;
  private fcpWarningLogged = false;

  constructor(thresholds: Partial<PerformanceThresholds> = {}) {
    this.thresholds = {
      ...DEFAULT_THRESHOLDS,
      ...thresholds,
    };
    
    this.ipcMetrics = {
      callCount: 0,
      averageLatency: 0,
      batchedCalls: 0,
    };
    
    this.startupPhases = new Map();
  }

  /**
   * Record a startup phase timing
   * This method delegates to the DeferredInitializer for consistent tracking
   * 
   * @param phase - Name of the startup phase (e.g., 'window-creation', 'ipc-registration')
   */
  recordStartupPhase(phase: string): void {
    const now = Date.now();
    const existingPhase = this.startupPhases.get(phase);
    
    if (!existingPhase) {
      // Start of phase
      this.startupPhases.set(phase, { startedAt: now });
      deferredInitializer.recordPhase(phase, 'start');
      console.log(`[PerformanceMonitor] Phase started: ${phase}`);
    } else if (!existingPhase.completedAt) {
      // End of phase
      existingPhase.completedAt = now;
      deferredInitializer.recordPhase(phase, 'end');
      const duration = now - existingPhase.startedAt;
      console.log(`[PerformanceMonitor] Phase completed: ${phase} (${duration}ms)`);
    }
  }

  /**
   * Record an IPC call for metrics tracking
   * 
   * @param latencyMs - The round-trip latency of the IPC call in milliseconds
   * @param wasBatched - Whether this call was part of a batch
   */
  recordIPCCall(latencyMs: number, wasBatched = false): void {
    const prevTotal = this.ipcMetrics.averageLatency * this.ipcMetrics.callCount;
    this.ipcMetrics.callCount++;
    this.ipcMetrics.averageLatency = (prevTotal + latencyMs) / this.ipcMetrics.callCount;
    
    if (wasBatched) {
      this.ipcMetrics.batchedCalls++;
    }
  }

  /**
   * Get current performance metrics
   * Combines startup timing, memory usage, IPC metrics, and renderer metrics
   */
  getMetrics(): PerformanceMetrics {
    const startupMetrics = deferredInitializer.getMetrics();
    const memoryMetrics = memoryMonitor.getMemoryMetrics();
    
    return {
      startup: this.convertStartupMetrics(startupMetrics),
      memory: memoryMetrics,
      ipc: { ...this.ipcMetrics },
      renderer: this.rendererMetrics ? { ...this.rendererMetrics } : null,
      timestamp: Date.now(),
    };
  }

  /**
   * Update renderer metrics from the renderer process
   * Called via IPC when renderer reports its performance metrics
   * 
   * **Validates: Requirement 6.3**
   * THE Renderer_Process SHALL track and report Time To Interactive (TTI) and 
   * First Contentful Paint (FCP) metrics
   * 
   * @param metrics - Renderer performance metrics
   */
  updateRendererMetrics(metrics: RendererMetrics): void {
    this.rendererMetrics = { ...metrics };
    
    // Log renderer metrics
    console.log('[PerformanceMonitor] Renderer metrics updated:');
    if (metrics.fcp !== null) {
      console.log(`  FCP: ${metrics.fcp.toFixed(2)}ms`);
    }
    if (metrics.tti !== null) {
      console.log(`  TTI: ${metrics.tti.toFixed(2)}ms`);
    }
    if (metrics.lcp !== null) {
      console.log(`  LCP: ${metrics.lcp.toFixed(2)}ms`);
    }
    
    // Check FCP threshold (500ms from Requirement 7.6)
    if (metrics.fcp !== null && metrics.fcp > 500 && !this.fcpWarningLogged) {
      console.warn(`[PerformanceMonitor] WARNING: FCP (${metrics.fcp.toFixed(0)}ms) exceeds 500ms threshold`);
      this.fcpWarningLogged = true;
    }
  }

  /**
   * Get renderer metrics only
   */
  getRendererMetrics(): RendererMetrics | null {
    return this.rendererMetrics ? { ...this.rendererMetrics } : null;
  }

  /**
   * Convert DeferredInitializer metrics to StartupTimingMetrics format
   */
  private convertStartupMetrics(metrics: StartupMetrics): StartupTimingMetrics {
    const processStart = metrics.processStartAt;
    
    return {
      windowCreated: metrics.windowCreatedAt > 0 
        ? metrics.windowCreatedAt - processStart 
        : 0,
      windowVisible: metrics.windowVisibleAt > 0 
        ? metrics.windowVisibleAt - processStart 
        : 0,
      ipcReady: metrics.ipcReadyAt > 0 
        ? metrics.ipcReadyAt - processStart 
        : 0,
      fullyLoaded: metrics.fullyLoadedAt > 0 
        ? metrics.fullyLoadedAt - processStart 
        : 0,
    };
  }

  /**
   * Log current performance metrics to console
   * Provides a formatted summary of all performance data
   */
  logMetrics(): void {
    const metrics = this.getMetrics();
    const memMB = bytesToMB(metrics.memory.rss);
    
    console.log('\n[PerformanceMonitor] PERFORMANCE MONITOR METRICS');
    console.log('[PerformanceMonitor] ------------------------------------------------------------');
    console.log('[PerformanceMonitor] STARTUP TIMING');
    console.log(`[PerformanceMonitor]   Window Created: ${String(metrics.startup.windowCreated).padStart(6)}ms`);
    console.log(`[PerformanceMonitor]   Window Visible: ${String(metrics.startup.windowVisible).padStart(6)}ms`);
    console.log(`[PerformanceMonitor]   IPC Ready:      ${String(metrics.startup.ipcReady).padStart(6)}ms`);
    console.log(`[PerformanceMonitor]   Fully Loaded:   ${String(metrics.startup.fullyLoaded).padStart(6)}ms`);
    console.log('[PerformanceMonitor] ------------------------------------------------------------');
    console.log('[PerformanceMonitor] MEMORY USAGE');
    console.log(`[PerformanceMonitor]   Heap Used:  ${bytesToMB(metrics.memory.heapUsed).toFixed(1).padStart(6)} MB`);
    console.log(`[PerformanceMonitor]   Heap Total: ${bytesToMB(metrics.memory.heapTotal).toFixed(1).padStart(6)} MB`);
    console.log(`[PerformanceMonitor]   External:   ${bytesToMB(metrics.memory.external).toFixed(1).padStart(6)} MB`);
    console.log(`[PerformanceMonitor]   RSS (Total):${memMB.toFixed(1).padStart(6)} MB`);
    console.log('[PerformanceMonitor] ------------------------------------------------------------');
    console.log('[PerformanceMonitor] IPC METRICS');
    console.log(`[PerformanceMonitor]   Total Calls:     ${String(metrics.ipc.callCount).padStart(6)}`);
    console.log(`[PerformanceMonitor]   Average Latency: ${metrics.ipc.averageLatency.toFixed(1).padStart(6)}ms`);
    console.log(`[PerformanceMonitor]   Batched Calls:   ${String(metrics.ipc.batchedCalls).padStart(6)}`);
    
    // Log renderer metrics if available
    if (metrics.renderer) {
      console.log('[PerformanceMonitor] ------------------------------------------------------------');
      console.log('[PerformanceMonitor] RENDERER METRICS (Web Vitals)');
      const formatMetric = (value: number | null, suffix = 'ms'): string => {
        if (value === null) return '   N/A';
        return suffix === 'ms' ? `${value.toFixed(0).padStart(6)}${suffix}` : value.toFixed(3).padStart(6);
      };
      console.log(`[PerformanceMonitor]   FCP (First Contentful Paint): ${formatMetric(metrics.renderer.fcp)}`);
      console.log(`[PerformanceMonitor]   TTI (Time To Interactive):    ${formatMetric(metrics.renderer.tti)}`);
      console.log(`[PerformanceMonitor]   LCP (Largest Contentful):     ${formatMetric(metrics.renderer.lcp)}`);
      console.log(`[PerformanceMonitor]   FID (First Input Delay):      ${formatMetric(metrics.renderer.fid)}`);
      console.log(`[PerformanceMonitor]   CLS (Cumulative Layout Shift):${formatMetric(metrics.renderer.cls, '')}`);
    } else {
      console.log('[PerformanceMonitor] ------------------------------------------------------------');
      console.log('[PerformanceMonitor] RENDERER METRICS: Not yet reported');
    }
    
    console.log('[PerformanceMonitor] ------------------------------------------------------------\n');
  }

  /**
   * Check performance thresholds and return any warnings
   * 
   * **Validates: Requirement 6.6**
   * WHEN a performance regression is detected (startup > 2s or memory > 800MB), 
   * THE Main_Process SHALL log a warning
   * 
   * **Property 26: Performance Regression Warning**
   * For any startup exceeding 2 seconds or memory usage exceeding 800MB, 
   * a warning SHALL be logged.
   */
  checkThresholds(): { warnings: string[] } {
    const warnings: string[] = [];
    const metrics = this.getMetrics();
    
    // Check startup time threshold (2 seconds)
    const startupTime = metrics.startup.windowVisible;
    if (startupTime > 0 && startupTime > this.thresholds.startupWarningMs) {
      const warning = `Startup time (${startupTime}ms) exceeds threshold (${this.thresholds.startupWarningMs}ms)`;
      warnings.push(warning);
      
      if (!this.startupWarningLogged) {
        console.warn(`[PerformanceMonitor] WARNING: ${warning}`);
        console.warn('[PerformanceMonitor] Performance regression detected - startup > 2s');
        this.startupWarningLogged = true;
      }
    }
    
    // Check memory threshold (800MB)
    // Requirement 6.6: memory > 800MB triggers warning
    // Property 26: Performance Regression Warning
    const memoryMB = bytesToMB(metrics.memory.rss);
    if (memoryMB > this.thresholds.memoryWarningMB) {
      const warning = `Memory usage (${memoryMB.toFixed(1)}MB) exceeds threshold (${this.thresholds.memoryWarningMB}MB)`;
      warnings.push(warning);
      
      if (!this.memoryWarningLogged) {
        console.warn(`[PerformanceMonitor] WARNING: ${warning}`);
        console.warn('[PerformanceMonitor] Performance regression detected - memory > 800MB');
        this.memoryWarningLogged = true;
      }
    } else if (this.memoryWarningLogged && memoryMB < this.thresholds.memoryWarningMB * 0.9) {
      // Reset memory warning flag when memory drops below 90% of threshold
      this.memoryWarningLogged = false;
      console.log(`[PerformanceMonitor] Memory usage normalized (${memoryMB.toFixed(1)}MB)`);
    }
    
    // Check renderer metrics thresholds (Requirement 6.3, 7.6)
    if (metrics.renderer) {
      // FCP threshold: 500ms (from Requirement 7.6)
      if (metrics.renderer.fcp !== null && metrics.renderer.fcp > 500) {
        warnings.push(`FCP (${metrics.renderer.fcp.toFixed(0)}ms) exceeds 500ms threshold`);
      }
      
      // LCP threshold: 2500ms (good), 4000ms (needs improvement)
      if (metrics.renderer.lcp !== null && metrics.renderer.lcp > 2500) {
        warnings.push(`LCP (${metrics.renderer.lcp.toFixed(0)}ms) exceeds 2500ms threshold`);
      }
      
      // FID threshold: 100ms (good)
      if (metrics.renderer.fid !== null && metrics.renderer.fid > 100) {
        warnings.push(`FID (${metrics.renderer.fid.toFixed(0)}ms) exceeds 100ms threshold`);
      }
      
      // CLS threshold: 0.1 (good)
      if (metrics.renderer.cls !== null && metrics.renderer.cls > 0.1) {
        warnings.push(`CLS (${metrics.renderer.cls.toFixed(3)}) exceeds 0.1 threshold`);
      }
    }
    
    return { warnings };
  }

  /**
   * Get current thresholds configuration
   */
  getThresholds(): PerformanceThresholds {
    return { ...this.thresholds };
  }

  /**
   * Update thresholds configuration
   */
  updateThresholds(thresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = {
      ...this.thresholds,
      ...thresholds,
    };
  }

  /**
   * Reset IPC metrics (useful for testing or periodic resets)
   */
  resetIPCMetrics(): void {
    this.ipcMetrics = {
      callCount: 0,
      averageLatency: 0,
      batchedCalls: 0,
    };
  }

  /**
   * Reset startup phases (useful for testing)
   */
  resetStartupPhases(): void {
    this.startupPhases.clear();
    this.startupWarningLogged = false;
    this.memoryWarningLogged = false;
  }

  /**
   * Get startup phases for debugging
   */
  getStartupPhases(): Map<string, { startedAt: number; completedAt?: number }> {
    return new Map(this.startupPhases);
  }

  /**
   * Check startup time regression and log warning if exceeded
   * This should be called after the window becomes visible.
   * 
   * **Validates: Requirement 6.6**
   * WHEN a performance regression is detected (startup > 2s), 
   * THE Main_Process SHALL log a warning
   * 
   * **Property 26: Performance Regression Warning**
   * For any startup exceeding 2 seconds, a warning SHALL be logged.
   * 
   * @returns Object containing whether a regression was detected and the startup time
   */
  checkStartupRegression(): { isRegression: boolean; startupTimeMs: number; warning: string | null } {
    const metrics = this.getMetrics();
    const startupTime = metrics.startup.windowVisible;
    
    if (startupTime > 0 && startupTime > this.thresholds.startupWarningMs) {
      const warning = `Startup time (${startupTime}ms) exceeds threshold (${this.thresholds.startupWarningMs}ms)`;
      
      if (!this.startupWarningLogged) {
        console.warn(`[PerformanceMonitor] WARNING: ${warning}`);
        console.warn('[PerformanceMonitor] Performance regression detected - startup > 2s');
        this.startupWarningLogged = true;
      }
      
      return {
        isRegression: true,
        startupTimeMs: startupTime,
        warning,
      };
    }
    
    return {
      isRegression: false,
      startupTimeMs: startupTime,
      warning: null,
    };
  }

  /**
   * Check memory regression and log warning if exceeded
   * 
   * **Validates: Requirement 6.6**
   * WHEN a performance regression is detected (memory > 800MB), 
   * THE Main_Process SHALL log a warning
   * 
   * **Property 26: Performance Regression Warning**
   * For any memory usage exceeding 800MB, a warning SHALL be logged.
   * 
   * @returns Object containing whether a regression was detected and the memory usage
   */
  checkMemoryRegression(): { isRegression: boolean; memoryMB: number; warning: string | null } {
    const metrics = this.getMetrics();
    const memoryMB = bytesToMB(metrics.memory.rss);
    
    if (memoryMB > this.thresholds.memoryWarningMB) {
      const warning = `Memory usage (${memoryMB.toFixed(1)}MB) exceeds threshold (${this.thresholds.memoryWarningMB}MB)`;
      
      if (!this.memoryWarningLogged) {
        console.warn(`[PerformanceMonitor] WARNING: ${warning}`);
        console.warn('[PerformanceMonitor] Performance regression detected - memory > 800MB');
        this.memoryWarningLogged = true;
      }
      
      return {
        isRegression: true,
        memoryMB,
        warning,
      };
    }
    
    // Reset flag if memory is back to normal
    if (this.memoryWarningLogged && memoryMB < this.thresholds.memoryWarningMB * 0.9) {
      this.memoryWarningLogged = false;
      console.log(`[PerformanceMonitor] Memory usage normalized (${memoryMB.toFixed(1)}MB)`);
    }
    
    return {
      isRegression: false,
      memoryMB,
      warning: null,
    };
  }

  /**
   * Reset all warning flags (useful for testing)
   */
  resetWarningFlags(): void {
    this.startupWarningLogged = false;
    this.memoryWarningLogged = false;
    this.fcpWarningLogged = false;
  }
}

// Singleton instance for the application
export const performanceMonitor = new PerformanceMonitor();

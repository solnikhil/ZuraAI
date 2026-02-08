/**
 * Renderer Performance Tracking Module
 * 
 * This module tracks Time To Interactive (TTI) and First Contentful Paint (FCP) metrics
 * in the renderer process and exposes them via IPC to the main process.
 * 
 * **Validates: Requirement 6.3**
 * THE Renderer_Process SHALL track and report Time To Interactive (TTI) and 
 * First Contentful Paint (FCP) metrics
 */

/**
 * Renderer performance metrics interface
 */
export interface RendererPerformanceMetrics {
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
 * Performance observer callback type
 */
type PerformanceCallback = (metrics: Partial<RendererPerformanceMetrics>) => void;

/**
 * RendererPerformanceTracker class for tracking web vitals and performance metrics
 * 
 * This class uses the Performance API and PerformanceObserver to track:
 * - First Contentful Paint (FCP)
 * - Time To Interactive (TTI) - approximated using Long Task API
 * - Largest Contentful Paint (LCP)
 * - First Input Delay (FID)
 * - Cumulative Layout Shift (CLS)
 */
class RendererPerformanceTracker {
  private metrics: RendererPerformanceMetrics;
  private observers: PerformanceObserver[] = [];
  private callbacks: PerformanceCallback[] = [];
  private initialized = false;
  private clsValue = 0;
  private clsEntries: PerformanceEntry[] = [];
  private lastLongTaskEnd = 0;
  private ttiResolved = false;
  private ttiTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.metrics = {
      fcp: null,
      tti: null,
      lcp: null,
      fid: null,
      cls: null,
      navigationStart: 0,
      domContentLoaded: null,
      loadComplete: null,
      timestamp: Date.now(),
    };
  }

  /**
   * Initialize performance tracking
   * Should be called early in the application lifecycle
   */
  initialize(): void {
    if (this.initialized) {
      console.log('[RendererPerformance] Already initialized');
      return;
    }

    if (typeof window === 'undefined' || typeof performance === 'undefined') {
      console.warn('[RendererPerformance] Performance API not available');
      return;
    }

    this.initialized = true;
    console.log('[RendererPerformance] Initializing performance tracking');

    // Get navigation timing
    this.collectNavigationTiming();

    // Set up performance observers
    this.observeFCP();
    this.observeLCP();
    this.observeFID();
    this.observeCLS();
    this.observeLongTasks();

    // Listen for DOM events
    this.listenForDOMEvents();
  }

  /**
   * Collect navigation timing metrics
   */
  private collectNavigationTiming(): void {
    try {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (navEntries.length > 0) {
        const navTiming = navEntries[0];
        this.metrics.navigationStart = navTiming.startTime;
        
        if (navTiming.domContentLoadedEventEnd > 0) {
          this.metrics.domContentLoaded = navTiming.domContentLoadedEventEnd;
        }
        
        if (navTiming.loadEventEnd > 0) {
          this.metrics.loadComplete = navTiming.loadEventEnd;
        }
      }
    } catch (error) {
      console.warn('[RendererPerformance] Failed to collect navigation timing:', error);
    }
  }

  /**
   * Observe First Contentful Paint (FCP)
   */
  private observeFCP(): void {
    try {
      // Check for existing FCP entries first
      const existingEntries = performance.getEntriesByName('first-contentful-paint', 'paint');
      if (existingEntries.length > 0) {
        this.metrics.fcp = existingEntries[0].startTime;
        console.log(`[RendererPerformance] FCP (existing): ${this.metrics.fcp.toFixed(2)}ms`);
        this.notifyCallbacks({ fcp: this.metrics.fcp });
        return;
      }

      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.name === 'first-contentful-paint') {
            this.metrics.fcp = entry.startTime;
            console.log(`[RendererPerformance] FCP: ${this.metrics.fcp.toFixed(2)}ms`);
            this.notifyCallbacks({ fcp: this.metrics.fcp });
            observer.disconnect();
            break;
          }
        }
      });

      observer.observe({ type: 'paint', buffered: true });
      this.observers.push(observer);
    } catch (error) {
      console.warn('[RendererPerformance] FCP observation not supported:', error);
    }
  }

  /**
   * Observe Largest Contentful Paint (LCP)
   */
  private observeLCP(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        // LCP can fire multiple times, we want the last one
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          this.metrics.lcp = lastEntry.startTime;
          console.log(`[RendererPerformance] LCP: ${this.metrics.lcp.toFixed(2)}ms`);
          this.notifyCallbacks({ lcp: this.metrics.lcp });
        }
      });

      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      this.observers.push(observer);
    } catch (error) {
      console.warn('[RendererPerformance] LCP observation not supported:', error);
    }
  }

  /**
   * Observe First Input Delay (FID)
   */
  private observeFID(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries() as PerformanceEventTiming[];
        for (const entry of entries) {
          // FID is the processing start time minus the event timestamp
          if (entry.processingStart && entry.startTime) {
            this.metrics.fid = entry.processingStart - entry.startTime;
            console.log(`[RendererPerformance] FID: ${this.metrics.fid.toFixed(2)}ms`);
            this.notifyCallbacks({ fid: this.metrics.fid });
            observer.disconnect();
            break;
          }
        }
      });

      observer.observe({ type: 'first-input', buffered: true });
      this.observers.push(observer);
    } catch (error) {
      console.warn('[RendererPerformance] FID observation not supported:', error);
    }
  }

  /**
   * Observe Cumulative Layout Shift (CLS)
   */
  private observeCLS(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries() as (PerformanceEntry & { hadRecentInput?: boolean; value?: number })[];
        for (const entry of entries) {
          // Only count layout shifts without recent user input
          if (!entry.hadRecentInput && entry.value !== undefined) {
            this.clsValue += entry.value;
            this.clsEntries.push(entry);
          }
        }
        this.metrics.cls = this.clsValue;
        this.notifyCallbacks({ cls: this.metrics.cls });
      });

      observer.observe({ type: 'layout-shift', buffered: true });
      this.observers.push(observer);
    } catch (error) {
      console.warn('[RendererPerformance] CLS observation not supported:', error);
    }
  }

  /**
   * Observe Long Tasks for TTI approximation
   * TTI is approximated as the time after FCP when there are no long tasks for 5 seconds
   */
  private observeLongTasks(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          const taskEnd = entry.startTime + entry.duration;
          if (taskEnd > this.lastLongTaskEnd) {
            this.lastLongTaskEnd = taskEnd;
          }
        }
        // Reset TTI calculation when new long tasks occur
        this.scheduleTTICheck();
      });

      observer.observe({ type: 'longtask', buffered: true });
      this.observers.push(observer);

      // Start initial TTI check
      this.scheduleTTICheck();
    } catch (error) {
      console.warn('[RendererPerformance] Long task observation not supported:', error);
      // Fallback: use load event as TTI approximation
      this.useFallbackTTI();
    }
  }

  /**
   * Schedule TTI check after quiet period
   * TTI is considered reached when there are no long tasks for 5 seconds after FCP
   */
  private scheduleTTICheck(): void {
    if (this.ttiResolved) return;

    if (this.ttiTimeout) {
      clearTimeout(this.ttiTimeout);
    }

    // Wait for 5 seconds of quiet time (no long tasks)
    this.ttiTimeout = setTimeout(() => {
      if (!this.ttiResolved && this.metrics.fcp !== null) {
        // TTI is the later of FCP or the end of the last long task
        this.metrics.tti = Math.max(this.metrics.fcp, this.lastLongTaskEnd);
        this.ttiResolved = true;
        console.log(`[RendererPerformance] TTI: ${this.metrics.tti.toFixed(2)}ms`);
        this.notifyCallbacks({ tti: this.metrics.tti });
      }
    }, 5000);
  }

  /**
   * Fallback TTI calculation using load event
   */
  private useFallbackTTI(): void {
    if (document.readyState === 'complete') {
      this.setFallbackTTI();
    } else {
      window.addEventListener('load', () => this.setFallbackTTI());
    }
  }

  /**
   * Set TTI using load event timing as fallback
   */
  private setFallbackTTI(): void {
    if (this.ttiResolved) return;

    const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (navEntries.length > 0 && navEntries[0].loadEventEnd > 0) {
      this.metrics.tti = navEntries[0].loadEventEnd;
      this.ttiResolved = true;
      console.log(`[RendererPerformance] TTI (fallback): ${this.metrics.tti.toFixed(2)}ms`);
      this.notifyCallbacks({ tti: this.metrics.tti });
    }
  }

  /**
   * Listen for DOM events to update timing metrics
   */
  private listenForDOMEvents(): void {
    // Update DOM content loaded timing
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.collectNavigationTiming();
      });
    }

    // Update load complete timing
    if (document.readyState !== 'complete') {
      window.addEventListener('load', () => {
        this.collectNavigationTiming();
      });
    }
  }

  /**
   * Register a callback to be notified when metrics are updated
   */
  onMetricsUpdate(callback: PerformanceCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Notify all registered callbacks of metric updates
   */
  private notifyCallbacks(updates: Partial<RendererPerformanceMetrics>): void {
    for (const callback of this.callbacks) {
      try {
        callback(updates);
      } catch (error) {
        console.error('[RendererPerformance] Callback error:', error);
      }
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): RendererPerformanceMetrics {
    return {
      ...this.metrics,
      timestamp: Date.now(),
    };
  }

  /**
   * Get a summary of key metrics for display
   */
  getSummary(): {
    fcp: string;
    tti: string;
    lcp: string;
    fid: string;
    cls: string;
  } {
    const formatMs = (value: number | null): string => {
      if (value === null) return 'N/A';
      return `${value.toFixed(0)}ms`;
    };

    const formatCLS = (value: number | null): string => {
      if (value === null) return 'N/A';
      return value.toFixed(3);
    };

    return {
      fcp: formatMs(this.metrics.fcp),
      tti: formatMs(this.metrics.tti),
      lcp: formatMs(this.metrics.lcp),
      fid: formatMs(this.metrics.fid),
      cls: formatCLS(this.metrics.cls),
    };
  }

  /**
   * Check if metrics meet performance thresholds
   */
  checkThresholds(): { warnings: string[] } {
    const warnings: string[] = [];

    // FCP threshold: 500ms (from Requirement 7.6)
    if (this.metrics.fcp !== null && this.metrics.fcp > 500) {
      warnings.push(`FCP (${this.metrics.fcp.toFixed(0)}ms) exceeds 500ms threshold`);
    }

    // LCP threshold: 2500ms (good), 4000ms (needs improvement)
    if (this.metrics.lcp !== null && this.metrics.lcp > 2500) {
      warnings.push(`LCP (${this.metrics.lcp.toFixed(0)}ms) exceeds 2500ms threshold`);
    }

    // FID threshold: 100ms (good), 300ms (needs improvement)
    if (this.metrics.fid !== null && this.metrics.fid > 100) {
      warnings.push(`FID (${this.metrics.fid.toFixed(0)}ms) exceeds 100ms threshold`);
    }

    // CLS threshold: 0.1 (good), 0.25 (needs improvement)
    if (this.metrics.cls !== null && this.metrics.cls > 0.1) {
      warnings.push(`CLS (${this.metrics.cls.toFixed(3)}) exceeds 0.1 threshold`);
    }

    return { warnings };
  }

  /**
   * Clean up observers and resources
   */
  cleanup(): void {
    for (const observer of this.observers) {
      try {
        observer.disconnect();
      } catch (error) {
        // Ignore disconnect errors
      }
    }
    this.observers = [];
    this.callbacks = [];
    
    if (this.ttiTimeout) {
      clearTimeout(this.ttiTimeout);
      this.ttiTimeout = null;
    }
    
    this.initialized = false;
    console.log('[RendererPerformance] Cleaned up');
  }
}

// Singleton instance
export const rendererPerformanceTracker = new RendererPerformanceTracker();

/**
 * Initialize renderer performance tracking
 * Call this early in the application lifecycle (e.g., in main.tsx)
 */
export function initializeRendererPerformance(): void {
  rendererPerformanceTracker.initialize();
}

/**
 * Get current renderer performance metrics
 */
export function getRendererPerformanceMetrics(): RendererPerformanceMetrics {
  return rendererPerformanceTracker.getMetrics();
}

/**
 * Send renderer metrics to main process via IPC
 * This function should be called periodically or on demand
 */
export async function reportRendererMetricsToMain(): Promise<void> {
  if (typeof window === 'undefined' || !window.ipcRenderer) {
    console.warn('[RendererPerformance] IPC not available');
    return;
  }

  try {
    const metrics = rendererPerformanceTracker.getMetrics();
    await window.ipcRenderer.invoke('performance:report-renderer-metrics', metrics);
    console.log('[RendererPerformance] Metrics reported to main process');
  } catch (error) {
    console.error('[RendererPerformance] Failed to report metrics:', error);
  }
}

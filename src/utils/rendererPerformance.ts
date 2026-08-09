/**
 * Tracks renderer-side performance metrics used for diagnostics and lazy loading.
 */

/**
 * Renderer performance metrics interface
 */
export interface RendererPerformanceMetrics {
  /** First Contentful Paint - time until first content is painted (ms) */
  fcp: number | null
  /** Time To Interactive - time until the page is fully interactive (ms) */
  tti: number | null
  /** Largest Contentful Paint - time until largest content element is painted (ms) */
  lcp: number | null
  /** First Input Delay - time from first user interaction to browser response (ms) */
  fid: number | null
  /** Cumulative Layout Shift - measure of visual stability */
  cls: number | null
  /** Navigation start timestamp */
  navigationStart: number
  /** DOM Content Loaded timestamp */
  domContentLoaded: number | null
  /** Load event timestamp */
  loadComplete: number | null
  /** When metrics were collected */
  timestamp: number
}

/**
 * Performance observer callback type
 */
type PerformanceCallback = (metrics: Partial<RendererPerformanceMetrics>) => void

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
/**
 * Maximum span of a single CLS session window (web-vitals algorithm).
 */
const CLS_SESSION_MAX_DURATION_MS = 5000

/**
 * Maximum gap between shifts before a new CLS session window starts.
 */
const CLS_SESSION_MAX_GAP_MS = 1000

class RendererPerformanceTracker {
  private metrics: RendererPerformanceMetrics
  private observers: PerformanceObserver[] = []
  private callbacks: PerformanceCallback[] = []
  private initialized = false
  /** Highest scoring CLS session window seen so far. */
  private clsValue = 0
  /**
   * Windowed CLS accumulator. Only scalars are retained - layout-shift entries
   * hold references to their source nodes, so keeping them would pin detached
   * DOM subtrees for the entire life of this long-lived renderer.
   */
  private clsSessionValue = 0
  private clsSessionFirstShiftTime = 0
  private clsSessionLastShiftTime = 0
  private longTaskObserver: PerformanceObserver | null = null
  private lastLongTaskEnd = 0
  private ttiResolved = false
  private ttiTimeout: ReturnType<typeof setTimeout> | null = null
  /** Aborted by cleanup() so every DOM listener this tracker adds is removed. */
  private listenerAbort: AbortController | null = null

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
    }
  }

  /**
   * Initialize performance tracking
   * Should be called early in the application lifecycle
   */
  initialize(): void {
    if (this.initialized) {
      return
    }

    if (typeof window === 'undefined' || typeof performance === 'undefined') {
      console.warn('[RendererPerformance] Performance API not available')
      return
    }

    this.initialized = true
    this.listenerAbort = new AbortController()

    this.collectNavigationTiming()

    this.observeFCP()
    this.observeLCP()
    this.observeFID()
    this.observeCLS()
    this.observeLongTasks()

    // Listen for DOM events
    this.listenForDOMEvents()

    // Release observers and listeners when the renderer document goes away so a
    // reloaded or navigated renderer never leaves the previous generation
    // observing.
    this.listenForLifecycleDisposal()
  }

  /**
   * Signal returned to every listener this tracker registers, so `cleanup()`
   * removes them all in one shot.
   */
  private get listenerSignal(): AbortSignal | undefined {
    return this.listenerAbort?.signal
  }

  /**
   * Track an observer so cleanup can disconnect it.
   */
  private trackObserver(observer: PerformanceObserver): void {
    this.observers.push(observer)
  }

  /**
   * Disconnect an observer that has produced its final value and drop the
   * reference so it is not retained until cleanup.
   */
  private releaseObserver(observer: PerformanceObserver): void {
    observer.disconnect()
    const index = this.observers.indexOf(observer)
    if (index > -1) {
      this.observers.splice(index, 1)
    }
  }

  /**
   * Disconnect everything when the document is discarded.
   */
  private listenForLifecycleDisposal(): void {
    const signal = this.listenerSignal
    // `pagehide` covers reload, navigation and Electron window teardown, and
    // unlike `beforeunload` it does not block the back/forward cache.
    window.addEventListener('pagehide', () => this.cleanup(), { signal })
  }

  /**
   * Collect navigation timing metrics
   */
  private collectNavigationTiming(): void {
    try {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
      if (navEntries.length > 0) {
        const navTiming = navEntries[0]
        this.metrics.navigationStart = navTiming.startTime

        if (navTiming.domContentLoadedEventEnd > 0) {
          this.metrics.domContentLoaded = navTiming.domContentLoadedEventEnd
        }

        if (navTiming.loadEventEnd > 0) {
          this.metrics.loadComplete = navTiming.loadEventEnd
        }
      }
    } catch (error) {
      console.warn('[RendererPerformance] Failed to collect navigation timing:', error)
    }
  }

  /**
   * Observe First Contentful Paint (FCP)
   */
  private observeFCP(): void {
    try {
      const existingEntries = performance.getEntriesByName('first-contentful-paint', 'paint')
      if (existingEntries.length > 0) {
        this.metrics.fcp = existingEntries[0].startTime
        this.notifyCallbacks({ fcp: this.metrics.fcp })
        return
      }

      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        for (const entry of entries) {
          if (entry.name === 'first-contentful-paint') {
            this.metrics.fcp = entry.startTime
            this.notifyCallbacks({ fcp: this.metrics.fcp })
            // FCP is single-valued - stop observing paints entirely.
            this.releaseObserver(observer)
            break
          }
        }
      })

      observer.observe({ type: 'paint', buffered: true })
      this.trackObserver(observer)
    } catch (error) {
      console.warn('[RendererPerformance] FCP observation not supported:', error)
    }
  }

  /**
   * Observe Largest Contentful Paint (LCP)
   */
  private observeLCP(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        // LCP can fire multiple times, we want the last one
        const lastEntry = entries[entries.length - 1]
        if (lastEntry) {
          this.metrics.lcp = lastEntry.startTime
          this.notifyCallbacks({ lcp: this.metrics.lcp })
        }
      })

      observer.observe({ type: 'largest-contentful-paint', buffered: true })
      this.trackObserver(observer)

      // LCP is final once the user interacts or the page is hidden; the browser
      // stops reporting after that, so release the observer at the same point.
      const finalizeLcp = () => this.releaseObserver(observer)
      const signal = this.listenerSignal
      window.addEventListener('keydown', finalizeLcp, { once: true, signal })
      window.addEventListener('pointerdown', finalizeLcp, { once: true, signal })
    } catch (error) {
      console.warn('[RendererPerformance] LCP observation not supported:', error)
    }
  }

  /**
   * Observe First Input Delay (FID)
   */
  private observeFID(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries() as PerformanceEventTiming[]
        for (const entry of entries) {
          // FID is the processing start time minus the event timestamp
          if (entry.processingStart && entry.startTime) {
            this.metrics.fid = entry.processingStart - entry.startTime
            this.notifyCallbacks({ fid: this.metrics.fid })
            // FID is measured once, on the first input only.
            this.releaseObserver(observer)
            break
          }
        }
      })

      observer.observe({ type: 'first-input', buffered: true })
      this.trackObserver(observer)
    } catch (error) {
      console.warn('[RendererPerformance] FID observation not supported:', error)
    }
  }

  /**
   * Observe Cumulative Layout Shift (CLS)
   */
  private observeCLS(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries() as (PerformanceEntry & {
          hadRecentInput?: boolean
          value?: number
        })[]
        for (const entry of entries) {
          // Only count layout shifts without recent user input
          if (!entry.hadRecentInput && entry.value !== undefined) {
            this.recordLayoutShift(entry.startTime, entry.value)
          }
        }
        this.metrics.cls = this.clsValue
        this.notifyCallbacks({ cls: this.metrics.cls })
      })

      observer.observe({ type: 'layout-shift', buffered: true })
      this.trackObserver(observer)
    } catch (error) {
      console.warn('[RendererPerformance] CLS observation not supported:', error)
    }
  }

  /**
   * Fold a layout shift into the windowed CLS accumulator.
   *
   * Uses the standard web-vitals session windowing (max 5s window, max 1s gap)
   * and reports the highest-scoring window. Only numbers are kept, so no
   * `LayoutShift` entry - and therefore no `sources[].node` reference - outlives
   * this call.
   */
  private recordLayoutShift(startTime: number, value: number): void {
    const withinCurrentSession =
      this.clsSessionValue > 0 &&
      startTime - this.clsSessionLastShiftTime < CLS_SESSION_MAX_GAP_MS &&
      startTime - this.clsSessionFirstShiftTime < CLS_SESSION_MAX_DURATION_MS

    if (withinCurrentSession) {
      this.clsSessionValue += value
      this.clsSessionLastShiftTime = startTime
    } else {
      this.clsSessionValue = value
      this.clsSessionFirstShiftTime = startTime
      this.clsSessionLastShiftTime = startTime
    }

    if (this.clsSessionValue > this.clsValue) {
      this.clsValue = this.clsSessionValue
    }
  }

  /**
   * Observe Long Tasks for TTI approximation
   * TTI is approximated as the time after FCP when there are no long tasks for 5 seconds
   */
  private observeLongTasks(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        for (const entry of entries) {
          const taskEnd = entry.startTime + entry.duration
          if (taskEnd > this.lastLongTaskEnd) {
            this.lastLongTaskEnd = taskEnd
          }
        }
        // Reset TTI calculation when new long tasks occur
        this.scheduleTTICheck()
      })

      observer.observe({ type: 'longtask', buffered: true })
      this.trackObserver(observer)
      this.longTaskObserver = observer

      // Start initial TTI check
      this.scheduleTTICheck()
    } catch (error) {
      console.warn('[RendererPerformance] Long task observation not supported:', error)
      // Fallback: use load event as TTI approximation
      this.useFallbackTTI()
    }
  }

  /**
   * Schedule TTI check after quiet period
   * TTI is considered reached when there are no long tasks for 5 seconds after FCP
   */
  private scheduleTTICheck(): void {
    if (this.ttiResolved) return

    if (this.ttiTimeout) {
      clearTimeout(this.ttiTimeout)
    }

    // Wait for 5 seconds of quiet time (no long tasks)
    this.ttiTimeout = setTimeout(() => {
      if (!this.ttiResolved && this.metrics.fcp !== null) {
        // TTI is the later of FCP or the end of the last long task
        this.metrics.tti = Math.max(this.metrics.fcp, this.lastLongTaskEnd)
        this.ttiResolved = true
        this.notifyCallbacks({ tti: this.metrics.tti })
        this.finalizeTTI()
      }
    }, 5000)
  }

  /**
   * TTI is single-valued. Once resolved, long-task observation exists purely to
   * burn main-thread time in a renderer that stays open for hours, so stop it.
   */
  private finalizeTTI(): void {
    if (this.ttiTimeout) {
      clearTimeout(this.ttiTimeout)
      this.ttiTimeout = null
    }

    if (this.longTaskObserver) {
      this.releaseObserver(this.longTaskObserver)
      this.longTaskObserver = null
    }
  }

  /**
   * Fallback TTI calculation using load event
   */
  private useFallbackTTI(): void {
    if (document.readyState === 'complete') {
      this.setFallbackTTI()
    } else {
      window.addEventListener('load', () => this.setFallbackTTI(), {
        once: true,
        signal: this.listenerSignal,
      })
    }
  }

  /**
   * Set TTI using load event timing as fallback
   */
  private setFallbackTTI(): void {
    if (this.ttiResolved) return

    const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    if (navEntries.length > 0 && navEntries[0].loadEventEnd > 0) {
      this.metrics.tti = navEntries[0].loadEventEnd
      this.ttiResolved = true
      this.notifyCallbacks({ tti: this.metrics.tti })
      this.finalizeTTI()
    }
  }

  /**
   * Listen for DOM events to update timing metrics
   */
  private listenForDOMEvents(): void {
    const signal = this.listenerSignal

    if (document.readyState === 'loading') {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          this.collectNavigationTiming()
        },
        { once: true, signal }
      )
    }

    if (document.readyState !== 'complete') {
      window.addEventListener(
        'load',
        () => {
          this.collectNavigationTiming()
        },
        { once: true, signal }
      )
    }
  }

  /**
   * Register a callback to be notified when metrics are updated
   */
  onMetricsUpdate(callback: PerformanceCallback): () => void {
    this.callbacks.push(callback)
    return () => {
      const index = this.callbacks.indexOf(callback)
      if (index > -1) {
        this.callbacks.splice(index, 1)
      }
    }
  }

  /**
   * Notify all registered callbacks of metric updates
   */
  private notifyCallbacks(updates: Partial<RendererPerformanceMetrics>): void {
    for (const callback of this.callbacks) {
      try {
        callback(updates)
      } catch (error) {
        console.error('[RendererPerformance] Callback error:', error)
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
    }
  }

  /**
   * Get a summary of key metrics for display
   */
  getSummary(): {
    fcp: string
    tti: string
    lcp: string
    fid: string
    cls: string
  } {
    const formatMs = (value: number | null): string => {
      if (value === null) return 'N/A'
      return `${value.toFixed(0)}ms`
    }

    const formatCLS = (value: number | null): string => {
      if (value === null) return 'N/A'
      return value.toFixed(3)
    }

    return {
      fcp: formatMs(this.metrics.fcp),
      tti: formatMs(this.metrics.tti),
      lcp: formatMs(this.metrics.lcp),
      fid: formatMs(this.metrics.fid),
      cls: formatCLS(this.metrics.cls),
    }
  }

  /**
   * Check if metrics meet performance thresholds
   */
  checkThresholds(): { warnings: string[] } {
    const warnings: string[] = []

    // FCP threshold: 500ms (from Requirement 7.6)
    if (this.metrics.fcp !== null && this.metrics.fcp > 500) {
      warnings.push(`FCP (${this.metrics.fcp.toFixed(0)}ms) exceeds 500ms threshold`)
    }

    // LCP threshold: 2500ms (good), 4000ms (needs improvement)
    if (this.metrics.lcp !== null && this.metrics.lcp > 2500) {
      warnings.push(`LCP (${this.metrics.lcp.toFixed(0)}ms) exceeds 2500ms threshold`)
    }

    // FID threshold: 100ms (good), 300ms (needs improvement)
    if (this.metrics.fid !== null && this.metrics.fid > 100) {
      warnings.push(`FID (${this.metrics.fid.toFixed(0)}ms) exceeds 100ms threshold`)
    }

    // CLS threshold: 0.1 (good), 0.25 (needs improvement)
    if (this.metrics.cls !== null && this.metrics.cls > 0.1) {
      warnings.push(`CLS (${this.metrics.cls.toFixed(3)}) exceeds 0.1 threshold`)
    }

    return { warnings }
  }

  /**
   * Clean up observers and resources
   */
  cleanup(): void {
    for (const observer of this.observers) {
      observer.disconnect()
    }
    this.observers = []
    this.longTaskObserver = null
    this.callbacks = []

    if (this.ttiTimeout) {
      clearTimeout(this.ttiTimeout)
      this.ttiTimeout = null
    }

    // Removes every listener registered through `listenerSignal`.
    this.listenerAbort?.abort()
    this.listenerAbort = null

    this.initialized = false
  }

  /**
   * Number of still-connected observers. Exposed for diagnostics and for the
   * long-session regression test.
   */
  getActiveObserverCount(): number {
    return this.observers.length
  }
}

// Singleton instance
export const rendererPerformanceTracker = new RendererPerformanceTracker()

/**
 * Initialize renderer performance tracking
 * Call this early in the application lifecycle (e.g., in main.tsx)
 */
export function initializeRendererPerformance(): void {
  rendererPerformanceTracker.initialize()
}

/**
 * Lazily reveals elements with Intersection Observer and optional TTI gating.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { rendererPerformanceTracker } from '../utils/rendererPerformance'

/**
 * Configuration options for the useLazyLoad hook
 */
export interface UseLazyLoadOptions {
  /**
   * Root margin for the Intersection Observer (CSS margin syntax)
   * Positive values load elements before they enter the viewport
   * @default '100px'
   */
  rootMargin?: string

  /**
   * Threshold(s) at which to trigger the callback
   * @default 0
   */
  threshold?: number | number[]

  /**
   * Whether to wait for TTI before allowing loading
   * When true, elements won't load until both:
   * 1. They are in/near the viewport (Intersection Observer)
   * 2. TTI has been reached
   * @default false
   */
  waitForTTI?: boolean

  /**
   * Timeout in ms to force loading even if TTI hasn't been reached
   * Prevents indefinite waiting if TTI detection fails
   * @default 10000
   */
  ttiTimeout?: number

  /**
   * Whether the lazy loading is enabled
   * When false, isIntersecting will always be true
   * @default true
   */
  enabled?: boolean

  /**
   * Callback when element becomes visible
   */
  onVisible?: () => void

  /**
   * Whether to disconnect observer after first intersection
   * @default true
   */
  triggerOnce?: boolean
}

/**
 * Return type for the useLazyLoad hook
 */
export interface UseLazyLoadResult<T extends HTMLElement = HTMLElement> {
  /**
   * Ref to attach to the target element
   */
  ref: React.RefObject<T | null>

  /**
   * Whether the element is currently intersecting (or has intersected if triggerOnce)
   */
  isIntersecting: boolean

  /**
   * Whether TTI has been reached (always true if waitForTTI is false)
   */
  isTTIReached: boolean

  /**
   * Whether the element should load (isIntersecting && isTTIReached)
   */
  shouldLoad: boolean

  /**
   * Manually trigger loading (bypasses intersection and TTI checks)
   */
  forceLoad: () => void
}

/**
 * Global TTI state management
 * Shared across all hook instances to avoid redundant listeners
 */
let globalTTIReached = false
let globalTTIListeners: Set<() => void> = new Set()
let globalTTIInitialized = false

/**
 * Initialize global TTI tracking
 */
function initializeGlobalTTI(): void {
  if (globalTTIInitialized) return
  globalTTIInitialized = true

  // Check if TTI is already available
  const metrics = rendererPerformanceTracker.getMetrics()
  if (metrics.tti !== null) {
    globalTTIReached = true
    if (import.meta.env.DEV) console.log('[useLazyLoad] TTI already reached:', metrics.tti)
    return
  }

  // Subscribe to TTI updates
  const unsubscribe = rendererPerformanceTracker.onMetricsUpdate((updates) => {
    if (updates.tti !== undefined && updates.tti !== null) {
      globalTTIReached = true
      if (import.meta.env.DEV) console.log('[useLazyLoad] TTI reached:', updates.tti)

      // Notify all listeners
      globalTTIListeners.forEach((listener) => {
        try {
          listener()
        } catch (error) {
          console.error('[useLazyLoad] TTI listener error:', error)
        }
      })

      // Clear listeners after notification
      globalTTIListeners.clear()

      // Unsubscribe from further updates
      unsubscribe()
    }
  })
}

/**
 * Subscribe to global TTI event
 */
function subscribeToTTI(callback: () => void): () => void {
  if (globalTTIReached) {
    // TTI already reached, call immediately
    callback()
    return () => {}
  }

  globalTTIListeners.add(callback)
  return () => {
    globalTTIListeners.delete(callback)
  }
}

/**
 * useLazyLoad Hook
 *
 * Provides lazy loading functionality using Intersection Observer with optional
 * TTI gating for non-critical assets.
 *
 * @example
 * // Basic lazy loading
 * const { ref, shouldLoad } = useLazyLoad<HTMLDivElement>();
 * return (
 *   <div ref={ref}>
 *     {shouldLoad && <ExpensiveComponent />}
 *   </div>
 * );
 *
 * @example
 * // With TTI gating for non-critical images
 * const { ref, shouldLoad } = useLazyLoad<HTMLImageElement>({
 *   waitForTTI: true,
 *   rootMargin: '200px'
 * });
 * return (
 *   <div ref={ref}>
 *     {shouldLoad ? <img src={src} /> : <Placeholder />}
 *   </div>
 * );
 */
export function useLazyLoad<T extends HTMLElement = HTMLElement>(
  options: UseLazyLoadOptions = {}
): UseLazyLoadResult<T> {
  const {
    rootMargin = '100px',
    threshold = 0,
    waitForTTI = false,
    ttiTimeout = 10000,
    enabled = true,
    onVisible,
    triggerOnce = true,
  } = options

  const ref = useRef<T>(null)
  const [isIntersecting, setIsIntersecting] = useState(false)
  const [isTTIReached, setIsTTIReached] = useState(!waitForTTI || globalTTIReached)
  const [forcedLoad, setForcedLoad] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const hasTriggeredRef = useRef(false)

  // Initialize global TTI tracking if needed
  useEffect(() => {
    if (waitForTTI) {
      initializeGlobalTTI()
    }
  }, [waitForTTI])

  // Subscribe to TTI updates
  useEffect(() => {
    if (!waitForTTI || isTTIReached) return

    const unsubscribe = subscribeToTTI(() => {
      setIsTTIReached(true)
    })

    // Set up timeout fallback
    const timeoutId = setTimeout(() => {
      if (!globalTTIReached) {
        if (import.meta.env.DEV) console.warn('[useLazyLoad] TTI timeout reached, forcing load')
        setIsTTIReached(true)
      }
    }, ttiTimeout)

    return () => {
      unsubscribe()
      clearTimeout(timeoutId)
    }
  }, [waitForTTI, isTTIReached, ttiTimeout])

  // Force load function
  const forceLoad = useCallback(() => {
    setForcedLoad(true)
    setIsIntersecting(true)
    setIsTTIReached(true)
  }, [])

  // Set up Intersection Observer
  useEffect(() => {
    if (!enabled || forcedLoad) {
      setIsIntersecting(true)
      return
    }

    const element = ref.current
    if (!element) return

    // Check if IntersectionObserver is available
    if (typeof IntersectionObserver === 'undefined') {
      if (import.meta.env.DEV)
        console.warn('[useLazyLoad] IntersectionObserver not available, loading immediately')
      setIsIntersecting(true)
      return
    }

    const handleIntersection: IntersectionObserverCallback = (entries) => {
      const [entry] = entries

      if (entry.isIntersecting) {
        if (triggerOnce && hasTriggeredRef.current) return

        hasTriggeredRef.current = true
        setIsIntersecting(true)

        if (onVisible) {
          onVisible()
        }

        // Disconnect if triggerOnce
        if (triggerOnce && observerRef.current) {
          observerRef.current.disconnect()
          observerRef.current = null
        }
      } else if (!triggerOnce) {
        setIsIntersecting(false)
      }
    }

    observerRef.current = new IntersectionObserver(handleIntersection, {
      rootMargin,
      threshold,
    })

    observerRef.current.observe(element)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
    }
  }, [enabled, forcedLoad, rootMargin, threshold, triggerOnce, onVisible])

  // Calculate shouldLoad
  const shouldLoad = forcedLoad || (isIntersecting && isTTIReached)

  return {
    ref,
    isIntersecting,
    isTTIReached,
    shouldLoad,
    forceLoad,
  }
}

/**
 * Check if TTI has been reached globally
 * Useful for components that need to check TTI status without using the hook
 */
export function isTTIReached(): boolean {
  return globalTTIReached
}

/**
 * Wait for TTI to be reached
 * Returns a promise that resolves when TTI is reached
 */
export function waitForTTI(timeout = 10000): Promise<void> {
  return new Promise((resolve) => {
    if (globalTTIReached) {
      resolve()
      return
    }

    initializeGlobalTTI()

    const timeoutId = setTimeout(() => {
      if (import.meta.env.DEV) console.warn('[waitForTTI] Timeout reached')
      resolve()
    }, timeout)

    subscribeToTTI(() => {
      clearTimeout(timeoutId)
      resolve()
    })
  })
}

export default useLazyLoad

import { useEffect, useLayoutEffect, type RefObject } from 'react'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

import { OVERLAY_DRAG_STRIP_HEIGHT, OVERLAY_MEASURE_CLASS_MIN_HEIGHTS } from './overlayLayout'

function readClassMinHeightFallback(element: HTMLElement): number {
  for (const className of element.classList) {
    const fallback = OVERLAY_MEASURE_CLASS_MIN_HEIGHTS[className]
    if (fallback) return fallback
  }
  return 0
}

function readElementBlockHeight(element: HTMLElement): number {
  const measured = Math.ceil(element.offsetHeight || element.scrollHeight || 0)
  if (measured > 0) return measured

  const minHeight = Number.parseFloat(getComputedStyle(element).minHeight)
  if (Number.isFinite(minHeight) && minHeight > 0) return Math.ceil(minHeight)

  const classFallback = readClassMinHeightFallback(element)
  if (classFallback > 0) return classFallback

  let nested = 0
  for (const child of element.children) {
    nested += readElementBlockHeight(child as HTMLElement)
  }
  return nested
}

/**
 * Read the intrinsic content height for the overlay measure wrapper.
 * Falls back to child block heights when scrollHeight is not populated.
 */
export function readOverlayContentHeight(element: HTMLElement): number {
  const scrollHeight = Math.ceil(element.scrollHeight)
  if (scrollHeight > 0) return scrollHeight

  let total = 0
  for (const child of element.children) {
    total += readElementBlockHeight(child as HTMLElement)
  }

  const style = getComputedStyle(element)
  let paddingTop = Number.parseFloat(style.paddingTop) || 0
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0
  if (element.classList.contains('zo-measure') && paddingTop === 0) {
    paddingTop = OVERLAY_DRAG_STRIP_HEIGHT
  }

  return Math.ceil(total + paddingTop + paddingBottom)
}

/**
 * Synchronously measure overlay content and invoke the resize bridge when height > 0.
 * Returns the measured height (0 when the element has no measurable content).
 */
export function reportOverlayContentHeight(
  element: HTMLElement,
  setContentHeight: (height: number) => void | Promise<unknown>
): number {
  const height = readOverlayContentHeight(element)
  if (height > 0) {
    void Promise.resolve(setContentHeight(height)).catch(() => {
      // Sizing is best-effort; ignore bridge failures.
    })
  }
  return height
}

/**
 * Measures the natural height of the overlay content and reports it to the main
 * process via `window.overlay.setContentHeight`, which resizes the BrowserWindow
 * (animated on macOS, snapped on Windows). Clamping to the window's min/max is
 * enforced in the main process; this hook only measures + debounces.
 */
export function useOverlayAutoHeight(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean = true,
  /** Changes here force a fresh measurement (e.g. pill -> card expansion). */
  reportKey: unknown = null
): void {
  useIsomorphicLayoutEffect(() => {
    if (!enabled) return
    const element = ref.current
    if (!element) return
    if (typeof window.overlay?.setContentHeight !== 'function') return

    let frame = 0

    const report = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        reportOverlayContentHeight(element, (height) => window.overlay.setContentHeight(height))
      })
    }

    report()

    if (typeof ResizeObserver === 'undefined') {
      return () => cancelAnimationFrame(frame)
    }

    const observer = new ResizeObserver(report)
    observer.observe(element)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [ref, enabled, reportKey])
}

export default useOverlayAutoHeight

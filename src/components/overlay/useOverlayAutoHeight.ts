import { useEffect, type RefObject } from 'react'

/**
 * Measures the natural height of the overlay content and reports it to the main
 * process via `window.overlay.setContentHeight`, which resizes the BrowserWindow
 * (animated on macOS, snapped on Windows). Clamping to the window's min/max is
 * enforced in the main process; this hook only measures + debounces.
 */
export function useOverlayAutoHeight(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return
    const element = ref.current
    if (!element) return
    if (typeof window.overlay?.setContentHeight !== 'function') return

    let frame = 0

    const report = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const height = Math.ceil(element.scrollHeight)
        if (height > 0) {
          void window.overlay.setContentHeight(height).catch(() => {
            // Sizing is best-effort; ignore bridge failures.
          })
        }
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
  }, [ref, enabled])
}

export default useOverlayAutoHeight

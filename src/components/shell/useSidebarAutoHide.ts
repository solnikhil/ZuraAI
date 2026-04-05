import { useEffect, useRef } from 'react'

export const SIDEBAR_AUTO_HIDE_THRESHOLD_PX = 900

interface UseSidebarAutoHideOptions {
  enabled: boolean
  hasSidebar: boolean
  setSidebarHidden: (hidden: boolean) => void
}

export function useSidebarAutoHide({
  enabled,
  hasSidebar,
  setSidebarHidden,
}: UseSidebarAutoHideOptions) {
  const hasRunInitialCheckRef = useRef(false)
  const lastWidthRef = useRef<number | null>(null)

  useEffect(() => {
    if (!hasSidebar || !enabled) {
      lastWidthRef.current = window.innerWidth
      return
    }

    const applyHideIfStillNarrow = () => {
      if (window.innerWidth <= SIDEBAR_AUTO_HIDE_THRESHOLD_PX) {
        setSidebarHidden(true)
      }
    }

    const currentWidth = window.innerWidth
    if (!hasRunInitialCheckRef.current) {
      hasRunInitialCheckRef.current = true
      applyHideIfStillNarrow()
    }
    lastWidthRef.current = currentWidth

    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const handleResize = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const width = window.innerWidth
        const previousWidth = lastWidthRef.current ?? width
        const crossedIntoNarrowRange =
          previousWidth > SIDEBAR_AUTO_HIDE_THRESHOLD_PX &&
          width <= SIDEBAR_AUTO_HIDE_THRESHOLD_PX

        lastWidthRef.current = width

        if (crossedIntoNarrowRange) {
          setSidebarHidden(true)
        }

        debounceTimer = null
      }, 200)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [enabled, hasSidebar, setSidebarHidden])
}

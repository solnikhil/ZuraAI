import { useEffect, useRef, useState } from 'react'

export function useResizeIndicator(enabled: boolean) {
  const [resizeIndicator, setResizeIndicator] = useState<string | null>(null)
  const resizeIndicatorTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    const getSizeLabel = () => {
      const width = window.outerWidth || window.innerWidth
      const height = window.outerHeight || window.innerHeight
      return `${width} x ${height}`
    }

    const clearHideTimer = () => {
      if (resizeIndicatorTimerRef.current !== null) {
        window.clearTimeout(resizeIndicatorTimerRef.current)
        resizeIndicatorTimerRef.current = null
      }
    }

    const onResize = () => {
      setResizeIndicator(getSizeLabel())
      clearHideTimer()
      resizeIndicatorTimerRef.current = window.setTimeout(() => {
        setResizeIndicator(null)
        resizeIndicatorTimerRef.current = null
      }, 600)
    }

    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      clearHideTimer()
    }
  }, [enabled])

  return resizeIndicator
}

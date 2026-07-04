import { useEffect, useState } from 'react'

export function useWindowMaximizeState() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (!window.windowControls) return

    window.windowControls
      .isMaximized()
      .then(setIsMaximized)
      .catch((error) => {
        console.warn('[useWindowMaximizeState] Failed to read window maximize state', error)
      })

    const cleanup = window.windowControls.onWindowState((state) => {
      setIsMaximized(state.isMaximized)
    })

    return cleanup
  }, [])

  return { isMaximized, setIsMaximized }
}

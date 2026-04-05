import { useEffect, useState } from 'react'

export function useWindowMaximizeState() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (!window.windowControls) return

    window.windowControls.isMaximized().then(setIsMaximized).catch(() => {})

    const cleanup = window.windowControls.onWindowState((state) => {
      setIsMaximized(state.isMaximized)
    })

    return cleanup
  }, [])

  return { isMaximized, setIsMaximized }
}

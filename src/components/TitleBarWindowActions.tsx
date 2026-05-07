import { useCallback } from 'react'
import WindowControlButtons from './WindowControlButtons'

interface TitleBarWindowActionsProps {
  isMacOS: boolean
  isMaximized: boolean
  setIsMaximized: (value: boolean) => void
}

export default function TitleBarWindowActions({
  isMacOS,
  isMaximized,
  setIsMaximized,
}: TitleBarWindowActionsProps) {
  const handleToggleMaximize = useCallback(() => {
    window.windowControls
      ?.toggleMaximize()
      .then(() => {
        window.windowControls
          ?.isMaximized()
          .then(setIsMaximized)
          .catch((error) => {
            console.warn('[TitleBarWindowActions] Failed to read maximize state after toggle', error)
          })
      })
      .catch((error) => {
        console.warn('[TitleBarWindowActions] Failed to toggle maximize', error)
      })
  }, [setIsMaximized])

  const handleMinimize = useCallback(() => {
    window.windowControls?.minimize().catch((error) => {
      console.warn('[TitleBarWindowActions] Failed to minimize window', error)
    })
  }, [])

  const handleClose = useCallback(() => {
    window.windowControls?.close().catch((error) => {
      console.warn('[TitleBarWindowActions] Failed to close window', error)
    })
  }, [])

  return (
    <>
      {!isMacOS && (
        <WindowControlButtons
          isMaximized={isMaximized}
          onMinimize={handleMinimize}
          onToggleMaximize={handleToggleMaximize}
          onClose={handleClose}
        />
      )}
    </>
  )
}

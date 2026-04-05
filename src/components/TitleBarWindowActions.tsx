import { useCallback } from 'react'
import TitleBarInfoMenu from './TitleBarInfoMenu'
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
        window.windowControls?.isMaximized().then(setIsMaximized).catch(() => {})
      })
      .catch(() => {})
  }, [setIsMaximized])

  const handleMinimize = useCallback(() => {
    window.windowControls?.minimize().catch(() => {})
  }, [])

  const handleClose = useCallback(() => {
    window.windowControls?.close().catch(() => {})
  }, [])

  return (
    <>
      <TitleBarInfoMenu />
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

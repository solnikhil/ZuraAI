import { useCallback } from 'react'
import TitleBarInfoMenu from './TitleBarInfoMenu'
import WindowControlButtons from './WindowControlButtons'

interface TitleBarWindowActionsProps {
  isMacOS: boolean
  isMaximized: boolean
  setIsMaximized: (value: boolean) => void
  hasUnsavedSettings: boolean
  isSettingsView: boolean
  setDashboardView: (view: 'chat' | 'settings') => void
}

export default function TitleBarWindowActions({
  isMacOS,
  isMaximized,
  setIsMaximized,
  hasUnsavedSettings,
  isSettingsView,
  setDashboardView,
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
      <TitleBarInfoMenu
        hasUnsavedSettings={hasUnsavedSettings}
        isSettingsView={isSettingsView}
        setDashboardView={setDashboardView}
      />
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

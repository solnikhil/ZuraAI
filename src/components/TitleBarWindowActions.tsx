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

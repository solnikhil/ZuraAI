import { useCallback } from 'react'
import { ArrowLeft, PanelLeft, SettingsIcon } from './icons'

interface TitleBarSidebarControlsProps {
  hasSidebar: boolean
  hasUnsavedSettings: boolean
  isSettingsView: boolean
  settingsButtonDisabled: boolean
  sidebarHidden: boolean
  toggleSidebarHidden: () => void
  setDashboardView: (view: 'chat' | 'settings') => void
}

export default function TitleBarSidebarControls({
  hasSidebar,
  hasUnsavedSettings,
  isSettingsView,
  settingsButtonDisabled,
  sidebarHidden,
  toggleSidebarHidden,
  setDashboardView,
}: TitleBarSidebarControlsProps) {
  const handleSettingsButtonClick = useCallback(() => {
    if (isSettingsView) {
      if (!hasUnsavedSettings) {
        setDashboardView('chat')
      }
      return
    }

    setDashboardView('settings')
  }, [hasUnsavedSettings, isSettingsView, setDashboardView])

  return (
    <>
      {hasSidebar && (
        <div className="app-titlebar__controls no-drag">
          <button
            type="button"
            className="app-titlebar__icon-btn"
            onClick={toggleSidebarHidden}
            aria-label={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
            title={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
          >
            <PanelLeft size={16} />
          </button>
          <button
            type="button"
            className={[
              'app-titlebar__icon-btn',
              isSettingsView ? 'app-titlebar__icon-btn--back' : 'app-titlebar__icon-btn--settings',
              settingsButtonDisabled ? 'app-titlebar__icon-btn--disabled' : null,
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={handleSettingsButtonClick}
            aria-label={isSettingsView ? 'Back to chat' : 'Open settings'}
            title={
              settingsButtonDisabled
                ? 'Save or discard changes to go back'
                : isSettingsView
                  ? 'Back to chat'
                  : 'Open settings'
            }
            disabled={settingsButtonDisabled}
          >
            {isSettingsView ? <ArrowLeft size={16} /> : <SettingsIcon size={16} />}
          </button>
        </div>
      )}
      {hasUnsavedSettings && isSettingsView && (
        <span className="app-titlebar__unsaved" title="Unsaved changes" />
      )}
    </>
  )
}

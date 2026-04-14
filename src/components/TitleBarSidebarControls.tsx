import { useCallback } from 'react'
import { PanelLeft } from './icons'

interface TitleBarSidebarControlsProps {
  hasSidebar: boolean
  hasUnsavedSettings: boolean
  isSettingsView: boolean
  sidebarHidden: boolean
  toggleSidebarHidden: () => void
}

export default function TitleBarSidebarControls({
  hasSidebar,
  hasUnsavedSettings,
  isSettingsView,
  sidebarHidden,
  toggleSidebarHidden,
}: TitleBarSidebarControlsProps) {
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
        </div>
      )}
      {hasUnsavedSettings && isSettingsView && (
        <span className="app-titlebar__unsaved" title="Unsaved changes" />
      )}
    </>
  )
}

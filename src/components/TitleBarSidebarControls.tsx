import { PanelLeft } from './icons'
import TitleBarNavigation from './TitleBarNavigation'

interface TitleBarSidebarControlsProps {
  canGoBack: boolean
  canGoForward: boolean
  onBack: () => void
  onForward: () => void
  hasSidebar: boolean
  hasUnsavedSettings: boolean
  isSettingsView: boolean
  sidebarHidden: boolean
  toggleSidebarHidden: () => void
}

export default function TitleBarSidebarControls({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
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
            className="app-titlebar__icon-btn app-titlebar__icon-btn--nav"
            onClick={toggleSidebarHidden}
            aria-label={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
            title={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
          >
            <PanelLeft size={16} />
          </button>
        </div>
      )}

      <TitleBarNavigation
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={onBack}
        onForward={onForward}
      />

      {hasUnsavedSettings && isSettingsView && (
        <span className="app-titlebar__unsaved" title="Unsaved changes" />
      )}
    </>
  )
}

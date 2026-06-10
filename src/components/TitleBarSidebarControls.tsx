import { PanelLeft } from './icons'
import TitleBarNavigation from './TitleBarNavigation'

interface TitleBarSidebarControlsProps {
  canGoBack: boolean
  canGoForward: boolean
  isMacOS: boolean
  onBack: () => void
  onForward: () => void
  hasSidebar: boolean
  hasUnsavedSettings: boolean
  isSettingsView: boolean
  showNavigation?: boolean
  sidebarHidden: boolean
  toggleSidebarHidden: () => void
}

export default function TitleBarSidebarControls({
  canGoBack,
  canGoForward,
  isMacOS,
  onBack,
  onForward,
  hasSidebar,
  hasUnsavedSettings,
  isSettingsView,
  showNavigation = true,
  sidebarHidden,
  toggleSidebarHidden,
}: TitleBarSidebarControlsProps) {
  return (
    <>
      {hasSidebar && (
        <div
          className={[
            'app-titlebar__controls',
            'app-titlebar__controls--sidebar',
            'no-drag',
            isMacOS ? 'app-titlebar__controls--macos' : null,
          ]
            .filter(Boolean)
            .join(' ')}
        >
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

      {showNavigation && (
        <TitleBarNavigation
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onBack={onBack}
          onForward={onForward}
        />
      )}

      {showNavigation && hasUnsavedSettings && isSettingsView && (
        <span className="app-titlebar__unsaved" title="Unsaved changes" />
      )}
    </>
  )
}

import { PanelLeft } from './icons'
import TitleBarNavigation from './TitleBarNavigation'
import { TooltipIconButton } from './ui/TooltipIconButton'
import { WithTooltip } from './ui/WithTooltip'

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
          <TooltipIconButton
            tooltip={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
            className="app-titlebar__icon-btn app-titlebar__icon-btn--nav"
            onClick={toggleSidebarHidden}
            aria-label={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
          >
            <PanelLeft size={16} />
          </TooltipIconButton>
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
        <WithTooltip tooltip="Unsaved changes">
          <span className="app-titlebar__unsaved" />
        </WithTooltip>
      )}
    </>
  )
}

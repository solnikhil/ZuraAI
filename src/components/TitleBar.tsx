import React, { useCallback, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useSettings } from '../contexts/SettingsContext'
import { useAppShell } from '../contexts/AppShellContext'
import { SIDEBAR_COLLAPSED_WIDTH_PX } from '../constants/sidebar'
import TitleBarSidebarControls from './TitleBarSidebarControls'
import TitleBarWindowActions from './TitleBarWindowActions'
import TitleBarAppMenu from './TitleBarAppMenu'
import './TitleBar.css'
import { useShellRouteState } from './shell/useShellRouteState'
import { useWindowMaximizeState } from './shell/useWindowMaximizeState'

export default function TitleBar() {
  const location = useLocation()
  const { settings } = useSettings()
  const {
    sidebarCollapsed,
    sidebarWidth,
    sidebarHidden,
    toggleSidebarHidden,
    isResizingSidebar,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
  } = useAppShell()
  const { hasSidebar } = useShellRouteState(location.pathname)

  useEffect(() => {
    document.title = 'ZuraAI'
  }, [])

  const density = settings.titleBarDensity || 'comfortable'
  const sidebarWidthPx = sidebarHidden
    ? 0
    : sidebarCollapsed
      ? SIDEBAR_COLLAPSED_WIDTH_PX
      : sidebarWidth

  // Detect macOS platform
  const isMacOS = useMemo(() => {
    return navigator.platform.toLowerCase().includes('mac')
  }, [])
  const isWindows = useMemo(() => {
    return navigator.platform.toLowerCase().includes('win')
  }, [])
  const { isMaximized, setIsMaximized } = useWindowMaximizeState()

  const handleTitleBarDoubleClick = useCallback((e: React.MouseEvent) => {
    // Only trigger on the titlebar itself, not on buttons/controls
    if ((e.target as HTMLElement).closest('.no-drag')) return
    window.windowControls?.toggleMaximize().catch((error) => {
      console.warn('[TitleBar] Failed to toggle maximize on titlebar double-click', error)
    })
  }, [])

  return (
    <div
      className={[
        'app-titlebar',
        density === 'compact' ? 'app-titlebar--compact' : null,
        hasSidebar ? 'app-titlebar--with-sidebar' : null,
        isMacOS ? 'app-titlebar--macos' : null,
        isWindows ? 'app-titlebar--windows' : null,
        isMaximized ? 'app-titlebar--maximized' : null,
        !isMacOS ? 'app-titlebar--custom-controls' : null,
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--titlebar-stroke-left': hasSidebar ? `${sidebarWidthPx}px` : '0px',
        } as React.CSSProperties
      }
      onDoubleClick={handleTitleBarDoubleClick}
    >
      {hasSidebar && sidebarWidthPx > 0 && (
        <div
          className="app-titlebar__sidebar-solid"
          style={{
            width: `${sidebarWidthPx}px`,
            willChange: isResizingSidebar ? 'width' : 'auto',
            transition: isResizingSidebar ? 'none' : undefined,
          }}
        />
      )}

      <div className="app-titlebar__left">
        <TitleBarSidebarControls
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          isMacOS={isMacOS}
          onBack={goBack}
          onForward={goForward}
          hasSidebar={hasSidebar}
          sidebarHidden={sidebarHidden}
          toggleSidebarHidden={toggleSidebarHidden}
        />
        {isWindows && <TitleBarAppMenu />}
      </div>

      <div className="app-titlebar__middle">{/* Tab group removed - only chat view remains */}</div>

      <div className="app-titlebar__center"></div>

      <div className="app-titlebar__right">
        <TitleBarWindowActions
          isMacOS={isMacOS}
          isMaximized={isMaximized}
          setIsMaximized={setIsMaximized}
        />
      </div>
    </div>
  )
}

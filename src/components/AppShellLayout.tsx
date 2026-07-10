import { useCallback, useEffect, useMemo, type MouseEvent } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAppShell } from '../contexts/AppShellContext'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import { useSettingsUI } from '../contexts/SettingsUIContext'
import TitleBar from './TitleBar'
import TitleBarSidebarControls from './TitleBarSidebarControls'
import ResizeHandles from './ResizeHandles'
import AppContextMenu from './AppContextMenu'
import { useToast } from './shared/Toast'
import { useMouseNavigation } from './shell/useMouseNavigation'
import { useResizeIndicator } from './shell/useResizeIndicator'
import { useWindowMaximizeState } from './shell/useWindowMaximizeState'
import { useShellRouteState } from './shell/useShellRouteState'
import { isMacOSRuntime, isWindowsRuntime } from '../utils/platform'

export default function AppShellLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    dashboardView,
    hasUnsavedSettings,
    setDashboardView,
    sidebarHidden,
    toggleSidebarHidden,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
  } = useAppShell()
  const { clearCurrentSession } = useChatHistory()
  const { settingsUI } = useSettingsUI()
  const { showToast } = useToast()
  const isDev = import.meta.env.DEV

  const isWindows = useMemo(() => isWindowsRuntime(), [])
  const isMacOS = useMemo(() => isMacOSRuntime(), [])
  const { hasSidebar } = useShellRouteState(location.pathname)
  const isSettingsView = dashboardView === 'settings'

  const { isMaximized } = useWindowMaximizeState()
  const resizeIndicator = useResizeIndicator(isDev)
  useMouseNavigation()

  const handleMacDragRegionDoubleClick = useCallback((e: MouseEvent) => {
    // Traffic-light adjacent controls are no-drag; still guard for nested clicks.
    if ((e.target as HTMLElement).closest('.no-drag, .app-macos-titlebar-controls')) return
    window.windowControls?.toggleMaximize().catch((error) => {
      console.warn(
        '[AppShellLayout] Failed to toggle maximize on macOS drag-region double-click',
        error
      )
    })
  }, [])

  useEffect(() => {
    if (!window.ipcRenderer?.on) return

    const listener = () => {
      if (hasUnsavedSettings && dashboardView === 'settings') {
        showToast('You have unsaved settings changes', 'warning')
        return
      }

      navigate('/dashboard')
      setDashboardView('chat')
      clearCurrentSession()
    }

    window.ipcRenderer.on('app:new-chat', listener)
    return () => {
      window.ipcRenderer.off('app:new-chat', listener)
    }
  }, [
    clearCurrentSession,
    dashboardView,
    hasUnsavedSettings,
    navigate,
    setDashboardView,
    showToast,
  ])

  return (
    <AppContextMenu>
      <div
        className={[
          'app-frame',
          isWindows ? 'app-frame--windows' : null,
          isMacOS ? 'app-frame--macos' : null,
          isMaximized ? 'app-frame--maximized' : null,
        ]
          .filter(Boolean)
          .join(' ')}
        data-app-chrome-material={settingsUI.appChromeMaterial ?? 'acrylic'}
      >
        {isMacOS && (
          <div
            className="app-macos-drag-region"
            aria-hidden="true"
            onDoubleClick={handleMacDragRegionDoubleClick}
          />
        )}
        {isMacOS && (
          <div className="app-macos-titlebar-controls">
            <TitleBarSidebarControls
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              isMacOS={isMacOS}
              onBack={goBack}
              onForward={goForward}
              hasSidebar={hasSidebar}
              hasUnsavedSettings={hasUnsavedSettings}
              isSettingsView={isSettingsView}
              sidebarHidden={sidebarHidden}
              toggleSidebarHidden={toggleSidebarHidden}
            />
          </div>
        )}
        {isWindows && <TitleBar />}
        <div className="app-content">
          <Outlet />
        </div>
        {/* Render CSS-based resize handles on Windows (frameless window has no native handles) */}
        {isWindows && <ResizeHandles disabled={isMaximized} />}
        {isDev && resizeIndicator && (
          <div
            style={{
              position: 'fixed',
              top: '10px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 2000,
              pointerEvents: 'none',
              padding: '6px 10px',
              borderRadius: '10px',
              border: '1px solid var(--theme-border)',
              background: 'color-mix(in srgb, var(--theme-surface) 88%, black 12%)',
              color: 'var(--theme-text-primary)',
              fontSize: '0.78rem',
              lineHeight: 1,
              fontFamily: 'var(--font-mono)',
              boxShadow: 'var(--theme-shadow-sm)',
              letterSpacing: '0.02em',
            }}
          >
            {resizeIndicator}
          </div>
        )}
      </div>
    </AppContextMenu>
  )
}

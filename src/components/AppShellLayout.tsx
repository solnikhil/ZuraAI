import { useEffect, useMemo } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { AppShellProvider, useAppShell } from '../contexts/AppShellContext'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import TitleBar from './TitleBar'
import ResizeHandles from './ResizeHandles'
import { CommandPalette } from './CommandPalette'
import AppContextMenu from './AppContextMenu'
import { useToast } from './shared/Toast'
import { useMouseNavigation } from './shell/useMouseNavigation'
import { useResizeIndicator } from './shell/useResizeIndicator'
import { useWindowMaximizeState } from './shell/useWindowMaximizeState'

function AppShellContent() {
  const navigate = useNavigate()
  const { dashboardView, hasUnsavedSettings, setDashboardView } = useAppShell()
  const { createSession } = useChatHistory()
  const { showToast } = useToast()
  const isDev = import.meta.env.DEV

  const isWindows = useMemo(() => {
    return navigator.platform.toLowerCase().includes('win')
  }, [])

  const { isMaximized } = useWindowMaximizeState()
  const resizeIndicator = useResizeIndicator(isDev)
  useMouseNavigation()

  useEffect(() => {
    if (!window.ipcRenderer?.on) return

    const listener = () => {
      if (hasUnsavedSettings && dashboardView === 'settings') {
        showToast('You have unsaved settings changes', 'warning')
        return
      }

      navigate('/dashboard')
      setDashboardView('chat')
      createSession()
    }

    window.ipcRenderer.on('app:new-chat', listener)
    return () => {
      window.ipcRenderer.off('app:new-chat', listener)
    }
  }, [createSession, dashboardView, hasUnsavedSettings, navigate, setDashboardView, showToast])

  return (
    <AppContextMenu>
      <div
        className={[
          'app-frame',
          isWindows ? 'app-frame--windows' : null,
          isMaximized ? 'app-frame--maximized' : null,
        ].filter(Boolean).join(' ')}
      >
        <TitleBar />
        <CommandPalette />
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

export default function AppShellLayout() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <AppShellProvider pathname={location.pathname} navigateToPath={(pathname) => navigate(pathname)}>
      <AppShellContent />
    </AppShellProvider>
  )
}

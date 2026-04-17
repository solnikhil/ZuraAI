import { useMemo } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { AppShellProvider, useAppShell } from '../contexts/AppShellContext'
import { useSettingsUI } from '../contexts/SettingsUIContext'
import TitleBar from './TitleBar'
import ResizeHandles from './ResizeHandles'
import { CommandPalette } from './CommandPalette'
import AppContextMenu from './AppContextMenu'
import { useMouseNavigation } from './shell/useMouseNavigation'
import { useResizeIndicator } from './shell/useResizeIndicator'
import { useShellRouteState } from './shell/useShellRouteState'
import { useSidebarAutoHide } from './shell/useSidebarAutoHide'
import { useWindowMaximizeState } from './shell/useWindowMaximizeState'

function AppShellContent() {
    const location = useLocation()
    const { settingsUI } = useSettingsUI()
    const { sidebarAutoHideOnResize } = settingsUI
    const { setSidebarHidden } = useAppShell()
    const isDev = import.meta.env.DEV
    const { hasSidebar } = useShellRouteState(location.pathname)

    useSidebarAutoHide({
        enabled: sidebarAutoHideOnResize,
        hasSidebar,
        setSidebarHidden,
    })

    const isWindows = useMemo(() => {
        return navigator.platform.toLowerCase().includes('win')
    }, [])

    const { isMaximized } = useWindowMaximizeState()
    const resizeIndicator = useResizeIndicator(isDev)
    useMouseNavigation()

    return (
        <AppContextMenu>
            <div className="app-frame">
                <TitleBar />
                <CommandPalette />
                <div className="app-content">
                    <Outlet />
                </div>
                {/* Render CSS-based resize handles on Windows (frameless window has no native handles) */}
                {isWindows && (
                    <ResizeHandles disabled={isMaximized} />
                )}
                {isDev && resizeIndicator && (
                    <div style={{
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
                        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                        boxShadow: 'var(--theme-shadow-sm)',
                        letterSpacing: '0.02em'
                    }}>
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
        <AppShellProvider
            pathname={location.pathname}
            navigateToPath={(pathname) => navigate(pathname)}
        >
            <AppShellContent />
        </AppShellProvider>
    )
}

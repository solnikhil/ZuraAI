import { useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { AppShellProvider, useAppShell } from '../contexts/AppShellContext'
import { SIDEBAR_COLLAPSED_WIDTH_PX } from '../constants/sidebar'
import { useSettings } from '../contexts/SettingsContext'
import { useSettingsUI } from '../contexts/SettingsUIContext'
import TitleBar from './TitleBar'
import ResizeHandles from './ResizeHandles'
import { CommandPalette } from './CommandPalette'

/** Window width at or below which the sidebar auto-hides. User can unhide via the titlebar toggle. Matches minWidth in mainWindow. */
const SIDEBAR_AUTO_HIDE_THRESHOLD_PX = 900

function AppShellContent() {
    const navigate = useNavigate()
    const location = useLocation()
    const { settings } = useSettings()
    const { settingsUI } = useSettingsUI()
    const { frostedSidebar, sidebarAutoHideOnResize } = settingsUI
    const { sidebarCollapsed, sidebarHidden, sidebarWidth, setSidebarHidden } = useAppShell()
    const isDev = import.meta.env.DEV

    const isDashboardRoute = location.pathname === '/' || location.pathname === '/dashboard'
    const hasSidebar = isDashboardRoute || location.pathname === '/chat'

    // Auto-hide sidebar when window is at or below threshold (if enabled); user can unhide via titlebar toggle
    useEffect(() => {
        if (!hasSidebar || !sidebarAutoHideOnResize) return
        const handler = () => {
            const width = window.innerWidth
            if (width <= SIDEBAR_AUTO_HIDE_THRESHOLD_PX) {
                setSidebarHidden(true)
            }
        }
        handler() // Initial check on mount
        window.addEventListener('resize', handler)
        return () => window.removeEventListener('resize', handler)
    }, [hasSidebar, sidebarAutoHideOnResize, setSidebarHidden])
    const sidebarWidthPx = sidebarHidden
        ? 0
        : (sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH_PX : sidebarWidth)
    const titlebarHeightPx = settings.titleBarDensity === 'compact' ? 36 : 44

    // Detect Windows platform (same pattern as TitleBar)
    const isWindows = useMemo(() => {
        return navigator.platform.toLowerCase().includes('win')
    }, [])

    // Track window maximize state for resize handles
    const [isMaximized, setIsMaximized] = useState(false)
    const [resizeIndicator, setResizeIndicator] = useState<string | null>(null)
    const resizeIndicatorTimerRef = useRef<number | null>(null)

    useEffect(() => {
        if (!window.windowControls) return
        // Check initial state
        window.windowControls.isMaximized().then(setIsMaximized).catch(() => {})
        // Listen for state changes
        const cleanup = window.windowControls.onWindowState((state) => {
            setIsMaximized(state.isMaximized)
        })
        return cleanup
    }, [])

    // Dev-only resize indicator (helps tune responsive layouts while resizing)
    useEffect(() => {
        if (!isDev) return

        const getSizeLabel = () => {
            const width = window.outerWidth || window.innerWidth
            const height = window.outerHeight || window.innerHeight
            return `${width} x ${height}`
        }

        const clearHideTimer = () => {
            if (resizeIndicatorTimerRef.current !== null) {
                window.clearTimeout(resizeIndicatorTimerRef.current)
                resizeIndicatorTimerRef.current = null
            }
        }

        const onResize = () => {
            setResizeIndicator(getSizeLabel())
            clearHideTimer()
            resizeIndicatorTimerRef.current = window.setTimeout(() => {
                setResizeIndicator(null)
                resizeIndicatorTimerRef.current = null
            }, 600)
        }

        window.addEventListener('resize', onResize)
        return () => {
            window.removeEventListener('resize', onResize)
            clearHideTimer()
        }
    }, [isDev])

    // Toggle frosted-mode class on html element + notify main process for native blur
    useEffect(() => {
        if (frostedSidebar) {
            document.documentElement.classList.add('frosted-mode')
        } else {
            document.documentElement.classList.remove('frosted-mode')
        }
        // Toggle native OS blur (acrylic on Windows, vibrancy on macOS)
        try {
            (window as any).ipcRenderer?.send('set-native-blur', frostedSidebar)
        } catch {}
        return () => {
            document.documentElement.classList.remove('frosted-mode')
        }
    }, [frostedSidebar])

    useEffect(() => {
        const handleMouseUp = (e: MouseEvent) => {
            // Button 3 is "Back", Button 4 is "Forward"
            if (e.button === 3) {
                navigate(-1)
            } else if (e.button === 4) {
                navigate(1)
            }
        }

        window.addEventListener('mouseup', handleMouseUp)
        return () => window.removeEventListener('mouseup', handleMouseUp)
    }, [navigate])

    return (
        <div className="app-frame" style={{
            backgroundColor: frostedSidebar ? 'transparent' : 'var(--theme-background)',
            position: 'relative'
        }}>
            {/* Glass panel covering full sidebar column (titlebar + content) for frosted mode.
                A single backdrop-filter layer avoids the Chromium compositing seam that appeared
                when the titlebar glass strip and this panel each had their own backdrop-filter. */}
            {frostedSidebar && hasSidebar && sidebarWidthPx > 0 && (
                <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${sidebarWidthPx}px`,
                    background: `linear-gradient(180deg, rgba(10, 10, 14, 0.46) 0px, rgba(6, 6, 10, 0.33) ${titlebarHeightPx}px, rgba(6, 6, 10, 0.3) 100%)`,
                    borderRight: 'none',
                    boxShadow: 'none',
                    backdropFilter: 'var(--frosted-glass-filter)',
                    WebkitBackdropFilter: 'var(--frosted-glass-filter)',
                    zIndex: 0,
                    pointerEvents: 'none',
                    boxSizing: 'border-box'
                }} />
            )}
            <TitleBar />
            <CommandPalette />
            <div className="app-content" style={{
                backgroundColor: frostedSidebar ? 'transparent' : undefined,
                borderTop: 'none'
            }}>
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
    )
}

export default function AppShellLayout() {
    return (
        <AppShellProvider>
            <AppShellContent />
        </AppShellProvider>
    )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { AppShellProvider, useAppShell } from '../contexts/AppShellContext'
import { useSettingsUI } from '../contexts/SettingsUIContext'
import TitleBar from './TitleBar'
import ResizeHandles from './ResizeHandles'
import { CommandPalette } from './CommandPalette'
import AppContextMenu from './AppContextMenu'

/** Window width at or below which the sidebar auto-hides. User can unhide via the titlebar toggle. Matches minWidth in mainWindow. */
const SIDEBAR_AUTO_HIDE_THRESHOLD_PX = 900

function AppShellContent() {
    const navigate = useNavigate()
    const location = useLocation()
    const { settingsUI } = useSettingsUI()
    const { sidebarAutoHideOnResize } = settingsUI
    const { setSidebarHidden } = useAppShell()
    const isDev = import.meta.env.DEV
    const hasRunInitialSidebarAutoHideCheckRef = useRef(false)
    const lastSidebarAutoHideWidthRef = useRef<number | null>(null)

    const isDashboardRoute = location.pathname === '/' || location.pathname === '/dashboard'
    const hasSidebar = isDashboardRoute || location.pathname === '/chat'

    // Auto-hide sidebar when window is at or below threshold (if enabled); user can unhide via titlebar toggle.
    // Debounced to prevent rapid show/hide flicker when resizing near the threshold boundary.
    // Only auto-hides (never auto-shows) to avoid fighting user intent.
    // Uses threshold-crossing detection so incidental resizes while already narrow
    // don't repeatedly re-hide a user-unhidden sidebar.
    useEffect(() => {
        if (!hasSidebar || !sidebarAutoHideOnResize) {
            lastSidebarAutoHideWidthRef.current = window.innerWidth
            return
        }

        const applyHideIfStillNarrow = () => {
            if (window.innerWidth <= SIDEBAR_AUTO_HIDE_THRESHOLD_PX) {
                setSidebarHidden(true)
            }
        }

        const currentWidth = window.innerWidth
        if (!hasRunInitialSidebarAutoHideCheckRef.current) {
            hasRunInitialSidebarAutoHideCheckRef.current = true
            applyHideIfStillNarrow()
        }
        lastSidebarAutoHideWidthRef.current = currentWidth

        let debounceTimer: ReturnType<typeof setTimeout> | null = null

        const handler = () => {
            if (debounceTimer) clearTimeout(debounceTimer)
            debounceTimer = setTimeout(() => {
                const width = window.innerWidth
                const previousWidth = lastSidebarAutoHideWidthRef.current ?? width
                const crossedIntoNarrowRange = previousWidth > SIDEBAR_AUTO_HIDE_THRESHOLD_PX && width <= SIDEBAR_AUTO_HIDE_THRESHOLD_PX
                lastSidebarAutoHideWidthRef.current = width

                if (crossedIntoNarrowRange) {
                    setSidebarHidden(true)
                }
                debounceTimer = null
            }, 200)
        }

        window.addEventListener('resize', handler)
        return () => {
            window.removeEventListener('resize', handler)
            if (debounceTimer) clearTimeout(debounceTimer)
        }
    }, [hasSidebar, sidebarAutoHideOnResize, setSidebarHidden])
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
    return (
        <AppShellProvider>
            <AppShellContent />
        </AppShellProvider>
    )
}

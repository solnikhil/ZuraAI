import React, { useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { AppShellProvider, useAppShell } from '../contexts/AppShellContext'
import { useSettingsUI } from '../contexts/SettingsUIContext'
import TitleBar from './TitleBar'
import ResizeHandles from './ResizeHandles'

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E")`

function AppShellContent() {
    const navigate = useNavigate()
    const location = useLocation()
    const { settingsUI } = useSettingsUI()
    const { frostedSidebar } = settingsUI
    const { sidebarCollapsed, sidebarHidden } = useAppShell()

    const isDashboardRoute = location.pathname === '/' || location.pathname === '/dashboard'
    const sidebarWidthPx = sidebarHidden ? 0 : (sidebarCollapsed ? 60 : 260)

    // Detect Windows platform (same pattern as TitleBar)
    const isWindows = useMemo(() => {
        return navigator.platform.toLowerCase().includes('win')
    }, [])

    // Track window maximize state for resize handles
    const [isMaximized, setIsMaximized] = useState(false)

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
            {/* Single continuous glass panel spanning full height — eliminates seam between titlebar and sidebar */}
            {frostedSidebar && isDashboardRoute && sidebarWidthPx > 0 && (
                <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${sidebarWidthPx}px`,
                    background: 'linear-gradient(180deg, rgba(10, 10, 14, 0.72) 0%, rgba(6, 6, 10, 0.68) 100%)',
                    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: 'inset -1px 0 0 rgba(255, 255, 255, 0.04)',
                    transition: 'width 0.2s ease',
                    zIndex: 0,
                    pointerEvents: 'none',
                    boxSizing: 'border-box'
                }}>
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: NOISE_SVG,
                        backgroundSize: '200px 200px',
                        opacity: 0.09,
                        mixBlendMode: 'overlay' as const,
                        pointerEvents: 'none' as const
                    }} />
                </div>
            )}
            <TitleBar />
            <div className="app-content" style={{
                backgroundColor: frostedSidebar ? 'transparent' : undefined,
                borderTop: 'none'
            }}>
                <Outlet />
            </div>
            {/* Render CSS-based resize handles when frosted mode is active on Windows */}
            {frostedSidebar && isWindows && (
                <ResizeHandles disabled={isMaximized} />
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

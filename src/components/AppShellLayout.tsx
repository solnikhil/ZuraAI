import React, { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { AppShellProvider } from '../contexts/AppShellContext'
import { useSettingsUI } from '../contexts/SettingsUIContext'
import TitleBar from './TitleBar'

function AppShellContent() {
    const navigate = useNavigate()
    const { settingsUI } = useSettingsUI()
    const { frostedSidebar } = settingsUI

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
            <TitleBar />
            <div className="app-content" style={{
                backgroundColor: frostedSidebar ? 'transparent' : undefined,
                borderTop: frostedSidebar ? 'none' : undefined,
                marginTop: frostedSidebar ? '-2px' : undefined
            }}>
                <Outlet />
            </div>
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

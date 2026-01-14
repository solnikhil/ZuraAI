import React, { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { AppShellProvider } from '../contexts/AppShellContext'
import TitleBar from './TitleBar'

export default function AppShellLayout() {
    const navigate = useNavigate()

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
        <AppShellProvider>
            <div className="app-frame">
                <TitleBar />
                <div className="app-content">
                    <Outlet />
                </div>
            </div>
        </AppShellProvider>
    )
}

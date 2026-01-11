import React from 'react'
import { Outlet } from 'react-router-dom'
import { AppShellProvider } from '../contexts/AppShellContext'
import TitleBar from './TitleBar'

export default function AppShellLayout() {
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

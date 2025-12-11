import React, { useState } from 'react'
import Sidebar from './Sidebar'
import ChatArea from './ChatArea'
import Settings from '../Settings'

export default function DashboardLayout() {
    const [showSettings, setShowSettings] = useState(false)

    return (
        <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
            <Sidebar onOpenSettings={() => setShowSettings(true)} />

            {/* Main Content Area - either ChatArea or Settings */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {showSettings ? (
                    <Settings onClose={() => setShowSettings(false)} />
                ) : (
                    <ChatArea />
                )}
            </div>
        </div>
    )
}

import React, { useState, useCallback } from 'react'
import Sidebar from './Sidebar'
import ChatArea from './ChatArea'
import Settings from '../Settings'
import { useSettings } from '../../contexts/SettingsContext'


export default function DashboardLayout() {
    const [view, setView] = useState<'chat' | 'settings'>('chat')
    const [activeSettingsSection, setActiveSettingsSection] = useState('usage')
    const [hasUnsavedSettings, setHasUnsavedSettings] = useState(false)
    const [showUnsavedWarning, setShowUnsavedWarning] = useState(false)
    const { settings } = useSettings()

    // This callback is passed to Settings to track unsaved changes
    const handleUnsavedChange = useCallback((hasChanges: boolean) => {
        setHasUnsavedSettings(hasChanges)
    }, [])

    // This is called when trying to navigate away with unsaved changes
    const triggerWarning = useCallback(() => {
        setShowUnsavedWarning(true)
        setTimeout(() => setShowUnsavedWarning(false), 600)
    }, [])

    // Wrapper for navigation that checks for unsaved changes
    const handleNavigate = useCallback((action: () => void) => {
        if (hasUnsavedSettings) {
            triggerWarning()
            return false // blocked
        }
        action()
        return true // allowed
    }, [hasUnsavedSettings, triggerWarning])

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', backgroundColor: '#14120B' }}>
            <Sidebar
                view={view}
                onOpenSettings={() => setView('settings')}
                onCloseSettings={() => handleNavigate(() => setView('chat'))}
                activeSettingsSection={activeSettingsSection}
                onNavigateSettings={(section) => handleNavigate(() => setActiveSettingsSection(section))}
                hasUnsavedSettings={hasUnsavedSettings}
            />

            {/* Main Content Area - either ChatArea or Settings */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {view === 'settings' ? (
                    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, animation: 'fadeIn 0.3s ease' }}>
                        <Settings
                            activeSection={activeSettingsSection}
                            onUnsavedChange={handleUnsavedChange}
                            showWarning={showUnsavedWarning}
                        />
                    </div>
                ) : (
                    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, animation: 'fadeIn 0.3s ease' }}>
                        <ChatArea />
                    </div>
                )}
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    )
}

import React, { useState, useCallback, lazy, Suspense } from 'react'
import Sidebar from './Sidebar'
import ChatArea from './ChatArea'
import { useAppShell } from '../../contexts/AppShellContext'

// Lazy load Settings component for memory optimization
// Only loads when user actually opens Settings
const Settings = lazy(() => import('../Settings').then(m => ({ default: m.default })))

function SettingsLoadingFallback() {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#999'
        }}>
            Loading Settings...
        </div>
    )
}

export default function DashboardLayout() {
    const {
        dashboardView: view,
        setDashboardView: setView,
        activeSettingsSection,
        setActiveSettingsSection,
        hasUnsavedSettings,
        setHasUnsavedSettings
    } = useAppShell()
    const [showUnsavedWarning, setShowUnsavedWarning] = useState(false)

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
        <div style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            position: 'relative'
        }}>
            <Sidebar
                view={view}
                onOpenSettings={() => setView('settings')}
                onCloseSettings={() => handleNavigate(() => setView('chat'))}
                onNavigateToChat={() => setView('chat')}
                activeSettingsSection={activeSettingsSection}
                onNavigateSettings={(section) => handleNavigate(() => setActiveSettingsSection(section))}
                hasUnsavedSettings={hasUnsavedSettings}
            />

            {/* Main Content Area - ChatArea or Settings - always has solid background */}
            <div style={{ 
                flex: 1, 
                position: 'relative', 
                overflow: 'hidden',
                backgroundColor: 'var(--theme-background)', // Always solid to contrast with frosted sidebar
                zIndex: 1
            }}>
                {view === 'settings' ? (
                    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, animation: 'fadeIn 0.3s ease' }}>
                        <Suspense fallback={<SettingsLoadingFallback />}>
                            <Settings
                                activeSection={activeSettingsSection}
                                onUnsavedChange={handleUnsavedChange}
                                showWarning={showUnsavedWarning}
                            />
                        </Suspense>
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

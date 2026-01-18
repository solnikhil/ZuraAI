import React, { useState, useCallback, lazy, Suspense } from 'react'
import Sidebar from './Sidebar'
import ChatArea from './ChatArea'
import { useAppShell } from '../../contexts/AppShellContext'

// Lazy load Settings component for memory optimization
// Only loads when user actually opens Settings
const Settings = lazy(() => import('../Settings').then(m => ({ default: m.default })))

// Lazy load PDFChatLayout component for memory optimization
// Only loads when user navigates to PDF chat
const PDFChatLayout = lazy(() => import('../PDFChat/PDFChatLayout').then(m => ({ default: m.PDFChatLayout || m.default })))

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

function PDFChatLoadingFallback() {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#999'
        }}>
            Loading PDF Chat...
        </div>
    )
}

export default function DashboardLayout() {
    const { dashboardView: view, setDashboardView: setView, activeSettingsSection, setActiveSettingsSection, hasUnsavedSettings, setHasUnsavedSettings } = useAppShell()
    const [showUnsavedWarning, setShowUnsavedWarning] = useState(false)
    const [pdfFilePath, setPdfFilePath] = useState<string | null>(null)
    const [activePDFSessionId, setActivePDFSessionId] = useState<string | null>(null)

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

    // Handle loading a PDF from the sidebar (starred PDFs)
    const handleLoadRecentPDF = useCallback((filePath: string) => {
        console.log('[DashboardLayout] Loading recent PDF:', filePath)
        setPdfFilePath(filePath)
        setView('pdf')
    }, [setView])

    // Handle switching PDF session from the sidebar
    const handleSwitchPDFSession = useCallback((sessionId: string) => {
        console.log('[DashboardLayout] Switching to PDF session:', sessionId)
        setActivePDFSessionId(sessionId)
        setView('pdf')
    }, [setView])

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', backgroundColor: 'var(--theme-background)' }}>
            <Sidebar
                view={view}
                onOpenSettings={() => setView('settings')}
                onCloseSettings={() => handleNavigate(() => setView('chat'))}
                onNavigateToPDF={() => handleNavigate(() => setView('pdf'))}
                onNavigateToChat={() => setView('chat')}
                onLoadRecentPDF={handleLoadRecentPDF}
                onSwitchPDFSession={handleSwitchPDFSession}
                activePDFSessionId={activePDFSessionId}
                activeSettingsSection={activeSettingsSection}
                onNavigateSettings={(section) => handleNavigate(() => setActiveSettingsSection(section))}
                hasUnsavedSettings={hasUnsavedSettings}
            />

            {/* Main Content Area - ChatArea, PDFChatLayout, or Settings */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
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
                ) : view === 'pdf' ? (
                    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, animation: 'fadeIn 0.3s ease' }}>
                        <Suspense fallback={<PDFChatLoadingFallback />}>
                            <PDFChatLayout 
                                initialDocumentPath={pdfFilePath || undefined}
                                sessionId={activePDFSessionId || undefined}
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

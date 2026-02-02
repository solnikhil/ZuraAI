import React, { lazy, Suspense } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import Chat from './components/Chat'
import DashboardLayout from './components/Dashboard/Layout'
import AppShellLayout from './components/AppShellLayout'
import { SettingsProvider } from './contexts/SettingsContext'
import { ChatHistoryProvider } from './contexts/ChatHistoryContext'
import { PDFDocumentProvider } from './contexts/PDFDocumentContext'
import { ToastProvider, ErrorBoundary } from './components/shared'

// Lazy load PDFChatLayout for memory optimization
// Only loads when user navigates to PDF chat route
const PDFChatLayout = lazy(() => import('./components/PDFChat/PDFChatLayout'))

// Lazy load Settings component for bundle optimization
// Only loads when user navigates to settings route
// Requirements: 2.2
const Settings = lazy(() => import('./components/Settings/Settings'))

// Lazy load Overlay component for bundle optimization
// Only loads when overlay window is opened
// Requirements: 2.3
const Overlay = lazy(() => import('./components/Overlay'))

// Simple wrapper to handle "Chat" legacy route if needed, or redirect
function LegacyChatWrapper() {
    return <Chat />
}

// Loading fallback for PDF Chat route
function PDFChatLoadingFallback() {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            color: 'var(--theme-text-muted)',
            backgroundColor: 'var(--theme-background)'
        }}>
            Loading PDF Chat...
        </div>
    )
}

// Loading fallback for Settings route
// Requirements: 2.2
function SettingsLoadingFallback() {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            color: 'var(--theme-text-muted)',
            backgroundColor: 'var(--theme-background)'
        }}>
            Loading Settings...
        </div>
    )
}

// Loading fallback for Overlay route
// Requirements: 2.3
function OverlayLoadingFallback() {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            width: '100vw',
            color: 'rgba(255, 255, 255, 0.7)',
            backgroundColor: 'transparent'
        }}>
            Loading...
        </div>
    )
}

function App() {
    return (
        <ErrorBoundary>
            <ToastProvider>
                <SettingsProvider>
                    <ChatHistoryProvider>
                        <PDFDocumentProvider>
                            <Router>
                                <Routes>
                                    <Route element={<AppShellLayout />}>
                                        <Route path="/" element={<DashboardLayout />} />
                                        <Route path="/dashboard" element={<DashboardLayout />} />
                                        <Route path="/settings" element={
                                            <Suspense fallback={<SettingsLoadingFallback />}>
                                                <Settings />
                                            </Suspense>
                                        } />
                                        {/* PDF Chat route - direct access to PDF chat view */}
                                        <Route path="/pdf-chat" element={
                                            <Suspense fallback={<PDFChatLoadingFallback />}>
                                                <PDFChatLayout />
                                            </Suspense>
                                        } />
                                        {/* Legacy chat view now uses DashboardLayout to include sidebar */}
                                        <Route path="/chat" element={<DashboardLayout />} />
                                    </Route>
                                    <Route path="/overlay" element={
                                        <Suspense fallback={<OverlayLoadingFallback />}>
                                            <Overlay />
                                        </Suspense>
                                    } />
                                </Routes>
                            </Router>
                        </PDFDocumentProvider>
                    </ChatHistoryProvider>
                </SettingsProvider>
            </ToastProvider>
        </ErrorBoundary>
    )
}

export default App


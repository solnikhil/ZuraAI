import React, { lazy, Suspense } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import Chat from './components/Chat'
import Overlay from './components/Overlay'
import Settings from './components/Settings/Settings'
import DashboardLayout from './components/Dashboard/Layout'
import AppShellLayout from './components/AppShellLayout'
import { SettingsProvider } from './contexts/SettingsContext'
import { ChatHistoryProvider } from './contexts/ChatHistoryContext'
import { ToastProvider, ErrorBoundary } from './components/shared'

// Lazy load PDFChatLayout for memory optimization
// Only loads when user navigates to PDF chat route
const PDFChatLayout = lazy(() => import('./components/PDFChat/PDFChatLayout'))

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

function App() {
    return (
        <ErrorBoundary>
            <ToastProvider>
                <SettingsProvider>
                    <ChatHistoryProvider>
                        <Router>
                            <Routes>
                                <Route element={<AppShellLayout />}>
                                    <Route path="/" element={<DashboardLayout />} />
                                    <Route path="/dashboard" element={<DashboardLayout />} />
                                    <Route path="/settings" element={<Settings />} />
                                    {/* PDF Chat route - direct access to PDF chat view */}
                                    <Route path="/pdf-chat" element={
                                        <Suspense fallback={<PDFChatLoadingFallback />}>
                                            <PDFChatLayout />
                                        </Suspense>
                                    } />
                                    {/* Legacy chat view now uses DashboardLayout to include sidebar */}
                                    <Route path="/chat" element={<DashboardLayout />} />
                                </Route>
                                <Route path="/overlay" element={<Overlay />} />
                            </Routes>
                        </Router>
                    </ChatHistoryProvider>
                </SettingsProvider>
            </ToastProvider>
        </ErrorBoundary>
    )
}

export default App


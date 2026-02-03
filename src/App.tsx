import React, { lazy, Suspense } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import DashboardLayout from './components/Dashboard/Layout'
import AppShellLayout from './components/AppShellLayout'
import { SettingsProvider } from './contexts/SettingsContext'
import { ChatHistoryProvider } from './contexts/ChatHistoryContext'
import { StreamingProvider } from './contexts/StreamingContext'
import { ToastProvider, ErrorBoundary } from './components/shared'

// Lazy load LazyPDFChatWrapper for memory optimization
// This wrapper includes PDFDocumentProvider, ensuring the context is only
// initialized when the /pdf-chat route is accessed
// Requirements: 8.4 - PDFDocumentContext SHALL be loaded lazily only when PDF chat route is accessed
// Property 31: For any route other than /pdf-chat, the PDFDocumentContext SHALL not be initialized
const LazyPDFChatWrapper = lazy(() => import('./components/PDFChat/LazyPDFChatWrapper'))

// Lazy load Settings component for bundle optimization
// Only loads when user navigates to settings route
// Requirements: 2.2
const Settings = lazy(() => import('./components/Settings/Settings'))

// Lazy load Overlay component for bundle optimization
// Only loads when overlay window is opened
// Requirements: 2.3
const Overlay = lazy(() => import('./components/Overlay'))

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
                        <StreamingProvider>
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
                                        {/* PDF Chat route - lazy loads PDFDocumentContext only for this route
                                            Requirements: 8.4 - PDFDocumentContext SHALL be loaded lazily
                                            Property 31: For any route other than /pdf-chat, the PDFDocumentContext SHALL not be initialized */}
                                        <Route path="/pdf-chat" element={
                                            <Suspense fallback={<PDFChatLoadingFallback />}>
                                                <LazyPDFChatWrapper />
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
                        </StreamingProvider>
                    </ChatHistoryProvider>
                </SettingsProvider>
            </ToastProvider>
        </ErrorBoundary>
    )
}

export default App


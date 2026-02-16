import { lazy, Suspense } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import DashboardLayout from './components/Dashboard/Layout'
import AppShellLayout from './components/AppShellLayout'
import { SettingsProvider } from './contexts/SettingsContext'
import { ChatHistoryProvider } from './contexts/ChatHistoryContext'
import { StreamingProvider } from './contexts/StreamingContext'
import { ToastProvider, ErrorBoundary } from './components/shared'

// Lazy load Settings component for bundle optimization
// Only loads when user navigates to settings route
// Requirements: 2.2
const Settings = lazy(() => import('./components/Settings/Settings'))

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
                                        {/* Legacy chat view now uses DashboardLayout to include sidebar */}
                                        <Route path="/chat" element={<DashboardLayout />} />
                                    </Route>
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


import React from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import Chat from './components/Chat'
import Overlay from './components/Overlay'
import Settings from './components/Settings/Settings'
import DashboardLayout from './components/Dashboard/Layout'
import AppShellLayout from './components/AppShellLayout'
import { SettingsProvider } from './contexts/SettingsContext'
import { ChatHistoryProvider } from './contexts/ChatHistoryContext'
import { ToastProvider, ErrorBoundary } from './components/shared'

// Simple wrapper to handle "Chat" legacy route if needed, or redirect
function LegacyChatWrapper() {
    return <Chat />
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


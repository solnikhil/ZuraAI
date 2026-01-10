import React from 'react'
import { HashRouter as Router, Routes, Route, Outlet } from 'react-router-dom'
import Chat from './components/Chat'
import Overlay from './components/Overlay'
import Settings from './components/Settings'
import DashboardLayout from './components/Dashboard/Layout'
import { SettingsProvider } from './contexts/SettingsContext'
import { ChatHistoryProvider } from './contexts/ChatHistoryContext'
import { ToastProvider } from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import TitleBar from './components/TitleBar'

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
                                <Route
                                    element={(
                                        <div className="app-frame">
                                            <TitleBar />
                                            <div className="app-content">
                                                <Outlet />
                                            </div>
                                        </div>
                                    )}
                                >
                                    <Route path="/" element={<DashboardLayout />} />
                                    <Route path="/dashboard" element={<DashboardLayout />} />
                                    <Route path="/settings" element={<Settings />} />
                                    {/* Legacy chat view if accessed directly */}
                                    <Route path="/chat" element={<LegacyChatWrapper />} />
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


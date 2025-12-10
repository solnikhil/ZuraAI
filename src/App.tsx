import React from 'react'
import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import Chat from './components/Chat'
import Overlay from './components/Overlay'
import Settings from './components/Settings'
import DashboardLayout from './components/Dashboard/Layout'
import { SettingsProvider } from './contexts/SettingsContext'
import { ChatHistoryProvider } from './contexts/ChatHistoryContext'

// Simple wrapper to handle "Chat" legacy route if needed, or redirect
function LegacyChatWrapper() {
    return <Chat />
}

function App() {
    return (
        <SettingsProvider>
            <ChatHistoryProvider>
                <Router>
                    <Routes>
                        <Route path="/" element={<DashboardLayout />} />
                        <Route path="/dashboard" element={<DashboardLayout />} />
                        <Route path="/overlay" element={<Overlay />} />
                        <Route path="/settings" element={<Settings />} />
                        {/* Legacy chat view if accessed directly */}
                        <Route path="/chat" element={<LegacyChatWrapper />} />
                    </Routes>
                </Router>
            </ChatHistoryProvider>
        </SettingsProvider>
    )
}

export default App


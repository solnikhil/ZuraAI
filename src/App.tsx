import React, { useState, useEffect } from 'react'
import Chat from './components/Chat'
import Overlay from './components/Overlay'
import Settings from './components/Settings'
import { SettingsProvider } from './contexts/SettingsContext'

function AppContent() {
    const [route, setRoute] = useState(window.location.hash)

    useEffect(() => {
        const handleHashChange = () => {
            setRoute(window.location.hash)
        }
        window.addEventListener('hashchange', handleHashChange)
        return () => window.removeEventListener('hashchange', handleHashChange)
    }, [])

    if (route === '#overlay') {
        return <Overlay />
    }

    if (route === '#settings') {
        return <Settings />
    }

    return <Chat />
}

function App() {
    return (
        <SettingsProvider>
            <AppContent />
        </SettingsProvider>
    )
}

export default App

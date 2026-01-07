import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { getDefaultTheme, getThemeById } from './themes/themeRegistry'
import { applyThemeToDocument } from './themes/themeUtils'
import './index.css'

const savedSettings = localStorage.getItem('zura-settings')
if (savedSettings) {
    try {
        const parsed = JSON.parse(savedSettings) as { activeTheme?: string }
        const theme = parsed.activeTheme ? getThemeById(parsed.activeTheme) : getDefaultTheme()
        applyThemeToDocument(theme || getDefaultTheme())
    } catch {
        applyThemeToDocument(getDefaultTheme())
    }
} else {
    applyThemeToDocument(getDefaultTheme())
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <App />
)

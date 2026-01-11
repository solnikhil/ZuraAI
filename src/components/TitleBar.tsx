import React, { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import { Settings, useSettings } from '../contexts/SettingsContext'
import { useAppShell } from '../contexts/AppShellContext'
import { Eye, EyeOff, PanelLeft } from './icons'
import TitleBarCommandBar from './TitleBarCommandBar'
import './TitleBar.css'

const SETTINGS_SECTION_LABELS: Record<string, string> = {
    usage: 'Usage',
    models: 'Models',
    themes: 'Themes',
    preferences: 'API Keys',
    tools: 'Tools',
}

function getModelDisplayName(settings: Settings): string {
    const allModels: Array<{ code: string; displayName: string }> = [
        ...(settings.ollamaModels || []),
        ...(settings.perplexityModels || []),
        ...(settings.configuredModels || []),
        ...(settings.geminiModels || []),
        ...(settings.groqModels || []),
    ]

    const currentModel = allModels.find(m => m.code === settings.aiModel)
    return currentModel?.displayName || settings.aiModel?.split('/').pop() || 'Auto'
}

export default function TitleBar() {
    const location = useLocation()
    const { settings } = useSettings()
    const { sessions, currentSessionId } = useChatHistory()
    const {
        dashboardView,
        activeSettingsSection,
        hasUnsavedSettings,
        sidebarCollapsed,
        toggleSidebarCollapsed,
        sidebarHidden,
        toggleSidebarHidden,
    } = useAppShell()

    const isDashboardRoute = location.pathname === '/' || location.pathname === '/dashboard'
    const isSettingsRoute = location.pathname === '/settings'
    const isLegacyChatRoute = location.pathname === '/chat'

    const currentSession = useMemo(() => {
        return sessions.find(s => s.id === currentSessionId)
    }, [sessions, currentSessionId])

    const modelDisplayName = useMemo(() => getModelDisplayName(settings), [settings])

    const centerTitle = useMemo(() => {
        if (isLegacyChatRoute) return 'Zura Chat'

        if (isSettingsRoute) {
            return 'Settings'
        }

        if (isDashboardRoute) {
            if (dashboardView === 'settings') {
                const label = SETTINGS_SECTION_LABELS[activeSettingsSection] || 'Settings'
                return `Settings — ${label}`
            }
            return currentSession?.title || 'New Conversation'
        }

        return ''
    }, [activeSettingsSection, currentSession?.title, dashboardView, isDashboardRoute, isLegacyChatRoute, isSettingsRoute])

    useEffect(() => {
        const titleParts = [centerTitle]
        if (settings.titleBarShowModel !== false) {
            titleParts.push(modelDisplayName)
        }
        document.title = titleParts.filter(Boolean).join(' — ')
    }, [centerTitle, modelDisplayName, settings.titleBarShowModel])

    const density = settings.titleBarDensity || 'comfortable'
    const showAppName = settings.titleBarShowAppName !== false
    const showTitle = settings.titleBarShowChatTitle !== false
    const showModel = settings.titleBarShowModel !== false

    return (
        <div
            className={[
                'app-titlebar',
                density === 'compact' ? 'app-titlebar--compact' : null,
            ].filter(Boolean).join(' ')}
        >
            <div className="app-titlebar__left">
                {isDashboardRoute && (
                    <div className="app-titlebar__controls no-drag">
                        <button
                            type="button"
                            className="app-titlebar__icon-btn"
                            onClick={toggleSidebarHidden}
                            aria-label={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
                            title={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
                        >
                            {sidebarHidden ? <Eye size={18} /> : <EyeOff size={18} />}
                        </button>
                        <button
                            type="button"
                            className="app-titlebar__icon-btn"
                            onClick={toggleSidebarCollapsed}
                            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            <PanelLeft size={18} />
                        </button>
                    </div>
                )}
                {showAppName && (
                    <img
                        className="app-titlebar__logo"
                        src="/sidebar-logo.png"
                        alt="Zura"
                        draggable={false}
                    />
                )}
                {hasUnsavedSettings && dashboardView === 'settings' && (
                    <span className="app-titlebar__unsaved" title="Unsaved changes" />
                )}
            </div>

            <div className="app-titlebar__center">
                <TitleBarCommandBar idlePlaceholder={showTitle ? centerTitle : undefined} />
            </div>

            <div className="app-titlebar__right">
                {showModel && (
                    <span className="app-titlebar__model no-drag" title={settings.aiModel}>
                        {modelDisplayName}
                    </span>
                )}
            </div>
        </div>
    )
}

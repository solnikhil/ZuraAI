import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import { Settings, useSettings } from '../contexts/SettingsContext'
import { useAppShell } from '../contexts/AppShellContext'
import { useSettingsUI } from '../contexts/SettingsUIContext'
import { PanelLeft } from './icons'
import { EyeIcon, EyeOffIcon } from './icons'
import { useToast } from './shared/Toast'
import TitleBarCommandBar from './TitleBarCommandBar'
import WindowControlButtons from './WindowControlButtons'
import './TitleBar.css'

const SETTINGS_SECTION_LABELS: Record<string, string> = {
    usage: 'Usage',
    models: 'Models',
    themes: 'Appearance',
    preferences: 'API Keys',
    tools: 'Tools',
    commandbar: 'Command Bar',
    systemprompt: 'System Prompt',
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
    const navigate = useNavigate()
    const { settings } = useSettings()
    const { sessions, currentSessionId } = useChatHistory()
    const {
        dashboardView,
        setDashboardView,
        activeSettingsSection,
        hasUnsavedSettings,
        sidebarCollapsed,
        toggleSidebarCollapsed,
        sidebarHidden,
        toggleSidebarHidden,
    } = useAppShell()
    const { settingsUI } = useSettingsUI()
    const { frostedSidebar } = settingsUI
    const { showToast } = useToast()

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
    const showTitle = settings.titleBarShowChatTitle !== false
    const showModel = settings.titleBarShowModel !== false
    const sidebarWidthPx = sidebarHidden ? 0 : (sidebarCollapsed ? 60 : 260)

    const handleDashboardTabChange = (nextView: 'chat') => {
        if (dashboardView === nextView) return

        if (hasUnsavedSettings && dashboardView === 'settings') {
            showToast('You have unsaved settings changes', 'warning')
            return
        }

        if (nextView === 'chat') {
            setDashboardView('chat')
            if (!isDashboardRoute) {
                navigate('/dashboard')
            }
            return
        }
    }

    const showDashboardTabs = false

    // Detect macOS platform
    const isMacOS = useMemo(() => {
        return navigator.platform.toLowerCase().includes('mac')
    }, [])

    // Window maximize state
    const [isMaximized, setIsMaximized] = useState(false)

    useEffect(() => {
        if (!window.windowControls) return
        // Check initial state
        window.windowControls.isMaximized().then(setIsMaximized).catch(() => {})
        // Listen for state changes
        const cleanup = window.windowControls.onWindowState((state) => {
            setIsMaximized(state.isMaximized)
        })
        return cleanup
    }, [])

    const handleToggleMaximize = useCallback(() => {
        window.windowControls?.toggleMaximize().then(() => {
            // Re-check state after toggle
            window.windowControls?.isMaximized().then(setIsMaximized).catch(() => {})
        }).catch(() => {})
    }, [])

    const handleMinimize = useCallback(() => {
        window.windowControls?.minimize().catch(() => {})
    }, [])

    const handleClose = useCallback(() => {
        window.windowControls?.close().catch(() => {})
    }, [])

    const handleTitleBarDoubleClick = useCallback((e: React.MouseEvent) => {
        // Only trigger on the titlebar itself, not on buttons/controls
        if ((e.target as HTMLElement).closest('.no-drag')) return
        handleToggleMaximize()
    }, [handleToggleMaximize])

    return (
        <div
            className={[
                'app-titlebar',
                density === 'compact' ? 'app-titlebar--compact' : null,
                isMacOS ? 'app-titlebar--macos' : null,
                !isMacOS ? 'app-titlebar--custom-controls' : null,
                frostedSidebar ? 'app-titlebar--frosted' : null,
            ].filter(Boolean).join(' ')}
            style={{}}
            onDoubleClick={handleTitleBarDoubleClick}
        >
            {/* Solid background for the content (right) side of the titlebar in frosted mode */}
            {frostedSidebar && isDashboardRoute && (
                <div
                    className="app-titlebar__content-bg"
                    style={{
                        left: `${sidebarWidthPx}px`,
                    }}
                />
            )}

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
                            {sidebarHidden ? <EyeIcon size={18} /> : <EyeOffIcon size={18} />}
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
                {hasUnsavedSettings && dashboardView === 'settings' && (
                    <span className="app-titlebar__unsaved" title="Unsaved changes" />
                )}
            </div>

            <div className="app-titlebar__middle">
                {/* Tab group removed - only chat view remains */}
            </div>

            <div className="app-titlebar__center">
                <TitleBarCommandBar idlePlaceholder={showTitle ? centerTitle : undefined} />
            </div>

            <div className="app-titlebar__right">
                {showModel && dashboardView !== 'settings' && (
                    <span className="app-titlebar__model no-drag" title={settings.aiModel}>
                        {modelDisplayName}
                    </span>
                )}
                {/* Windows: always render custom window controls since native overlay is disabled */}
                {!isMacOS && (
                    <WindowControlButtons
                        isMaximized={isMaximized}
                        onMinimize={handleMinimize}
                        onToggleMaximize={handleToggleMaximize}
                        onClose={handleClose}
                    />
                )}
            </div>
        </div>
    )
}

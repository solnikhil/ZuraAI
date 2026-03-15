import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import { Settings, useSettings } from '../contexts/SettingsContext'
import { useAppShell } from '../contexts/AppShellContext'
import { useSettingsUI } from '../contexts/SettingsUIContext'
import { SETTINGS_SECTION_MAP, type SettingsSectionId } from '../constants/settingsSections'
import { SIDEBAR_COLLAPSED_WIDTH_PX } from '../constants/sidebar'
import { ArrowLeft, EyeIcon, EyeOffIcon, SettingsIcon } from './icons'
import TitleBarInfoMenu from './TitleBarInfoMenu'
import WindowControlButtons from './WindowControlButtons'
import './TitleBar.css'

function getModelDisplayName(settings: Settings): string {
    const allModels: Array<{ code: string; displayName: string }> = [
        ...(settings.ollamaModels || []),
        ...(settings.perplexityModels || []),
        ...(settings.configuredModels || []),
        ...(settings.groqModels || []),
        ...(settings.alibabaModels || []),
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
        setDashboardView,
        activeSettingsSection,
        hasUnsavedSettings,
        sidebarCollapsed,
        sidebarWidth,
        sidebarHidden,
        toggleSidebarHidden,
        isResizingSidebar,
    } = useAppShell()
    const { settingsUI } = useSettingsUI()
    const { frostedSidebar } = settingsUI

    const isDashboardRoute = location.pathname === '/' || location.pathname === '/dashboard'
    const isSettingsRoute = location.pathname === '/settings'
    const isLegacyChatRoute = location.pathname === '/chat'
    const hasSidebar = isDashboardRoute || isLegacyChatRoute

    const currentSession = useMemo(() => {
        return sessions.find(s => s.id === currentSessionId)
    }, [sessions, currentSessionId])

    const modelDisplayName = useMemo(() => getModelDisplayName(settings), [settings])

    const centerTitle = useMemo(() => {
        if (isLegacyChatRoute) return 'ZuraAI Chat'

        if (isSettingsRoute) {
            return 'Settings'
        }

        if (isDashboardRoute) {
            if (dashboardView === 'settings') {
                const label = SETTINGS_SECTION_MAP[activeSettingsSection as SettingsSectionId]?.navLabel || 'Settings'
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
    const isSettingsView = dashboardView === 'settings'
    const settingsButtonDisabled = isSettingsView && hasUnsavedSettings
    const sidebarWidthPx = sidebarHidden
        ? 0
        : (sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH_PX : sidebarWidth)

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

    const handleSettingsButtonClick = useCallback(() => {
        if (isSettingsView) {
            if (!hasUnsavedSettings) {
                setDashboardView('chat')
            }
            return
        }

        setDashboardView('settings')
    }, [hasUnsavedSettings, isSettingsView, setDashboardView])

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
            {/* Sidebar region overlay: glass in frosted mode, solid in non-frosted mode */}
            {frostedSidebar && hasSidebar && sidebarWidthPx > 0 && (
                <div
                    className="app-titlebar__sidebar-glass"
                    style={{
                        width: `${sidebarWidthPx}px`,
                        willChange: isResizingSidebar ? 'width' : 'auto',
                        transition: isResizingSidebar ? 'none' : undefined,
                    }}
                />
            )}
            {/* Content-side titlebar background should always match the main content panel */}
            {hasSidebar && (
                <div
                    className="app-titlebar__content-bg"
                    style={{
                        left: `${sidebarWidthPx}px`,
                        willChange: isResizingSidebar ? 'left' : 'auto',
                        transition: isResizingSidebar ? 'none' : undefined,
                    }}
                />
            )}

            {/* Non-frosted mode: solid surface overlay so titlebar above sidebar matches sidebar color */}
            {!frostedSidebar && hasSidebar && sidebarWidthPx > 0 && (
                <div
                    className="app-titlebar__sidebar-solid"
                    style={{
                        width: `${sidebarWidthPx}px`,
                        willChange: isResizingSidebar ? 'width' : 'auto',
                        transition: isResizingSidebar ? 'none' : undefined,
                    }}
                />
            )}

            <div className="app-titlebar__left">
                {hasSidebar && (
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
                            className={[
                                'app-titlebar__icon-btn',
                                isSettingsView ? 'app-titlebar__icon-btn--back' : 'app-titlebar__icon-btn--settings',
                                settingsButtonDisabled ? 'app-titlebar__icon-btn--disabled' : null,
                            ].filter(Boolean).join(' ')}
                            onClick={handleSettingsButtonClick}
                            aria-label={isSettingsView ? 'Back to chat' : 'Open settings'}
                            title={
                                settingsButtonDisabled
                                    ? 'Save or discard changes to go back'
                                    : isSettingsView
                                        ? 'Back to chat'
                                        : 'Open settings'
                            }
                            disabled={settingsButtonDisabled}
                        >
                            {isSettingsView ? <ArrowLeft size={16} /> : <SettingsIcon size={16} />}
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
            </div>

            <div className="app-titlebar__right">
                <TitleBarInfoMenu />
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

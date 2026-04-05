import React, { useCallback, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import { Settings, useSettings } from '../contexts/SettingsContext'
import { useAppShell } from '../contexts/AppShellContext'
import { SETTINGS_SECTION_MAP, type SettingsSectionId } from '../constants/settingsSections'
import { SIDEBAR_COLLAPSED_WIDTH_PX } from '../constants/sidebar'
import TitleBarSidebarControls from './TitleBarSidebarControls'
import TitleBarWindowActions from './TitleBarWindowActions'
import './TitleBar.css'
import { useShellRouteState } from './shell/useShellRouteState'
import { useWindowMaximizeState } from './shell/useWindowMaximizeState'

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
    const { isDashboardRoute, isSettingsRoute, isLegacyChatRoute, hasSidebar } = useShellRouteState(location.pathname)

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
    const { isMaximized, setIsMaximized } = useWindowMaximizeState()

    const handleTitleBarDoubleClick = useCallback((e: React.MouseEvent) => {
        // Only trigger on the titlebar itself, not on buttons/controls
        if ((e.target as HTMLElement).closest('.no-drag')) return
        window.windowControls?.toggleMaximize().catch(() => {})
    }, [])

    return (
        <div
            className={[
                'app-titlebar',
                density === 'compact' ? 'app-titlebar--compact' : null,
                hasSidebar ? 'app-titlebar--with-sidebar' : null,
                isMacOS ? 'app-titlebar--macos' : null,
                !isMacOS ? 'app-titlebar--custom-controls' : null,
            ].filter(Boolean).join(' ')}
            style={{}}
            onDoubleClick={handleTitleBarDoubleClick}
        >
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

            {hasSidebar && sidebarWidthPx > 0 && (
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
                <TitleBarSidebarControls
                    hasSidebar={hasSidebar}
                    hasUnsavedSettings={hasUnsavedSettings}
                    isSettingsView={isSettingsView}
                    settingsButtonDisabled={settingsButtonDisabled}
                    sidebarHidden={sidebarHidden}
                    toggleSidebarHidden={toggleSidebarHidden}
                    setDashboardView={setDashboardView}
                />
            </div>

            <div className="app-titlebar__middle">
                {/* Tab group removed - only chat view remains */}
            </div>

            <div className="app-titlebar__center">
            </div>

            <div className="app-titlebar__right">
                <TitleBarWindowActions
                    isMacOS={isMacOS}
                    isMaximized={isMaximized}
                    setIsMaximized={setIsMaximized}
                />
            </div>
        </div>
    )
}

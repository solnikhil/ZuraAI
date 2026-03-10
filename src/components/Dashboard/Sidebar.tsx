import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
    ChartNoAxesCombined, Cloud,
    Paintbrush, FlaskConical, FileText, Wrench
} from '../icons'

import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useAppShell } from '../../contexts/AppShellContext'
import { useSettingsUI } from '../../contexts/SettingsUIContext'
import { SETTINGS_SECTIONS, type SettingsSectionId } from '../../constants/settingsSections'

import SidebarHeader from './Sidebar/SidebarHeader'
import SidebarChatList from './Sidebar/SidebarChatList'
import SidebarSearchOverlay from './Sidebar/SidebarSearchOverlay'
import { groupSessions } from './Sidebar/utils/groupSessions'
import type { ChatRowAction } from './Sidebar/ChatRow'
import { SIDEBAR_COLLAPSED_WIDTH_PX, clampSidebarWidth } from '../../constants/sidebar'
import './Sidebar/Sidebar.css'

interface SidebarProps {
    view: 'chat' | 'settings'
    activeSettingsSection: string
    onNavigateSettings: (section: string) => void
}

export default function Sidebar({ view, activeSettingsSection, onNavigateSettings }: SidebarProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [searchOverlayOpen, setSearchOverlayOpen] = useState(false)
    const { sidebarHidden, sidebarCollapsed, sidebarWidth, setSidebarWidth, setIsResizingSidebar } = useAppShell()
    const {
        sessions,
        folders,
        currentSessionId,
        switchSession,
        deleteSession,
        clearCurrentSession,
        updateSessionTitle,
        pinSession,
        unpinSession,
        duplicateSession: duplicateSessionAction,
        assignFolder,
    } = useChatHistory()
    const { settingsUI } = useSettingsUI()
    const { frostedSidebar, chatSelectedOverlayStyle = 'linear' } = settingsUI
    const userStripPadding = 8

    // Sidebar state
    const [focusIndex, setFocusIndex] = useState(-1)
    const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
    const [isResizing, setIsResizing] = useState(false)
    const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null)
    const resizeRafRef = useRef<number | null>(null)
    // Glassmorphism styles
    const shouldApplyGlass = frostedSidebar && !sidebarHidden

    // Settings navigation items
    const settingsIcons: Record<SettingsSectionId, React.ReactNode> = {
        usage: <ChartNoAxesCombined size={18} />,
        providers: <Cloud size={18} />,
        skills: <Wrench size={18} />,
        themes: <Paintbrush size={18} />,
        systemprompt: <FileText size={18} />,
        experimental: <FlaskConical size={18} />,
    }

    const navItems = SETTINGS_SECTIONS.map((section) => ({
        id: section.id,
        label: section.navLabel,
        icon: settingsIcons[section.id],
    }))

    // Group sessions for sidebar list
    const groupedSessions = useMemo(() =>
        groupSessions(sessions, folders),
        [sessions, folders]
    )

    // Flatten visible sessions for keyboard navigation (pinned + folders + time groups in display order)
    const flatVisibleSessions = useMemo(() => {
        const flat = [
            ...groupedSessions.pinned,
        ]
        for (const folder of folders) {
            const folderSessions = groupedSessions.folders.get(folder.id) || []
            flat.push(...folderSessions)
        }
        flat.push(
            ...groupedSessions.today,
            ...groupedSessions.yesterday,
            ...groupedSessions.previous7Days,
            ...groupedSessions.previous30Days,
            ...groupedSessions.older,
        )
        return flat
    }, [groupedSessions, folders])

    // Clamp focus index when list changes
    useEffect(() => {
        if (focusIndex >= flatVisibleSessions.length) {
            setFocusIndex(Math.max(flatVisibleSessions.length - 1, -1))
        }
    }, [flatVisibleSessions.length, focusIndex])

    // Global Ctrl+N / Cmd+N shortcut (Requirement 2.4)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault()
                clearCurrentSession()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [clearCurrentSession])

    useEffect(() => {
        if (view !== 'chat' && searchOverlayOpen) {
            setSearchOverlayOpen(false)
            setSearchQuery('')
        }
    }, [view, searchOverlayOpen])

    const openSearchOverlay = useCallback(() => {
        setSearchOverlayOpen(true)
    }, [])

    const closeSearchOverlay = useCallback(() => {
        setSearchOverlayOpen(false)
        setSearchQuery('')
    }, [])

    const handleSelectSessionFromSearch = useCallback((sessionId: string) => {
        switchSession(sessionId)
    }, [switchSession])

    // Keyboard navigation handler (Requirements 4.4, 4.5, 4.6, 4.7)
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        const listLength = flatVisibleSessions.length
        if (listLength === 0) return

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault()
                setFocusIndex(prev => Math.min(prev + 1, listLength - 1))
                break
            case 'ArrowUp':
                e.preventDefault()
                setFocusIndex(prev => Math.max(prev - 1, 0))
                break
            case 'Enter':
                if (focusIndex >= 0 && focusIndex < listLength) {
                    switchSession(flatVisibleSessions[focusIndex].id)
                }
                break
            case 'Escape': {
                setSearchOverlayOpen(true)
                setFocusIndex(-1)
                break
            }
        }
    }, [flatVisibleSessions, focusIndex, switchSession])

    // Context menu action handler
    const handleContextAction = useCallback((action: ChatRowAction, sessionId: string) => {
        switch (action) {
            case 'rename':
                setRenamingSessionId(sessionId)
                break
            case 'pin':
                pinSession(sessionId)
                break
            case 'unpin':
                unpinSession(sessionId)
                break
            case 'delete':
                deleteSession(sessionId)
                break
            case 'duplicate':
                duplicateSessionAction(sessionId)
                break
        }
    }, [pinSession, unpinSession, deleteSession, duplicateSessionAction])

    const handleRenameConfirm = useCallback((id: string, newTitle: string) => {
        updateSessionTitle(id, newTitle)
        setRenamingSessionId(null)
    }, [updateSessionTitle])

    const handleRenameCancel = useCallback(() => {
        setRenamingSessionId(null)
    }, [])

    const handleDropSessionToFolder = useCallback((sessionId: string, folderId: string) => {
        assignFolder(sessionId, folderId)
    }, [assignFolder])

    const stopResizing = useCallback(() => {
        if (!resizeStateRef.current) return
        // Cancel any pending animation frame
        if (resizeRafRef.current !== null) {
            cancelAnimationFrame(resizeRafRef.current)
            resizeRafRef.current = null
        }
        resizeStateRef.current = null
        setIsResizing(false)
        setIsResizingSidebar(false)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
    }, [setIsResizingSidebar])

    const handleResizePointerMove = useCallback((event: PointerEvent) => {
        const resizeState = resizeStateRef.current
        if (!resizeState) return
        // Throttle to one update per animation frame to avoid per-pixel re-renders
        if (resizeRafRef.current !== null) return
        const clientX = event.clientX
        resizeRafRef.current = requestAnimationFrame(() => {
            resizeRafRef.current = null
            const deltaX = clientX - resizeState.startX
            const nextWidth = clampSidebarWidth(resizeState.startWidth + deltaX)
            setSidebarWidth(nextWidth)
        })
    }, [setSidebarWidth])

    const handleResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || sidebarHidden || sidebarCollapsed) return
        event.preventDefault()
        event.stopPropagation()
        resizeStateRef.current = {
            startX: event.clientX,
            startWidth: sidebarWidth,
        }
        setIsResizing(true)
        setIsResizingSidebar(true)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }, [sidebarCollapsed, sidebarHidden, sidebarWidth, setIsResizingSidebar])

    useEffect(() => {
        if (!isResizing) return
        window.addEventListener('pointermove', handleResizePointerMove)
        window.addEventListener('pointerup', stopResizing)
        window.addEventListener('pointercancel', stopResizing)
        return () => {
            window.removeEventListener('pointermove', handleResizePointerMove)
            window.removeEventListener('pointerup', stopResizing)
            window.removeEventListener('pointercancel', stopResizing)
        }
    }, [handleResizePointerMove, isResizing, stopResizing])

    useEffect(() => {
        if ((sidebarHidden || sidebarCollapsed) && isResizing) {
            stopResizing()
        }
    }, [isResizing, sidebarCollapsed, sidebarHidden, stopResizing])

    useEffect(() => {
        return () => {
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            if (resizeRafRef.current !== null) {
                cancelAnimationFrame(resizeRafRef.current)
            }
        }
    }, [])

    // Build container class list
    const containerClasses = [
        'sidebar-container',
        sidebarHidden ? 'sidebar-container--hidden' : '',
        sidebarCollapsed ? 'sidebar-container--collapsed' : 'sidebar-container--expanded',
        isResizing ? 'sidebar-container--resizing' : '',
        shouldApplyGlass ? 'frosted' : '',
    ].filter(Boolean).join(' ')

    // Structural styles stay inline for testability (JSDOM doesn't load CSS files)
    const containerStyle: React.CSSProperties = {
        width: sidebarHidden
            ? '0px'
            : (sidebarCollapsed ? `${SIDEBAR_COLLAPSED_WIDTH_PX}px` : `${sidebarWidth}px`),
        background: shouldApplyGlass ? 'transparent' : 'var(--theme-sidebar-solid)',
        borderRight: '0px solid transparent',
        boxShadow: 'none',
        pointerEvents: sidebarHidden ? 'none' : 'auto',
        transition: isResizing ? 'none' : undefined,
    }

    // Chat content view
    const renderChatContent = () => (
        <div className={`sidebar-view sidebar-view--chat ${view === 'chat' ? 'active' : 'inactive'}`}>
            <SidebarHeader
                onNewChat={clearCurrentSession}
                onOpenSearch={openSearchOverlay}
            />

            <SidebarChatList
                groupedSessions={groupedSessions}
                folders={folders}
                chatSelectedOverlayStyle={chatSelectedOverlayStyle}
                isFrosted={shouldApplyGlass}
                currentSessionId={currentSessionId}
                streamingSessionId={null}
                focusIndex={focusIndex}
                flatVisibleSessions={flatVisibleSessions}
                renamingSessionId={renamingSessionId}
                searchQuery=""
                bottomPadding={userStripPadding}
                onSelectSession={switchSession}
                onContextAction={handleContextAction}
                onRenameStart={(id) => setRenamingSessionId(id)}
                onRenameConfirm={handleRenameConfirm}
                onRenameCancel={handleRenameCancel}
                onDropSessionToFolder={handleDropSessionToFolder}
                onKeyDown={handleKeyDown}
            />
        </div>
    )

    // Settings content view
    const renderSettingsContent = () => (
        <div className={`sidebar-view sidebar-view--settings ${view === 'settings' ? 'active' : 'inactive'}`}>
            {/* Content Area */}
            <div className="sidebar-settings-content">
                {navItems.map((item, index) => (
                    <button
                        key={item.id}
                        onClick={() => onNavigateSettings(item.id)}
                        className={`sidebar-nav-item sidebar-nav-item--settings sidebar-animate-item ${activeSettingsSection === item.id ? 'active' : ''}`}
                        style={{
                            fontSize: '0.9rem',
                            justifyContent: 'flex-start',
                            animationDelay: `${index * 0.05}s`,
                            minWidth: 0,
                            overflow: 'hidden',
                            width: '100%'
                        }}
                    >
                        <div className="sidebar-nav-item__icon">
                            {item.icon}
                        </div>
                        <span className="sidebar-nav-item__label">{item.label}</span>
                    </button>
                ))}
            </div>
        </div>
    )

    return (
        <div className={containerClasses} style={containerStyle}>
            <div className="sidebar__inner">
                {renderChatContent()}
                {renderSettingsContent()}
            </div>

            <SidebarSearchOverlay
                isOpen={view === 'chat' && searchOverlayOpen}
                query={searchQuery}
                sessions={sessions}
                currentSessionId={currentSessionId}
                onQueryChange={setSearchQuery}
                onSelectSession={handleSelectSessionFromSearch}
                onClose={closeSearchOverlay}
            />

            {!sidebarHidden && !sidebarCollapsed && (
                <div
                    className="sidebar-resize-handle"
                    aria-hidden="true"
                    title="Drag to resize sidebar"
                    onPointerDown={handleResizePointerDown}
                />
            )}
        </div>
    )
}

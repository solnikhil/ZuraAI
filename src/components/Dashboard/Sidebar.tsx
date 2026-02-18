import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
    ChartNoAxesCombined, Cloud,
    Paintbrush, FlaskConical, FileText
} from '../icons'

import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useAppShell } from '../../contexts/AppShellContext'
import { useSettingsUI } from '../../contexts/SettingsUIContext'

import SidebarHeader from './Sidebar/SidebarHeader'
import SidebarChatList from './Sidebar/SidebarChatList'
import SidebarSearchOverlay from './Sidebar/SidebarSearchOverlay'
import { groupSessions } from './Sidebar/utils/groupSessions'
import type { ChatRowAction } from './Sidebar/ChatRow'
import './Sidebar/Sidebar.css'

interface SidebarProps {
    view: 'chat' | 'settings'
    onOpenSettings: () => void
    onCloseSettings: () => void
    onNavigateToChat?: () => void
    activeSettingsSection: string
    onNavigateSettings: (section: string) => void
    hasUnsavedSettings?: boolean
}

export default function Sidebar({ view, onOpenSettings: _onOpenSettings, onCloseSettings: _onCloseSettings, onNavigateToChat: _onNavigateToChat, activeSettingsSection, onNavigateSettings, hasUnsavedSettings: _hasUnsavedSettings }: SidebarProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [searchOverlayOpen, setSearchOverlayOpen] = useState(false)
    const { sidebarHidden, sidebarCollapsed } = useAppShell()
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
        archiveSession,
        unarchiveSession: _unarchiveSession,
        duplicateSession: duplicateSessionAction,
        assignFolder,
    } = useChatHistory()
    const { settingsUI } = useSettingsUI()
    const { frostedSidebar, chatSelectedOverlayStyle = 'linear' } = settingsUI
    const userStripPadding = 8

    // Sidebar state
    const [focusIndex, setFocusIndex] = useState(-1)
    const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
    const [showArchived, setShowArchived] = useState(false)
    // Glassmorphism styles
    const shouldApplyGlass = frostedSidebar && !sidebarHidden

    // Settings navigation items
    const navItems = [
        { id: 'usage', label: 'Usage', icon: <ChartNoAxesCombined size={18} /> },
        { id: 'providers', label: 'Providers', icon: <Cloud size={18} /> },
        { id: 'themes', label: 'Appearance', icon: <Paintbrush size={18} /> },
        { id: 'systemprompt', label: 'System Prompt', icon: <FileText size={18} /> },
        { id: 'experimental', label: 'Experimental', icon: <FlaskConical size={18} /> }
    ]

    // Group sessions for sidebar list
    const groupedSessions = useMemo(() =>
        groupSessions(sessions, folders),
        [sessions, folders]
    )

    // Archived sessions (excluded from main list, shown on demand)
    const archivedSessions = useMemo(() =>
        sessions.filter(s => s.archived === true),
        [sessions]
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
            case 'archive':
                // If archiving the active session, clear current
                if (currentSessionId === sessionId) {
                    clearCurrentSession()
                }
                archiveSession(sessionId)
                break
            case 'delete':
                deleteSession(sessionId)
                break
            case 'duplicate':
                duplicateSessionAction(sessionId)
                break
        }
    }, [pinSession, unpinSession, archiveSession, deleteSession, duplicateSessionAction, currentSessionId, clearCurrentSession])

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

    // Build container class list
    const containerClasses = [
        'sidebar-container',
        shouldApplyGlass ? 'frosted' : '',
    ].filter(Boolean).join(' ')

    // Structural styles stay inline for testability (JSDOM doesn't load CSS files)
    const containerStyle: React.CSSProperties = {
        width: sidebarHidden ? '0px' : (sidebarCollapsed ? '60px' : '260px'),
        background: shouldApplyGlass ? 'transparent' : 'var(--theme-surface)',
        borderRight: sidebarHidden
            ? 'none'
            : shouldApplyGlass
                ? 'none'
                : '1px solid var(--theme-border)',
        boxShadow: shouldApplyGlass ? '4px 0 20px rgba(0, 0, 0, 0.35)' : 'none',
        pointerEvents: sidebarHidden ? 'none' : 'auto',
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
                currentSessionId={currentSessionId}
                streamingSessionId={null}
                focusIndex={focusIndex}
                flatVisibleSessions={flatVisibleSessions}
                renamingSessionId={renamingSessionId}
                searchQuery=""
                showArchived={showArchived}
                archivedSessions={archivedSessions}
                bottomPadding={userStripPadding}
                onSelectSession={switchSession}
                onContextAction={handleContextAction}
                onRenameStart={(id) => setRenamingSessionId(id)}
                onRenameConfirm={handleRenameConfirm}
                onRenameCancel={handleRenameCancel}
                onDropSessionToFolder={handleDropSessionToFolder}
                onToggleArchived={() => setShowArchived(prev => !prev)}
                onKeyDown={handleKeyDown}
            />
        </div>
    )

    // Settings content view
    const renderSettingsContent = () => (
        <div className={`sidebar-view sidebar-view--settings ${view === 'settings' ? 'active' : 'inactive'}`}>
            {/* Content Area */}
            <div className="sidebar-settings-content">
                <div className="sidebar-settings-nav">
                    {navItems.map((item, index) => (
                        <button
                            key={item.id}
                            onClick={() => onNavigateSettings(item.id)}
                            className={`sidebar-nav-item sidebar-nav-item--settings sidebar-animate-item ${activeSettingsSection === item.id ? 'active' : ''}`}
                            style={{
                                padding: '10px 8px',
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
        </div>
    )
}

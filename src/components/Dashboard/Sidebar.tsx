import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
    ChartNoAxesCombined, Cpu,
    Key, ArrowLeft, Paintbrush, FlaskConical, FileText
} from '../icons'

import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useAppShell } from '../../contexts/AppShellContext'
import { useSettingsUI } from '../../contexts/SettingsUIContext'

import SidebarHeader from './Sidebar/SidebarHeader'
import SidebarChatList from './Sidebar/SidebarChatList'
import SidebarFooter from './Sidebar/SidebarFooter'
import { filterSessions } from './Sidebar/utils/filterSessions'
import { groupSessions } from './Sidebar/utils/groupSessions'
import type { ChatRowAction } from './Sidebar/ChatRow'

interface SidebarProps {
    view: 'chat' | 'settings'
    onOpenSettings: () => void
    onCloseSettings: () => void
    onNavigateToChat?: () => void
    activeSettingsSection: string
    onNavigateSettings: (section: string) => void
    hasUnsavedSettings?: boolean
}

export default function Sidebar({ view, onOpenSettings, onCloseSettings, onNavigateToChat, activeSettingsSection, onNavigateSettings, hasUnsavedSettings }: SidebarProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const { sidebarHidden } = useAppShell()
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
        unarchiveSession,
        duplicateSession: duplicateSessionAction,
        assignFolder,
    } = useChatHistory()
    const { settings } = useSettings()
    const { settingsUI } = useSettingsUI()
    const { frostedSidebar } = settingsUI

    // Sidebar state
    const [focusIndex, setFocusIndex] = useState(-1)
    const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
    const [showArchived, setShowArchived] = useState(false)
    // Glassmorphism styles
    const shouldApplyGlass = frostedSidebar && !sidebarHidden

    // Settings navigation items
    const navItems = [
        { id: 'usage', label: 'Usage', icon: <ChartNoAxesCombined size={18} /> },
        { id: 'models', label: 'Models', icon: <Cpu size={18} /> },
        { id: 'themes', label: 'Appearance', icon: <Paintbrush size={18} /> },
        { id: 'preferences', label: 'API Keys', icon: <Key size={18} /> },
        { id: 'systemprompt', label: 'System Prompt', icon: <FileText size={18} /> },
        { id: 'experimental', label: 'Experimental', icon: <FlaskConical size={18} /> }
    ]

    // Filter sessions by search query
    const filteredSessions = useMemo(() =>
        filterSessions(sessions, searchQuery),
        [sessions, searchQuery]
    )

    // Group filtered sessions
    const groupedSessions = useMemo(() =>
        groupSessions(filteredSessions, folders),
        [filteredSessions, folders]
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
                const searchEl = document.querySelector('[data-sidebar-search]') as HTMLInputElement
                searchEl?.focus()
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

    // Chat content view
    const renderChatContent = () => (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            opacity: view === 'chat' ? 1 : 0,
            transform: view === 'chat' ? 'translateX(0)' : 'translateX(-20px)',
            transition: 'all 0.18s cubic-bezier(0.25, 0.1, 0.25, 1)',
            pointerEvents: view === 'chat' ? 'all' : 'none',
            position: view === 'chat' ? 'relative' : 'absolute',
            width: '100%'
        }}>
            <SidebarHeader
                onNewChat={clearCurrentSession}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
            />

            <SidebarChatList
                    groupedSessions={groupedSessions}
                    folders={folders}
                    currentSessionId={currentSessionId}
                    streamingSessionId={null}
                    focusIndex={focusIndex}
                    flatVisibleSessions={flatVisibleSessions}
                    renamingSessionId={renamingSessionId}
                    searchQuery={searchQuery}
                    showArchived={showArchived}
                    archivedSessions={archivedSessions}
                    onSelectSession={switchSession}
                    onContextAction={handleContextAction}
                    onRenameStart={(id) => setRenamingSessionId(id)}
                    onRenameConfirm={handleRenameConfirm}
                    onRenameCancel={handleRenameCancel}
                    onDropSessionToFolder={handleDropSessionToFolder}
                    onToggleArchived={() => setShowArchived(prev => !prev)}
                    onKeyDown={handleKeyDown}
                />

            <SidebarFooter
                currentModel={settings.aiModel}
                onOpenSettings={onOpenSettings}
            />
        </div>
    )

    // Settings content view (preserved from original)
    const renderSettingsContent = () => (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            opacity: view === 'settings' ? 1 : 0,
            transform: view === 'settings' ? 'translateX(0)' : 'translateX(20px)',
            transition: 'all 0.18s cubic-bezier(0.25, 0.1, 0.25, 1)',
            pointerEvents: view === 'settings' ? 'all' : 'none',
            boxSizing: 'border-box'
        }}>
            {/* Content Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '8px 12px 0', overflow: 'hidden' }}>
                <div className="nav-menu" style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    minWidth: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                }}>
                    {navItems.map((item, index) => (
                        <button
                            key={item.id}
                            onClick={() => onNavigateSettings(item.id)}
                            className={`nav-item settings-nav-item animate-sidebar-item ${activeSettingsSection === item.id ? 'active' : ''}`}
                            style={{
                                padding: '10px 12px',
                                fontSize: '0.9rem',
                                justifyContent: 'flex-start',
                                animationDelay: `${index * 0.05}s`,
                                minWidth: 0,
                                overflow: 'hidden',
                                width: '100%'
                            }}
                        >
                            <div style={{
                                width: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                {item.icon}
                            </div>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Footer - Back to Chat Button */}
            <div style={{
                marginTop: 'auto',
                borderTop: '1px solid var(--theme-border)',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                minWidth: 0
            }}>
                <button
                    onClick={onCloseSettings}
                    style={{
                        width: '100%',
                        padding: '8px',
                        cursor: 'pointer',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--theme-text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        gap: '12px',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        transition: 'all 0.2s ease',
                        minWidth: 0,
                        overflow: 'hidden'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                    title=""
                >
                    <div style={{
                        width: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <ArrowLeft size={20} strokeWidth={2} />
                    </div>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Back to Chat</span>
                </button>
            </div>
        </div>
    )

    return (
        <div
            className={`sidebar-container${shouldApplyGlass ? ' frosted' : ''}`}
            style={{
                width: sidebarHidden ? '0px' : '260px',
                background: shouldApplyGlass
                    ? 'transparent'
                    : 'var(--theme-surface)',
                borderRight: sidebarHidden
                    ? 'none'
                    : shouldApplyGlass
                        ? 'none'
                        : '1px solid var(--theme-border)',
                boxShadow: shouldApplyGlass
                    ? '4px 0 20px rgba(0, 0, 0, 0.35)'
                    : 'none',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                transition: 'width 0.2s ease, opacity 0.15s ease, background 0.2s ease',
                position: 'relative',
                overflow: 'hidden',
                pointerEvents: sidebarHidden ? 'none' : 'auto',
                zIndex: 1
            }}>
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                {renderChatContent()}
                {renderSettingsContent()}
            </div>

            <style>{`
                /* Custom Scrollbar */
                ::-webkit-scrollbar {
                    width: 4px;
                }
                ::-webkit-scrollbar-track {
                    background: transparent;
                }
                ::-webkit-scrollbar-thumb {
                    background: var(--theme-border);
                    border-radius: 2px;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: var(--theme-border-hover);
                }
                ::-webkit-scrollbar-thumb:active {
                    background: var(--theme-border-active);
                }

                .nav-item { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 6px; color: var(--theme-text-primary); background: transparent; border: none; cursor: pointer; text-align: left; font-size: 0.85rem; font-weight: 500; transition: background 0.15s ease, color 0.15s ease; width: 100%; box-sizing: border-box; }
                .nav-item:hover { background: var(--theme-surface-hover); }
                .nav-item.active { background: var(--theme-surface-active); }

                .settings-nav-item { transition: transform 0.12s cubic-bezier(0.2, 0.7, 0.3, 1), background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease; will-change: transform; }
                .settings-nav-item:active { transform: translateY(1px) scale(0.98); background: var(--theme-surface-active); box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08); transition-duration: 0.06s; }
                .settings-nav-item:focus-visible { box-shadow: 0 0 0 2px var(--theme-accent-muted); outline: none; }
                .settings-nav-item:focus-visible:active { box-shadow: 0 0 0 2px var(--theme-accent-muted), inset 0 1px 2px rgba(0, 0, 0, 0.08); }
                @media (prefers-reduced-motion: reduce) {
                    .sidebar-container { transition: none !important; }
                    .sidebar-container * { transition: none !important; animation: none !important; }
                    .settings-nav-item { transition: background 0.15s ease, color 0.15s ease; }
                    .settings-nav-item:active { transform: none; box-shadow: none; }
                }

                @keyframes blur-in-up {
                    0% { opacity: 0; transform: translateY(10px); filter: blur(5px); }
                    100% { opacity: 1; transform: translateY(0); filter: blur(0); }
                }
                .animate-sidebar-item {
                    animation: blur-in-up 0.25s cubic-bezier(0.25, 0.1, 0.25, 1) backwards;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
            `}</style>
        </div>
    )
}

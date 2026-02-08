import React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import ChatRow from './ChatRow'
import type { ChatRowAction } from './ChatRow'
import ChatRowContextMenu from './ChatRowContextMenu'
import PinnedSection from './PinnedSection'
import FolderSection from './FolderSection'
import TimeGroup from './TimeGroup'
import type { GroupedSessions } from './utils/groupSessions'
import type { ChatSession, Folder } from '../../../contexts/ChatHistoryContext'

interface SidebarChatListProps {
    groupedSessions: GroupedSessions
    folders: Folder[]
    currentSessionId: string | null
    streamingSessionId: string | null
    focusIndex: number
    flatVisibleSessions: ChatSession[]
    renamingSessionId: string | null
    searchQuery: string
    showArchived: boolean
    archivedSessions: ChatSession[]
    onSelectSession: (id: string) => void
    onContextAction: (action: ChatRowAction, sessionId: string) => void
    onRenameStart: (id: string) => void
    onRenameConfirm: (id: string, newTitle: string) => void
    onRenameCancel: () => void
    onDropSessionToFolder: (sessionId: string, folderId: string) => void
    onToggleArchived: () => void
    onKeyDown: (e: React.KeyboardEvent) => void
}

export default function SidebarChatList({
    groupedSessions,
    folders,
    currentSessionId,
    streamingSessionId,
    focusIndex,
    flatVisibleSessions,
    renamingSessionId,
    searchQuery,
    showArchived,
    archivedSessions,
    onSelectSession,
    onContextAction,
    onRenameStart,
    onRenameConfirm,
    onRenameCancel,
    onDropSessionToFolder,
    onToggleArchived,
    onKeyDown,
}: SidebarChatListProps) {
    const [dropdownOpenId, setDropdownOpenId] = React.useState<string | null>(null)

    const renderChatRow = (session: ChatSession) => {
        const flatIndex = flatVisibleSessions.findIndex(s => s.id === session.id)

        return (
            <ChatRowContextMenu
                key={session.id}
                isPinned={session.pinned === true}
                isArchived={session.archived === true}
                onAction={(action) => onContextAction(action, session.id)}
                dropdownOpen={dropdownOpenId === session.id}
                onDropdownOpenChange={(open) => setDropdownOpenId(open ? session.id : null)}
            >
                <div
                    draggable
                    onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', session.id)
                        e.dataTransfer.effectAllowed = 'move'
                    }}
                >
                    <ChatRow
                        session={session}
                        isActive={currentSessionId === session.id}
                        isFocused={flatIndex === focusIndex}
                        isStreaming={streamingSessionId === session.id}
                        isRenaming={renamingSessionId === session.id}
                        onSelect={onSelectSession}
                        onRenameStart={onRenameStart}
                        onRenameConfirm={onRenameConfirm}
                        onRenameCancel={onRenameCancel}
                        onContextMenu={(e, id) => {
                            // Context menu handled by ChatRowContextMenu wrapper
                        }}
                        onMoreClick={(e, id) => {
                            setDropdownOpenId(id)
                        }}
                    />
                </div>
            </ChatRowContextMenu>
        )
    }

    const hasAnyVisibleSessions = flatVisibleSessions.length > 0

    return (
        <ScrollArea
            style={{ flex: 1, minWidth: 0 }}
            viewportStyle={{
                display: 'flex',
                flexDirection: 'column',
                padding: '0 8px',
            }}
        >
            <div
                role="listbox"
                tabIndex={0}
                onKeyDown={onKeyDown}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    outline: 'none',
                    paddingBottom: '8px',
                }}
            >
                {/* Section header */}
                <div style={{
                    fontSize: '0.7rem',
                    color: 'var(--theme-text-muted)',
                    padding: '8px 4px 4px',
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                }}>
                    Chats
                </div>

                {!hasAnyVisibleSessions && searchQuery && (
                    <div style={{
                        fontSize: '0.8rem',
                        color: 'var(--theme-text-muted)',
                        padding: '16px 8px',
                        textAlign: 'center',
                    }}>
                        No chats found
                    </div>
                )}

                {!hasAnyVisibleSessions && !searchQuery && (
                    <div style={{
                        fontSize: '0.8rem',
                        color: 'var(--theme-text-muted)',
                        padding: '16px 8px',
                        textAlign: 'center',
                    }}>
                        No chats yet
                    </div>
                )}

                {/* Pinned Section */}
                {groupedSessions.pinned.length > 0 && (
                    <PinnedSection sessions={groupedSessions.pinned}>
                        {groupedSessions.pinned.map(s => renderChatRow(s))}
                    </PinnedSection>
                )}

                {/* Folder Sections */}
                {folders.map(folder => {
                    const folderSessions = groupedSessions.folders.get(folder.id) || []
                    return (
                        <FolderSection
                            key={folder.id}
                            folder={folder}
                            sessionCount={folderSessions.length}
                            onDropSession={onDropSessionToFolder}
                        >
                            {folderSessions.map(s => renderChatRow(s))}
                        </FolderSection>
                    )
                })}

                {/* Time Groups */}
                {[
                    { label: 'Today', sessions: groupedSessions.today },
                    { label: 'Yesterday', sessions: groupedSessions.yesterday },
                    { label: 'Previous 7 Days', sessions: groupedSessions.previous7Days },
                    { label: 'Previous 30 Days', sessions: groupedSessions.previous30Days },
                    { label: 'Older', sessions: groupedSessions.older },
                ].map(group => (
                    <TimeGroup key={group.label} label={group.label} sessions={group.sessions}>
                        {group.sessions.map(s => renderChatRow(s))}
                    </TimeGroup>
                ))}

                {/* Archived toggle */}
                <div
                    onClick={onToggleArchived}
                    style={{
                        fontSize: '0.7rem',
                        color: 'var(--theme-text-muted)',
                        padding: '8px 4px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        opacity: 0.7,
                        transition: 'opacity 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.7' }}
                >
                    {showArchived ? 'Hide archived' : `Archived (${archivedSessions.length})`}
                </div>

                {/* Archived sessions */}
                {showArchived && archivedSessions.length > 0 && (
                    <TimeGroup label="Archived" sessions={archivedSessions}>
                        {archivedSessions.map(s => renderChatRow(s))}
                    </TimeGroup>
                )}
            </div>
        </ScrollArea>
    )
}

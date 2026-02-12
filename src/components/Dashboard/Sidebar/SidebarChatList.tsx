import React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import ChatRow from './ChatRow'
import type { ChatRowAction } from './ChatRow'
import ChatRowContextMenu from './ChatRowContextMenu'
import PinnedSection from './PinnedSection'
import FolderSection from './FolderSection'
import TimeGroup from './TimeGroup'
import { ChevronDown } from '../../icons'
import type { GroupedSessions } from './utils/groupSessions'
import type { ChatSession, Folder } from '../../../contexts/ChatHistoryContext'
import type { ChatSelectedOverlayStyle } from '../../../contexts/SettingsUIContext'

interface SidebarChatListProps {
    groupedSessions: GroupedSessions
    folders: Folder[]
    chatSelectedOverlayStyle: ChatSelectedOverlayStyle
    currentSessionId: string | null
    streamingSessionId: string | null
    focusIndex: number
    flatVisibleSessions: ChatSession[]
    renamingSessionId: string | null
    searchQuery: string
    showArchived: boolean
    archivedSessions: ChatSession[]
    bottomPadding?: number
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
    chatSelectedOverlayStyle,
    currentSessionId,
    streamingSessionId,
    focusIndex,
    flatVisibleSessions,
    renamingSessionId,
    searchQuery,
    showArchived,
    archivedSessions,
    bottomPadding = 8,
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
    const [isYourChatsOpen, setIsYourChatsOpen] = React.useState(true)
    const chronologicalSessions = [
        ...groupedSessions.today,
        ...groupedSessions.yesterday,
        ...groupedSessions.previous7Days,
        ...groupedSessions.previous30Days,
        ...groupedSessions.older,
    ]

    const renderChatRow = (session: ChatSession) => {
        const flatIndex = flatVisibleSessions.findIndex(s => s.id === session.id)

        return (
            <ChatRowContextMenu
                key={session.id}
                isPinned={session.pinned === true}
                isArchived={session.archived === true}
                onAction={(action) => onContextAction(action, session.id)}
                dropdownOpen={dropdownOpenId === session.id}
                onDropdownOpenChange={(open) => {
                    if (!open) {
                        setDropdownOpenId(null)
                    }
                }}
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
                        selectedOverlayStyle={chatSelectedOverlayStyle}
                        isActive={currentSessionId === session.id}
                        isMenuOpen={dropdownOpenId === session.id}
                        isFocused={flatIndex === focusIndex}
                        isStreaming={streamingSessionId === session.id}
                        isRenaming={renamingSessionId === session.id}
                        onSelect={onSelectSession}
                        onRenameStart={onRenameStart}
                        onRenameConfirm={onRenameConfirm}
                        onRenameCancel={onRenameCancel}
                        onMoreClick={(_e, id) => {
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
                paddingLeft: '8px',
                paddingRight: '14px',
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
                    paddingBottom: bottomPadding,
                }}
            >
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

                <Collapsible open={isYourChatsOpen} onOpenChange={setIsYourChatsOpen}>
                    <CollapsibleTrigger asChild>
                        <div style={{
                            fontSize: '0.82rem',
                            color: 'var(--theme-text-secondary)',
                            padding: '8px 6px 4px',
                            fontWeight: 500,
                            letterSpacing: '0.01em',
                            textTransform: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer',
                            userSelect: 'none',
                            borderRadius: '8px',
                            width: 'fit-content',
                        }}>
                            <span>Your chats</span>
                            <ChevronDown
                                size={10}
                                style={{
                                    transition: 'transform 0.15s ease',
                                    transform: isYourChatsOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                                    flexShrink: 0,
                                }}
                            />
                        </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '2px' }}>
                            {chronologicalSessions.map(s => renderChatRow(s))}
                        </div>
                    </CollapsibleContent>
                </Collapsible>

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

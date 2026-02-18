import React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { MessageCircle } from '../../icons'
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

/** Time-group definition for sub-labels inside "Your chats" */
interface TimeGroupBucket {
    label: string
    sessions: ChatSession[]
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

    // Build time-group buckets (only include non-empty ones)
    const timeGroups: TimeGroupBucket[] = React.useMemo(() => {
        const buckets: TimeGroupBucket[] = [
            { label: 'Today', sessions: groupedSessions.today },
            { label: 'Yesterday', sessions: groupedSessions.yesterday },
            { label: 'Previous 7 days', sessions: groupedSessions.previous7Days },
            { label: 'Previous 30 days', sessions: groupedSessions.previous30Days },
            { label: 'Older', sessions: groupedSessions.older },
        ]
        return buckets.filter(b => b.sessions.length > 0)
    }, [groupedSessions])

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
            className="sidebar-chatlist"
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
                className="sidebar-chatlist__listbox"
                style={{ paddingBottom: bottomPadding }}
            >
                {!hasAnyVisibleSessions && searchQuery && (
                    <div className="sidebar-empty">
                        <MessageCircle size={24} className="sidebar-empty__icon" />
                        <span className="sidebar-empty__text">No chats found</span>
                    </div>
                )}

                {!hasAnyVisibleSessions && !searchQuery && (
                    <div className="sidebar-empty">
                        <MessageCircle size={24} className="sidebar-empty__icon" />
                        <span className="sidebar-empty__text">No chats yet</span>
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

                {/* "Your chats" — with time-group sub-labels */}
                <Collapsible open={isYourChatsOpen} onOpenChange={setIsYourChatsOpen}>
                    <CollapsibleTrigger asChild>
                        <div className="sidebar-section-label">
                            <ChevronDown
                                size={10}
                                className={`sidebar-section-label__chevron ${isYourChatsOpen ? 'sidebar-section-label__chevron--open' : 'sidebar-section-label__chevron--closed'}`}
                            />
                            <span>Your chats</span>
                        </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div className="sidebar-section-content" style={{ paddingTop: '2px' }}>
                            {timeGroups.map(group => (
                                <React.Fragment key={group.label}>
                                    {group.sessions.map(s => renderChatRow(s))}
                                </React.Fragment>
                            ))}
                        </div>
                    </CollapsibleContent>
                </Collapsible>

                {/* Archived toggle */}
                <div
                    onClick={onToggleArchived}
                    className="sidebar-archived-toggle"
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

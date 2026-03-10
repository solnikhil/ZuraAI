import React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import ChatRow from './ChatRow'
import type { ChatRowAction } from './ChatRow'
import ChatRowContextMenu from './ChatRowContextMenu'
import PinnedSection from './PinnedSection'
import FolderSection from './FolderSection'
import { ChevronDown } from '../../icons'
import type { GroupedSessions } from './utils/groupSessions'
import type { ChatSession, Folder } from '../../../contexts/ChatHistoryContext'
import type { ChatSelectedOverlayStyle } from '../../../contexts/SettingsUIContext'

const CHAT_LIST_BASE_HORIZONTAL_PADDING = 8
const CHAT_LIST_SCROLLBAR_GUTTER = 6

interface SidebarChatListProps {
  groupedSessions: GroupedSessions
  folders: Folder[]
  chatSelectedOverlayStyle: ChatSelectedOverlayStyle
  isFrosted: boolean
  currentSessionId: string | null
  streamingSessionId: string | null
  focusIndex: number
  flatVisibleSessions: ChatSession[]
  renamingSessionId: string | null
  searchQuery: string
  bottomPadding?: number
  onSelectSession: (id: string) => void
  onContextAction: (action: ChatRowAction, sessionId: string) => void
  onRenameStart: (id: string) => void
  onRenameConfirm: (id: string, newTitle: string) => void
  onRenameCancel: () => void
  onDropSessionToFolder: (sessionId: string, folderId: string) => void
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
  isFrosted,
  currentSessionId,
  streamingSessionId,
  focusIndex,
  flatVisibleSessions,
  renamingSessionId,
  bottomPadding = 8,
  onSelectSession,
  onContextAction,
  onRenameStart,
  onRenameConfirm,
  onRenameCancel,
  onDropSessionToFolder,
  onKeyDown,
}: SidebarChatListProps) {
  const [dropdownOpenId, setDropdownOpenId] = React.useState<string | null>(null)
  const [isYourChatsOpen, setIsYourChatsOpen] = React.useState(true)
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const [hasVerticalScrollbar, setHasVerticalScrollbar] = React.useState(false)

  const updateScrollbarState = React.useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const shouldShowVerticalScrollbar = viewport.scrollHeight > viewport.clientHeight + 1
    setHasVerticalScrollbar((prev) =>
      prev === shouldShowVerticalScrollbar ? prev : shouldShowVerticalScrollbar
    )
  }, [])

  React.useEffect(() => {
    updateScrollbarState()

    const viewport = viewportRef.current
    if (!viewport) return

    const onScroll = () => updateScrollbarState()
    const onResize = () => updateScrollbarState()

    viewport.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateScrollbarState()
      })

      resizeObserver.observe(viewport)
      const viewportContent = viewport.firstElementChild
      if (viewportContent instanceof HTMLElement) {
        resizeObserver.observe(viewportContent)
      }
    }

    return () => {
      viewport.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      resizeObserver?.disconnect()
    }
  }, [updateScrollbarState])

  const horizontalPadding = `${CHAT_LIST_BASE_HORIZONTAL_PADDING + (hasVerticalScrollbar ? CHAT_LIST_SCROLLBAR_GUTTER : 0)}px`

  // Build time-group buckets (only include non-empty ones)
  const timeGroups: TimeGroupBucket[] = React.useMemo(() => {
    const buckets: TimeGroupBucket[] = [
      { label: 'Today', sessions: groupedSessions.today },
      { label: 'Yesterday', sessions: groupedSessions.yesterday },
      { label: 'Previous 7 days', sessions: groupedSessions.previous7Days },
      { label: 'Previous 30 days', sessions: groupedSessions.previous30Days },
      { label: 'Older', sessions: groupedSessions.older },
    ]
    return buckets.filter((b) => b.sessions.length > 0)
  }, [groupedSessions])

  const renderChatRow = (session: ChatSession) => {
    const flatIndex = flatVisibleSessions.findIndex((s) => s.id === session.id)

    return (
      <ChatRowContextMenu
        key={session.id}
        isPinned={session.pinned === true}
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
            isFrosted={isFrosted}
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
            onContextMenu={(e, id) => {
              e.preventDefault()
              e.stopPropagation()
              setDropdownOpenId(id)
            }}
          />
        </div>
      </ChatRowContextMenu>
    )
  }

  return (
    <ScrollArea
      className="sidebar-chatlist"
      viewportRef={viewportRef}
      viewportStyle={{
        display: 'flex',
        flexDirection: 'column',
        paddingLeft: horizontalPadding,
        paddingRight: horizontalPadding,
      }}
    >
      <div
        role="listbox"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="sidebar-chatlist__listbox"
        style={{ paddingBottom: bottomPadding }}
      >
        {groupedSessions.pinned.length > 0 && (
          <PinnedSection sessions={groupedSessions.pinned}>
            {groupedSessions.pinned.map((s) => renderChatRow(s))}
          </PinnedSection>
        )}

        {folders.map((folder) => {
          const folderSessions = groupedSessions.folders.get(folder.id) || []
          return (
            <FolderSection
              key={folder.id}
              folder={folder}
              sessionCount={folderSessions.length}
              onDropSession={onDropSessionToFolder}
            >
              {folderSessions.map((s) => renderChatRow(s))}
            </FolderSection>
          )
        })}

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
              {timeGroups.map((group) => (
                <React.Fragment key={group.label}>
                  {group.sessions.map((s) => renderChatRow(s))}
                </React.Fragment>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </ScrollArea>
  )
}

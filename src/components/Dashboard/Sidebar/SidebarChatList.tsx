import React from 'react'
import { Virtuoso } from 'react-virtuoso'
import ChatRow from './ChatRow'
import type { ChatRowAction } from './ChatRow'
import ChatRowContextMenu from './ChatRowContextMenu'
import DeleteChatAlertDialog from './DeleteChatAlertDialog'
import RenameChatDialog from './RenameChatDialog'
import { ChevronDown, FolderOpen, Pin } from '../../icons'
import type { GroupedSessions } from './utils/groupSessions'
import type { ChatSession, Folder } from '../../../chat/types'
import type { ChatSelectedOverlayStyle } from '../../../contexts/SettingsUIContext'

const CHAT_LIST_BASE_HORIZONTAL_PADDING = 8

interface SidebarChatListProps {
  groupedSessions: GroupedSessions
  folders: Folder[]
  chatSelectedOverlayStyle: ChatSelectedOverlayStyle
  isFrosted: boolean
  currentSessionId: string | null
  streamingSessionId: string | null
  focusIndex: number
  flatVisibleSessions: ChatSession[]
  sessionIndexMap: Map<string, number>
  bottomPadding?: number
  onSelectSession: (id: string) => void
  onContextAction: (action: ChatRowAction, sessionId: string) => void
  onRenameConfirm: (id: string, newTitle: string) => void
  onDropSessionToFolder: (sessionId: string, folderId: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

/** Time-group definition for sub-labels inside "Your chats" */
interface TimeGroupBucket {
  label: string
  sessions: ChatSession[]
}

type SidebarListItem =
  | { type: 'section'; key: string; label: string; icon?: 'pin' | 'folder'; count?: number; folder?: Folder }
  | { type: 'row'; key: string; session: ChatSession; indented?: boolean }
  | { type: 'folder-empty'; key: string; folderId: string }

export default function SidebarChatList({
  groupedSessions,
  folders,
  chatSelectedOverlayStyle,
  isFrosted,
  currentSessionId,
  streamingSessionId,
  focusIndex,
  flatVisibleSessions,
  sessionIndexMap,
  bottomPadding = 8,
  onSelectSession,
  onContextAction,
  onRenameConfirm,
  onDropSessionToFolder,
  onKeyDown,
}: SidebarChatListProps) {
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = React.useState<string | null>(null)
  const [renameSessionId, setRenameSessionId] = React.useState<string | null>(null)
  const [isPinnedOpen, setIsPinnedOpen] = React.useState(true)
  const [isYourChatsOpen, setIsYourChatsOpen] = React.useState(true)
  const [openFolderIds, setOpenFolderIds] = React.useState(() => new Set<string>())
  const [dragOverFolderId, setDragOverFolderId] = React.useState<string | null>(null)

  React.useEffect(() => {
    setOpenFolderIds((prev) => {
      const next = new Set<string>()
      folders.forEach((folder) => {
        if (prev.size === 0 || prev.has(folder.id)) {
          next.add(folder.id)
        }
      })
      return next
    })
  }, [folders])

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

  const toggleFolderOpen = React.useCallback((folderId: string) => {
    setOpenFolderIds((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }, [])

  const sidebarItems = React.useMemo<SidebarListItem[]>(() => {
    const items: SidebarListItem[] = []

    if (groupedSessions.pinned.length > 0) {
      items.push({ type: 'section', key: 'pinned', label: 'Pinned', icon: 'pin' })
      if (isPinnedOpen) {
        groupedSessions.pinned.forEach((session) => {
          items.push({ type: 'row', key: `pinned:${session.id}`, session })
        })
      }
    }

    folders.forEach((folder) => {
      const folderSessions = groupedSessions.folders.get(folder.id) || []
      items.push({
        type: 'section',
        key: `folder:${folder.id}`,
        label: folder.name,
        icon: 'folder',
        count: folderSessions.length,
        folder,
      })

      if (openFolderIds.has(folder.id)) {
        folderSessions.forEach((session) => {
          items.push({
            type: 'row',
            key: `folder:${folder.id}:${session.id}`,
            session,
            indented: true,
          })
        })

        if (folderSessions.length === 0) {
          items.push({ type: 'folder-empty', key: `folder-empty:${folder.id}`, folderId: folder.id })
        }
      }
    })

    items.push({ type: 'section', key: 'your-chats', label: 'Your chats' })
    if (isYourChatsOpen) {
      timeGroups.forEach((group) => {
        group.sessions.forEach((session) => {
          items.push({ type: 'row', key: `${group.label}:${session.id}`, session })
        })
      })
    }

    return items
  }, [folders, groupedSessions.folders, groupedSessions.pinned, isPinnedOpen, isYourChatsOpen, openFolderIds, timeGroups])

  const renderChatRow = React.useCallback((session: ChatSession, indented = false) => {
    const flatIndex = sessionIndexMap.get(session.id) ?? -1

    const handleContextMenuAction = (action: ChatRowAction, sessionId: string) => {
      if (action === 'rename') {
        setRenameSessionId(sessionId)
        return
      }
      onContextAction(action, sessionId)
    }

    return (
      <ChatRowContextMenu
        key={session.id}
        isPinned={session.pinned === true}
        onAction={(action) => handleContextMenuAction(action, session.id)}
      >
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', session.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          style={{
            paddingLeft: indented ? 8 : 0,
            paddingRight: 6,
          }}
        >
          <ChatRow
            session={session}
            selectedOverlayStyle={chatSelectedOverlayStyle}
            isFrosted={isFrosted}
            isActive={currentSessionId === session.id}
            isFocused={flatIndex === focusIndex}
            isStreaming={streamingSessionId === session.id}
            onSelect={onSelectSession}
          />
        </div>
      </ChatRowContextMenu>
    )
  }, [
    chatSelectedOverlayStyle,
    currentSessionId,
    focusIndex,
    isFrosted,
    onContextAction,
    onSelectSession,
    sessionIndexMap,
    streamingSessionId,
  ])

  const renderSectionHeader = React.useCallback(
    (item: Extract<SidebarListItem, { type: 'section' }>) => {
      if (item.folder) {
        const isOpen = openFolderIds.has(item.folder.id)
        const isDragOver = dragOverFolderId === item.folder.id
        return (
          <div
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDragOverFolderId(item.folder!.id)
            }}
            onDragLeave={() => {
              setDragOverFolderId((prev) => (prev === item.folder!.id ? null : prev))
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragOverFolderId((prev) => (prev === item.folder!.id ? null : prev))
              const sessionId = event.dataTransfer.getData('text/plain')
              if (sessionId) {
                onDropSessionToFolder(sessionId, item.folder!.id)
              }
            }}
            className={`sidebar-folder-dropzone ${isDragOver ? 'sidebar-folder-dropzone--over' : ''}`}
          >
            <div
              className="sidebar-section-label"
              onClick={() => toggleFolderOpen(item.folder!.id)}
              role="button"
              aria-expanded={isOpen}
            >
              <ChevronDown
                size={10}
                className={`sidebar-section-label__chevron ${isOpen ? 'sidebar-section-label__chevron--open' : 'sidebar-section-label__chevron--closed'}`}
              />
              <FolderOpen size={12} className="sidebar-section-label__icon" />
              <span className="sidebar-section-label__name">{item.label}</span>
              <span className="sidebar-section-label__count">{item.count}</span>
            </div>
          </div>
        )
      }

      const isOpen = item.key === 'pinned' ? isPinnedOpen : isYourChatsOpen
      const toggleOpen =
        item.key === 'pinned'
          ? () => setIsPinnedOpen((prev) => !prev)
          : () => setIsYourChatsOpen((prev) => !prev)

      return (
        <div className="sidebar-section-label" onClick={toggleOpen} role="button" aria-expanded={isOpen}>
          <ChevronDown
            size={10}
            className={`sidebar-section-label__chevron ${isOpen ? 'sidebar-section-label__chevron--open' : 'sidebar-section-label__chevron--closed'}`}
          />
          {item.icon === 'pin' && <Pin size={11} className="sidebar-section-label__icon" />}
          <span>{item.label}</span>
        </div>
      )
    },
    [dragOverFolderId, isPinnedOpen, isYourChatsOpen, onDropSessionToFolder, openFolderIds, toggleFolderOpen]
  )

  const renderItem = React.useCallback(
    (_index: number, item: SidebarListItem) => {
      if (item.type === 'section') {
        return renderSectionHeader(item)
      }

      if (item.type === 'folder-empty') {
        return <div className="sidebar-folder-empty">Drop chats here</div>
      }

      return renderChatRow(item.session, item.indented)
    },
    [renderChatRow, renderSectionHeader]
  )

  return (
    <>
      <div className="sidebar-chatlist">
        <Virtuoso
          className="sidebar-chatlist__virtuoso"
          data={sidebarItems}
          itemContent={renderItem}
          components={{
            Scroller: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
              function SidebarChatScroller(props, ref) {
                return (
                  <div
                    {...props}
                    ref={ref}
                    className={[props.className, 'sidebar-chatlist__scroller'].filter(Boolean).join(' ')}
                  />
                )
              }
            ),
            List: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
              function SidebarChatListbox(props, ref) {
                return (
                  <div
                    {...props}
                    ref={ref}
                    role="listbox"
                    tabIndex={0}
                    onKeyDown={onKeyDown}
                    className="sidebar-chatlist__listbox"
                    style={{
                      ...(props.style || {}),
                      paddingTop: 2,
                      paddingBottom: bottomPadding,
                    }}
                  />
                )
              }
            ),
          }}
          style={{
            height: '100%',
            paddingLeft: CHAT_LIST_BASE_HORIZONTAL_PADDING,
            paddingRight: CHAT_LIST_BASE_HORIZONTAL_PADDING,
          }}
        />
      </div>

      <DeleteChatAlertDialog
        open={deleteConfirmSessionId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmSessionId(null)
          }
        }}
        onConfirm={() => {
          if (deleteConfirmSessionId) {
            onContextAction('delete', deleteConfirmSessionId)
          }
          setDeleteConfirmSessionId(null)
        }}
      />

      <RenameChatDialog
        open={renameSessionId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameSessionId(null)
          }
        }}
        currentTitle={flatVisibleSessions.find((s) => s.id === renameSessionId)?.title || ''}
        onConfirm={(newTitle) => {
          if (renameSessionId) {
            onRenameConfirm(renameSessionId, newTitle)
          }
          setRenameSessionId(null)
        }}
      />
    </>
  )
}

import React from 'react'
import ChatRow from './ChatRow'
import type { ChatRowAction } from './ChatRow'
import ChatRowContextMenu from './ChatRowContextMenu'
import DeleteChatAlertDialog from './DeleteChatAlertDialog'
import DeleteFolderAlertDialog from './DeleteFolderAlertDialog'
import FolderNameDialog from './FolderNameDialog'
import RenameChatDialog from './RenameChatDialog'
import {
  Bell,
  ChevronDown,
  Edit2,
  FileText,
  FolderOpen,
  Pin,
  Plus,
  SettingsIcon,
  Trash2,
} from '../../icons'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { GroupedSessions } from './utils/groupSessions'
import type { ChatSession, Folder } from '../../../chat/types'
import type { ChatSelectedOverlayStyle } from '../../../contexts/SettingsUIContext'

interface SidebarChatListProps {
  groupedSessions: GroupedSessions
  folders: Folder[]
  selectedFolderId: string | null
  chatSelectedOverlayStyle: ChatSelectedOverlayStyle
  isFrosted: boolean
  currentSessionId: string | null
  streamingSessionId: string | null
  focusIndex: number
  flatVisibleSessions: ChatSession[]
  sessionIndexMap: Map<string, number>
  bottomPadding?: number
  remindersEnabled: boolean
  artifactsEnabled: boolean
  onOpenReminders: () => void
  onOpenArtifacts: () => void
  onOpenFolders: () => void
  onCreateFolder: () => void
  onOpenFolder: (folderId: string) => void
  onSelectSession: (id: string) => void
  onContextAction: (action: ChatRowAction, sessionId: string) => void
  onAssignFolder: (sessionId: string, folderId: string) => void
  onRemoveFromFolder: (sessionId: string) => void
  onRenameFolder: (folderId: string, name: string) => void
  onDeleteFolder: (folderId: string) => void
  onRenameConfirm: (id: string, newTitle: string) => void
  onDropSessionToFolder: (sessionId: string, folderId: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

/** Time-group definition for sub-labels inside "Recents" */
interface TimeGroupBucket {
  label: string
  sessions: ChatSession[]
}

type SidebarListItem =
  | { type: 'section'; key: string; label: string; icon?: 'pin' | 'folder'; count?: number; folder?: Folder }
  | { type: 'folder-heading'; key: string; label: string }
  | { type: 'row'; key: string; session: ChatSession; indented?: boolean }

export default function SidebarChatList({
  groupedSessions,
  folders,
  selectedFolderId,
  chatSelectedOverlayStyle,
  isFrosted,
  currentSessionId,
  streamingSessionId,
  focusIndex,
  flatVisibleSessions,
  sessionIndexMap,
  bottomPadding = 8,
  remindersEnabled,
  artifactsEnabled,
  onOpenReminders,
  onOpenArtifacts,
  onOpenFolders,
  onCreateFolder,
  onOpenFolder,
  onSelectSession,
  onContextAction,
  onAssignFolder,
  onRemoveFromFolder,
  onRenameFolder,
  onDeleteFolder,
  onRenameConfirm,
  onDropSessionToFolder,
  onKeyDown,
}: SidebarChatListProps) {
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = React.useState<string | null>(null)

  const [renameSessionId, setRenameSessionId] = React.useState<string | null>(null)
  const [renameFolderId, setRenameFolderId] = React.useState<string | null>(null)
  const [deleteFolderId, setDeleteFolderId] = React.useState<string | null>(null)
  const [isPinnedOpen, setIsPinnedOpen] = React.useState(true)
  const [isYourChatsOpen, setIsYourChatsOpen] = React.useState(true)
  const [dragOverFolderId, setDragOverFolderId] = React.useState<string | null>(null)

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

    items.push({ type: 'folder-heading', key: 'folders-heading', label: 'Folders' })
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
    })

    items.push({ type: 'section', key: 'your-chats', label: 'Recents' })
    if (isYourChatsOpen) {
      timeGroups.forEach((group) => {
        group.sessions.forEach((session) => {
          items.push({ type: 'row', key: `${group.label}:${session.id}`, session })
        })
      })
    }

    return items
  }, [folders, groupedSessions.folders, groupedSessions.pinned, isPinnedOpen, isYourChatsOpen, timeGroups])

  const renderChatRow = React.useCallback((session: ChatSession, indented = false) => {
    const flatIndex = sessionIndexMap.get(session.id) ?? -1

    const handleContextMenuAction = (action: ChatRowAction, sessionId: string) => {
      if (action === 'rename') {
        setRenameSessionId(sessionId)
        return
      }
      if (action === 'removeFromFolder') {
        onRemoveFromFolder(sessionId)
        return
      }
      onContextAction(action, sessionId)
    }

    return (
      <ChatRowContextMenu
        key={session.id}
        isPinned={session.pinned === true}
        currentFolderId={session.folderId ?? null}
        folders={folders}
        onAction={(action) => handleContextMenuAction(action, session.id)}
        onAssignFolder={(folderId) => onAssignFolder(session.id, folderId)}
      >
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', session.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          style={{
            paddingLeft: indented ? 8 : 0,
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
    folders,
    isFrosted,
    onAssignFolder,
    onContextAction,
    onRemoveFromFolder,
    onSelectSession,
    sessionIndexMap,
    streamingSessionId,
  ])

  const renderSectionHeader = React.useCallback(
    (item: Extract<SidebarListItem, { type: 'section' }>) => {
      if (item.folder) {
        const isActive = selectedFolderId === item.folder.id
        const isDragOver = dragOverFolderId === item.folder.id
        const header = (
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
              className={`sidebar-header__btn sidebar-folder-row ${isActive ? 'sidebar-folder-row--active' : ''}`}
              onClick={() => onOpenFolder(item.folder!.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpenFolder(item.folder!.id)
                }
              }}
              role="button"
              tabIndex={0}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="sidebar-header__icon-slot" aria-hidden="true">
                <FolderOpen size={16} className="sidebar-header__icon" />
              </span>
              <span className="sidebar-header__label">{item.label}</span>
              <span className="sidebar-folder-row__count">{item.count}</span>
            </div>
          </div>
        )

        return (
          <ContextMenu>
            <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => setRenameFolderId(item.folder!.id)}>
                <Edit2 size={14} />
                Rename
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onSelect={() => setDeleteFolderId(item.folder!.id)}
              >
                <Trash2 size={14} />
                Delete folder
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      }

      const isOpen = item.key === 'pinned' ? isPinnedOpen : isYourChatsOpen
      const toggleOpen =
        item.key === 'pinned'
          ? () => setIsPinnedOpen((prev) => !prev)
          : () => setIsYourChatsOpen((prev) => !prev)

      return (
        <div className="sidebar-section-label" onClick={toggleOpen} role="button" aria-expanded={isOpen}>
          {item.icon === 'pin' && <Pin size={11} className="sidebar-section-label__icon" />}
          <span className="sidebar-section-label__name">{item.label}</span>
          <ChevronDown
            size={10}
            className={`sidebar-section-label__chevron ${isOpen ? 'sidebar-section-label__chevron--open' : 'sidebar-section-label__chevron--closed'}`}
          />
        </div>
      )
    },
    [dragOverFolderId, isPinnedOpen, isYourChatsOpen, onDropSessionToFolder, onOpenFolder, selectedFolderId]
  )

  const renderItem = React.useCallback(
    (_index: number, item: SidebarListItem) => {
      if (item.type === 'folder-heading') {
        return (
          <div className="sidebar-header__btn sidebar-folders-heading" aria-label="Folders">
            <span className="sidebar-folders-heading__label">{item.label}</span>
            <span className="sidebar-section-label__actions">
              <button
                type="button"
                className="sidebar-section-label__action"
                aria-label="New folder"
                title="New folder"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onCreateFolder()
                }}
              >
                <Plus size={12} />
              </button>
              <button
                type="button"
                className="sidebar-section-label__action"
                aria-label="View folders"
                title="View folders"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onOpenFolders()
                }}
              >
                <SettingsIcon size={12} />
              </button>
            </span>
          </div>
        )
      }

      if (item.type === 'section') {
        return renderSectionHeader(item)
      }

      return renderChatRow(item.session, item.indented)
    },
    [onCreateFolder, onOpenFolders, renderChatRow, renderSectionHeader]
  )

  const renderUtilityAction = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void
  ) => (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      className="sidebar-header__btn sidebar-chatlist__utility-action"
    >
      <span className="sidebar-header__icon-slot" aria-hidden="true">
        {icon}
      </span>
      <span className="sidebar-header__label">{label}</span>
    </div>
  )

  return (
    <>
      <div className="sidebar-chatlist">
        <div
          className="sidebar-chatlist__scroller"
          role="listbox"
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          <div
            className="sidebar-chatlist__listbox"
            style={{ paddingBottom: bottomPadding }}
          >
            {(remindersEnabled || artifactsEnabled) && (
              <div className="sidebar-chatlist__utility-actions">
                {remindersEnabled
                  ? renderUtilityAction(
                      'Reminders',
                      <Bell size={16} className="sidebar-header__icon" />,
                      onOpenReminders
                    )
                  : null}
                {artifactsEnabled
                  ? renderUtilityAction(
                      'Artifacts',
                      <FileText size={16} className="sidebar-header__icon" />,
                      onOpenArtifacts
                    )
                  : null}
              </div>
            )}
            {sidebarItems.map((item, index) => (
              <React.Fragment key={item.key}>{renderItem(index, item)}</React.Fragment>
            ))}
          </div>
        </div>
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

      <FolderNameDialog
        open={renameFolderId !== null}
        mode="rename"
        currentName={folders.find((folder) => folder.id === renameFolderId)?.name ?? ''}
        onOpenChange={(open) => {
          if (!open) {
            setRenameFolderId(null)
          }
        }}
        onConfirm={(name) => {
          if (renameFolderId) {
            onRenameFolder(renameFolderId, name)
          }
          setRenameFolderId(null)
        }}
      />

      <DeleteFolderAlertDialog
        open={deleteFolderId !== null}
        folderName={folders.find((folder) => folder.id === deleteFolderId)?.name ?? ''}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteFolderId(null)
          }
        }}
        onConfirm={() => {
          if (deleteFolderId) {
            onDeleteFolder(deleteFolderId)
          }
          setDeleteFolderId(null)
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

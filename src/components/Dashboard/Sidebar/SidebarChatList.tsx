import React from 'react'
import ChatRow from './ChatRow'
import type { ChatRowAction } from './ChatRow'
import ChatRowContextMenu from './ChatRowContextMenu'
import { SidebarChatListDialogs } from './SidebarChatListDialogs'
import { SidebarSectionToggle } from './SidebarSectionToggle'
import {
  Bell,
  Brain,
  ChevronDown,
  Edit2,
  FileText,
  FolderOpen,
  Plus,
  SettingsIcon,
  Trash2,
} from '../../icons'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { TooltipIconButton } from '@/components/ui/TooltipIconButton'
import type { GroupedSessions } from './utils/groupSessions'
import type { ChatSession, Folder } from '../../../chat/types'
import type { ChatSelectedOverlayStyle } from '../../../contexts/SettingsUIContext'
import {
  buildSidebarListItems,
  buildTimeGroups,
  type SidebarListItem,
} from './sidebarChatListModel'
import { FOLDERS_SECTION_ENABLED } from '../foldersFeature'

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
  onSetFolderMemoryMode: (folderId: string, memoryMode: Folder['memoryMode']) => void
  onRenameConfirm: (id: string, newTitle: string) => void
  onDropSessionToFolder: (sessionId: string, folderId: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

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
  onSetFolderMemoryMode,
  onRenameConfirm,
  onDropSessionToFolder,
  onKeyDown,
}: SidebarChatListProps) {
  const [renameSessionId, setRenameSessionId] = React.useState<string | null>(null)
  const [renameFolderId, setRenameFolderId] = React.useState<string | null>(null)
  const [deleteFolderId, setDeleteFolderId] = React.useState<string | null>(null)
  const [isPinnedOpen, setIsPinnedOpen] = React.useState(true)
  const [isProjectsOpen, setIsProjectsOpen] = React.useState(true)
  const [isYourChatsOpen, setIsYourChatsOpen] = React.useState(true)
  const [dragOverFolderId, setDragOverFolderId] = React.useState<string | null>(null)

  const timeGroups = React.useMemo(() => buildTimeGroups(groupedSessions), [groupedSessions])

  const sidebarItems = React.useMemo<SidebarListItem[]>(() => {
    return buildSidebarListItems({
      groupedSessions,
      folders,
      timeGroups,
      open: { pinned: isPinnedOpen, projects: isProjectsOpen, recents: isYourChatsOpen },
      foldersSectionEnabled: FOLDERS_SECTION_ENABLED,
    })
  }, [
    folders,
    groupedSessions.folders,
    groupedSessions.pinned,
    isPinnedOpen,
    isProjectsOpen,
    isYourChatsOpen,
    timeGroups,
  ])

  const renderChatRow = React.useCallback(
    (session: ChatSession, indented = false) => {
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
          currentFolderId={FOLDERS_SECTION_ENABLED ? (session.folderId ?? null) : null}
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
    },
    [
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
    ]
  )

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
            </div>
          </div>
        )

        const currentMemoryMode =
          item.folder.memoryMode === 'folder-only' ? 'folder-only' : 'default'

        return (
          <ContextMenu>
            <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => setRenameFolderId(item.folder!.id)}>
                <Edit2 size={14} />
                Rename
              </ContextMenuItem>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Brain size={14} />
                  Memory mode
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuRadioGroup
                    value={currentMemoryMode}
                    onValueChange={(value) => {
                      if (value === 'default' || value === 'folder-only') {
                        onSetFolderMemoryMode(item.folder!.id, value)
                      }
                    }}
                  >
                    <ContextMenuRadioItem value="default">
                      Default (folder + global)
                    </ContextMenuRadioItem>
                    <ContextMenuRadioItem value="folder-only">Folder-only</ContextMenuRadioItem>
                  </ContextMenuRadioGroup>
                </ContextMenuSubContent>
              </ContextMenuSub>
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
        <SidebarSectionToggle
          label={item.label}
          icon={item.icon === 'pin' ? 'pin' : undefined}
          isOpen={isOpen}
          onToggle={toggleOpen}
        />
      )
    },
    [
      dragOverFolderId,
      isPinnedOpen,
      isYourChatsOpen,
      onDropSessionToFolder,
      onOpenFolder,
      onSetFolderMemoryMode,
      selectedFolderId,
    ]
  )

  const renderItem = React.useCallback(
    (_index: number, item: SidebarListItem) => {
      if (item.type === 'folder-heading') {
        return (
          <div
            className="sidebar-header__btn sidebar-folders-heading"
            aria-label="Projects"
            role="button"
            tabIndex={0}
            aria-expanded={isProjectsOpen}
            onClick={() => setIsProjectsOpen((prev) => !prev)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setIsProjectsOpen((prev) => !prev)
              }
            }}
          >
            <ChevronDown
              size={10}
              className={`sidebar-section-label__chevron sidebar-folders-heading__chevron ${isProjectsOpen ? 'sidebar-section-label__chevron--open' : 'sidebar-section-label__chevron--closed'}`}
            />
            <span className="sidebar-folders-heading__label">{item.label}</span>
            <span className="sidebar-section-label__actions">
              <TooltipIconButton
                className="sidebar-section-label__action"
                tooltip="New folder"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onCreateFolder()
                }}
              >
                <Plus size={12} />
              </TooltipIconButton>
              <TooltipIconButton
                className="sidebar-section-label__action"
                tooltip="View folders"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onOpenFolders()
                }}
              >
                <SettingsIcon size={12} />
              </TooltipIconButton>
            </span>
          </div>
        )
      }

      if (item.type === 'section') {
        return renderSectionHeader(item)
      }

      return renderChatRow(item.session, item.indented)
    },
    [isProjectsOpen, onCreateFolder, onOpenFolders, renderChatRow, renderSectionHeader]
  )

  const renderUtilityAction = (label: string, icon: React.ReactNode, onClick: () => void) => (
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
          <div className="sidebar-chatlist__listbox" style={{ paddingBottom: bottomPadding }}>
            {(remindersEnabled || artifactsEnabled) && (
              <div className="sidebar-chatlist__utility-actions">
                {remindersEnabled
                  ? renderUtilityAction(
                      'Schedules',
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

      <SidebarChatListDialogs
        folders={folders}
        sessions={flatVisibleSessions}
        renameSessionId={renameSessionId}
        renameFolderId={renameFolderId}
        deleteFolderId={deleteFolderId}
        onRenameSessionClose={() => setRenameSessionId(null)}
        onRenameFolderClose={() => setRenameFolderId(null)}
        onDeleteFolderClose={() => setDeleteFolderId(null)}
        onRenameSession={onRenameConfirm}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
      />
    </>
  )
}

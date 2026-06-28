import { memo, useState } from 'react'
import SidebarHeader from './Sidebar/SidebarHeader'
import SidebarChatList from './Sidebar/SidebarChatList'
import FolderNameDialog from './Sidebar/FolderNameDialog'
import type { ChatRowAction } from './Sidebar/ChatRow'
import type { GroupedSessions } from './Sidebar/utils/groupSessions'
import type { ChatSession, Folder } from '../../chat/types'
import type { ChatSelectedOverlayStyle } from '../../contexts/SettingsUIContext'

interface SidebarChatViewProps {
  active: boolean
  groupedSessions: GroupedSessions
  folders: Folder[]
  chatSelectedOverlayStyle: ChatSelectedOverlayStyle
  currentSessionId: string | null
  focusIndex: number
  flatVisibleSessions: ChatSession[]
  sessionIndexMap: Map<string, number>
  bottomPadding: number
  remindersEnabled: boolean
  artifactsEnabled: boolean
  onNewChat: () => void
  onCreateFolder: (name: string) => void
  onOpenSearch: () => void
  onOpenReminders: () => void
  onOpenArtifacts: () => void
  onSelectSession: (sessionId: string) => void
  onContextAction: (action: ChatRowAction, sessionId: string) => void
  onAssignFolder: (sessionId: string, folderId: string) => void
  onRemoveFromFolder: (sessionId: string) => void
  onRenameFolder: (folderId: string, name: string) => void
  onDeleteFolder: (folderId: string) => void
  onRenameConfirm: (id: string, newTitle: string) => void
  onDropSessionToFolder: (sessionId: string, folderId: string) => void
  onKeyDown: (event: React.KeyboardEvent) => void
}

function SidebarChatView({
  active,
  groupedSessions,
  folders,
  chatSelectedOverlayStyle,
  currentSessionId,
  focusIndex,
  flatVisibleSessions,
  sessionIndexMap,
  bottomPadding,
  remindersEnabled,
  artifactsEnabled,
  onNewChat,
  onCreateFolder,
  onOpenSearch,
  onOpenReminders,
  onOpenArtifacts,
  onSelectSession,
  onContextAction,
  onAssignFolder,
  onRemoveFromFolder,
  onRenameFolder,
  onDeleteFolder,
  onRenameConfirm,
  onDropSessionToFolder,
  onKeyDown,
}: SidebarChatViewProps) {
  const [createFolderOpen, setCreateFolderOpen] = useState(false)

  return (
    <div className={`sidebar-view sidebar-view--chat ${active ? 'active' : 'inactive'}`}>
      <SidebarHeader
        onNewChat={onNewChat}
        onCreateFolder={() => setCreateFolderOpen(true)}
        onOpenSearch={onOpenSearch}
      />

      <SidebarChatList
        groupedSessions={groupedSessions}
        folders={folders}
        chatSelectedOverlayStyle={chatSelectedOverlayStyle}
        isFrosted={false}
        currentSessionId={currentSessionId}
        streamingSessionId={null}
        focusIndex={focusIndex}
        flatVisibleSessions={flatVisibleSessions}
        sessionIndexMap={sessionIndexMap}
        bottomPadding={bottomPadding}
        remindersEnabled={remindersEnabled}
        artifactsEnabled={artifactsEnabled}
        onOpenReminders={onOpenReminders}
        onOpenArtifacts={onOpenArtifacts}
        onSelectSession={onSelectSession}
        onContextAction={onContextAction}
        onAssignFolder={onAssignFolder}
        onRemoveFromFolder={onRemoveFromFolder}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
        onRenameConfirm={onRenameConfirm}
        onDropSessionToFolder={onDropSessionToFolder}
        onKeyDown={onKeyDown}
      />

      <FolderNameDialog
        open={createFolderOpen}
        mode="create"
        onOpenChange={setCreateFolderOpen}
        onConfirm={onCreateFolder}
      />
    </div>
  )
}

export default memo(SidebarChatView)

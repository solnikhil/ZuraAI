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
  selectedFolderId: string | null
  chatSelectedOverlayStyle: ChatSelectedOverlayStyle
  currentSessionId: string | null
  focusIndex: number
  flatVisibleSessions: ChatSession[]
  sessionIndexMap: Map<string, number>
  bottomPadding: number
  remindersEnabled: boolean
  artifactsEnabled: boolean
  onNewChat: () => void
  onCreateFolder: (name: string, memoryMode?: Folder['memoryMode']) => void
  onOpenSearch: () => void
  onOpenReminders: () => void
  onOpenArtifacts: () => void
  onOpenFolders: () => void
  onOpenFolder: (folderId: string) => void
  onSelectSession: (sessionId: string) => void
  onContextAction: (action: ChatRowAction, sessionId: string) => void
  onAssignFolder: (sessionId: string, folderId: string) => void
  onRemoveFromFolder: (sessionId: string) => void
  onRenameFolder: (folderId: string, name: string) => void
  onDeleteFolder: (folderId: string) => void
  onSetFolderMemoryMode: (folderId: string, memoryMode: Folder['memoryMode']) => void
  onRenameConfirm: (id: string, newTitle: string) => void
  onDropSessionToFolder: (sessionId: string, folderId: string) => void
  onKeyDown: (event: React.KeyboardEvent) => void
}

function SidebarChatView({
  active,
  groupedSessions,
  folders,
  selectedFolderId,
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
  onOpenFolders,
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
}: SidebarChatViewProps) {
  const [createFolderOpen, setCreateFolderOpen] = useState(false)

  return (
    <div className={`sidebar-view sidebar-view--chat ${active ? 'active' : 'inactive'}`}>
      <SidebarHeader onNewChat={onNewChat} onOpenSearch={onOpenSearch} />

      <SidebarChatList
        groupedSessions={groupedSessions}
        folders={folders}
        selectedFolderId={selectedFolderId}
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
        onOpenFolders={onOpenFolders}
        onCreateFolder={() => setCreateFolderOpen(true)}
        onOpenFolder={onOpenFolder}
        onSelectSession={onSelectSession}
        onContextAction={onContextAction}
        onAssignFolder={onAssignFolder}
        onRemoveFromFolder={onRemoveFromFolder}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
        onSetFolderMemoryMode={onSetFolderMemoryMode}
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

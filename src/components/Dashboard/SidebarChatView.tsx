import { memo } from 'react'
import SidebarHeader from './Sidebar/SidebarHeader'
import SidebarChatList from './Sidebar/SidebarChatList'
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
  onOpenSearch: () => void
  onOpenReminders: () => void
  onOpenArtifacts: () => void
  onSelectSession: (sessionId: string) => void
  onContextAction: (action: ChatRowAction, sessionId: string) => void
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
  onOpenSearch,
  onOpenReminders,
  onOpenArtifacts,
  onSelectSession,
  onContextAction,
  onRenameConfirm,
  onDropSessionToFolder,
  onKeyDown,
}: SidebarChatViewProps) {
  return (
    <div className={`sidebar-view sidebar-view--chat ${active ? 'active' : 'inactive'}`}>
      <SidebarHeader
        onNewChat={onNewChat}
        onOpenSearch={onOpenSearch}
        onOpenReminders={onOpenReminders}
        onOpenArtifacts={onOpenArtifacts}
        remindersEnabled={remindersEnabled}
        artifactsEnabled={artifactsEnabled}
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
        onSelectSession={onSelectSession}
        onContextAction={onContextAction}
        onRenameConfirm={onRenameConfirm}
        onDropSessionToFolder={onDropSessionToFolder}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}

export default memo(SidebarChatView)

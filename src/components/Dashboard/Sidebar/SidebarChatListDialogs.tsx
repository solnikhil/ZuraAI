import React from 'react'
import type { ChatSession, Folder } from '../../../chat/types'
import DeleteFolderAlertDialog from './DeleteFolderAlertDialog'
import FolderNameDialog from './FolderNameDialog'
import RenameChatDialog from './RenameChatDialog'

interface SidebarChatListDialogsProps {
  folders: Folder[]
  sessions: ChatSession[]
  renameSessionId: string | null
  renameFolderId: string | null
  deleteFolderId: string | null
  onRenameSessionClose: () => void
  onRenameFolderClose: () => void
  onDeleteFolderClose: () => void
  onRenameSession: (sessionId: string, title: string) => void
  onRenameFolder: (folderId: string, name: string) => void
  onDeleteFolder: (folderId: string) => void
}

export function SidebarChatListDialogs({
  folders,
  sessions,
  renameSessionId,
  renameFolderId,
  deleteFolderId,
  onRenameSessionClose,
  onRenameFolderClose,
  onDeleteFolderClose,
  onRenameSession,
  onRenameFolder,
  onDeleteFolder,
}: SidebarChatListDialogsProps): React.ReactElement {
  return (
    <>
      <FolderNameDialog
        open={renameFolderId !== null}
        mode="rename"
        currentName={folders.find((folder) => folder.id === renameFolderId)?.name ?? ''}
        onOpenChange={(open) => {
          if (!open) onRenameFolderClose()
        }}
        onConfirm={(name) => {
          if (renameFolderId) onRenameFolder(renameFolderId, name)
          onRenameFolderClose()
        }}
      />

      <DeleteFolderAlertDialog
        open={deleteFolderId !== null}
        folderName={folders.find((folder) => folder.id === deleteFolderId)?.name ?? ''}
        onOpenChange={(open) => {
          if (!open) onDeleteFolderClose()
        }}
        onConfirm={() => {
          if (deleteFolderId) onDeleteFolder(deleteFolderId)
          onDeleteFolderClose()
        }}
      />

      <RenameChatDialog
        open={renameSessionId !== null}
        onOpenChange={(open) => {
          if (!open) onRenameSessionClose()
        }}
        currentTitle={sessions.find((session) => session.id === renameSessionId)?.title ?? ''}
        onConfirm={(newTitle) => {
          if (renameSessionId) onRenameSession(renameSessionId, newTitle)
          onRenameSessionClose()
        }}
      />
    </>
  )
}

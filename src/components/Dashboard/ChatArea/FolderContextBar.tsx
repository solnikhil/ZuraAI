/**
 * Slim context bar shown above the message list when the active chat
 * belongs to a folder (Requirement 7). Gives the In_Folder_Chat_View a
 * visual treatment distinct from a null-folder chat, surfaces a
 * "folder-only memory" indicator when applicable, and lets the user jump
 * back to the Folders_View for that folder.
 *
 * Display-only: reads folder name/memory-mode from already-loaded chat
 * history state and navigates via AppShellContext. No new data fetch or IPC.
 */
import { FolderOpen, Lock } from 'lucide-react'
import './FolderContextBar.css'

export interface FolderContextBarProps {
  folderName: string
  isFolderOnly: boolean
  onOpenFolder: () => void
}

export function FolderContextBar({ folderName, isFolderOnly, onOpenFolder }: FolderContextBarProps) {
  return (
    <div className="folder-context-bar" role="note">
      <button
        type="button"
        className="folder-context-bar__label"
        onClick={onOpenFolder}
        aria-label={`Open folder ${folderName}`}
        title={folderName}
      >
        <FolderOpen className="folder-context-bar__icon" size={14} aria-hidden="true" />
        <span className="folder-context-bar__name">{folderName}</span>
      </button>
      {isFolderOnly && (
        <span className="folder-context-bar__badge">
          <Lock size={11} aria-hidden="true" />
          Folder-only memory
        </span>
      )}
    </div>
  )
}

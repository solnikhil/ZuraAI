import { FileEdit, FolderOpen, Search } from '../../icons'

interface SidebarHeaderProps {
  onNewChat: () => void
  onCreateFolder: () => void
  onOpenSearch: () => void
}

export default function SidebarHeader({
  onNewChat,
  onCreateFolder,
  onOpenSearch,
}: SidebarHeaderProps) {
  return (
    <div className="sidebar-header">
      <div
        role="button"
        tabIndex={0}
        onClick={onNewChat}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onNewChat()
          }
        }}
        className="sidebar-header__btn"
      >
        <span className="sidebar-header__icon-slot" aria-hidden="true">
          <FileEdit size={16} className="sidebar-header__icon sidebar-header__icon--new-chat" />
        </span>
        <span className="sidebar-header__label">New chat</span>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={onCreateFolder}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onCreateFolder()
          }
        }}
        className="sidebar-header__btn"
      >
        <span className="sidebar-header__icon-slot" aria-hidden="true">
          <FolderOpen size={16} className="sidebar-header__icon" />
        </span>
        <span className="sidebar-header__label">New folder</span>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={onOpenSearch}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpenSearch()
          }
        }}
        className="sidebar-header__btn"
      >
        <span className="sidebar-header__icon-slot" aria-hidden="true">
          <Search size={16} className="sidebar-header__icon sidebar-header__icon--search" />
        </span>
        <span className="sidebar-header__label">Search chats</span>
      </div>
    </div>
  )
}

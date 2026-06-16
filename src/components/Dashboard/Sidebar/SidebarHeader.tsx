import { Bell, FileEdit, Search } from '../../icons'

interface SidebarHeaderProps {
  onNewChat: () => void
  onOpenSearch: () => void
  onOpenReminders?: () => void
  remindersEnabled?: boolean
}

export default function SidebarHeader({
  onNewChat,
  onOpenSearch,
  onOpenReminders,
  remindersEnabled = false,
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

      {remindersEnabled && onOpenReminders ? (
        <div
          role="button"
          tabIndex={0}
          onClick={onOpenReminders}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpenReminders()
            }
          }}
          className="sidebar-header__btn"
        >
          <span className="sidebar-header__icon-slot" aria-hidden="true">
            <Bell size={16} className="sidebar-header__icon" />
          </span>
          <span className="sidebar-header__label">Reminders</span>
        </div>
      ) : null}
    </div>
  )
}

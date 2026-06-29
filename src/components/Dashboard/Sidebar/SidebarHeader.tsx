import type { ReactNode } from 'react'
import { FileEdit, Search } from '../../icons'

interface SidebarHeaderProps {
  onNewChat: () => void
  onOpenSearch: () => void
}

function HeaderAction({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
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
      className="sidebar-header__btn"
    >
      <span className="sidebar-header__icon-slot" aria-hidden="true">
        {icon}
      </span>
      <span className="sidebar-header__label">{label}</span>
    </div>
  )
}

export default function SidebarHeader({ onNewChat, onOpenSearch }: SidebarHeaderProps) {
  return (
    <div className="sidebar-header">
      <HeaderAction
        label="New chat"
        onClick={onNewChat}
        icon={<FileEdit size={16} className="sidebar-header__icon sidebar-header__icon--new-chat" />}
      />
      <HeaderAction
        label="Search chats"
        onClick={onOpenSearch}
        icon={<Search size={16} className="sidebar-header__icon sidebar-header__icon--search" />}
      />
    </div>
  )
}
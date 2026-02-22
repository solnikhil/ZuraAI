import { FileEdit, Search } from '../../icons'

interface SidebarHeaderProps {
    onNewChat: () => void
    onOpenSearch: () => void
}

export default function SidebarHeader({
    onNewChat,
    onOpenSearch,
}: SidebarHeaderProps) {
    return (
        <div className="sidebar-header">
            <button
                type="button"
                onClick={onNewChat}
                className="sidebar-header__btn"
            >
                <span className="sidebar-header__icon-slot" aria-hidden="true">
                    <FileEdit size={16} className="sidebar-header__icon sidebar-header__icon--new-chat" />
                </span>
                <span className="sidebar-header__label">New chat</span>
            </button>

            <button
                type="button"
                onClick={onOpenSearch}
                className="sidebar-header__btn"
            >
                <span className="sidebar-header__icon-slot" aria-hidden="true">
                    <Search size={16} className="sidebar-header__icon sidebar-header__icon--search" />
                </span>
                <span className="sidebar-header__label">Search chats</span>
            </button>
        </div>
    )
}

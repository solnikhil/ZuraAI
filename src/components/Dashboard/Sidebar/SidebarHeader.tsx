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
                onClick={onNewChat}
                className="sidebar-header__btn sidebar-header__btn--primary"
            >
                <FileEdit size={15} className="sidebar-header__icon" />
                <span style={{ textAlign: 'left' }}>New chat</span>
            </button>

            <button
                type="button"
                onClick={onOpenSearch}
                className="sidebar-header__btn"
            >
                <Search size={15} className="sidebar-header__icon" />
                <span style={{ textAlign: 'left' }}>Search chats</span>
            </button>
        </div>
    )
}

import { SettingsIcon } from '../../icons'

interface SidebarFooterProps {
    onOpenSettings: () => void
}

export default function SidebarFooter({
    onOpenSettings,
}: SidebarFooterProps) {
    return (
        <div className="sidebar-footer">
            <button
                type="button"
                title="Settings"
                onClick={onOpenSettings}
                className="sidebar-footer__btn"
            >
                <SettingsIcon size={16} strokeWidth={2} />
                Settings
            </button>
        </div>
    )
}

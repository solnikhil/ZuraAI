import { SettingsIcon } from '../../icons'
import { useSettingsUI } from '../../../contexts/SettingsUIContext'

interface SidebarFooterProps {
    onOpenSettings: () => void
}

export default function SidebarFooter({
    onOpenSettings,
}: SidebarFooterProps) {
    const { settingsUI } = useSettingsUI()
    const isFrosted = settingsUI.frostedSidebar
    const baseBackground = isFrosted
        ? 'rgba(14, 16, 20, 0.75)'
        : 'var(--theme-surface)'
    const hoverBackground = isFrosted
        ? 'rgba(18, 20, 26, 0.82)'
        : 'var(--theme-surface)'
    const baseBorder = isFrosted ? 'rgba(255, 255, 255, 0.14)' : 'var(--theme-border)'
    const hoverBorder = isFrosted ? 'rgba(255, 255, 255, 0.22)' : 'var(--theme-border-hover)'
    const baseShadow = isFrosted
        ? '0 6px 16px rgba(0, 0, 0, 0.35)'
        : '0 6px 14px rgba(0, 0, 0, 0.18)'
    const hoverShadow = isFrosted
        ? '0 8px 18px rgba(0, 0, 0, 0.4)'
        : '0 8px 16px rgba(0, 0, 0, 0.22)'

    return (
        <div style={{
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: '6px',
            minWidth: 0,
        }}>
            <button
                type="button"
                title="Settings"
                onClick={onOpenSettings}
                style={{
                    width: '100%',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: '10px',
                    border: `1px solid ${baseBorder}`,
                    background: baseBackground,
                    color: 'var(--theme-text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    minWidth: 0,
                    overflow: 'hidden',
                    boxShadow: baseShadow,
                    backdropFilter: isFrosted ? 'blur(12px)' : 'none',
                    WebkitBackdropFilter: isFrosted ? 'blur(12px)' : 'none',
                    transition: 'background 0.15s ease, border-color 0.15s ease, transform 0.12s ease, box-shadow 0.15s ease',
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = hoverBackground
                    e.currentTarget.style.borderColor = hoverBorder
                    e.currentTarget.style.boxShadow = hoverShadow
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = baseBackground
                    e.currentTarget.style.borderColor = baseBorder
                    e.currentTarget.style.boxShadow = baseShadow
                }}
                onMouseDown={e => { e.currentTarget.style.transform = 'translateY(1px)' }}
                onMouseUp={e => { e.currentTarget.style.transform = 'translateY(0)' }}
            >
                <SettingsIcon size={16} strokeWidth={2} />
                Settings
            </button>
        </div>
    )
}

import React from 'react'
import { FileEdit, Search } from '../../icons'
import { useSettingsUI } from '../../../contexts/SettingsUIContext'

interface SidebarHeaderProps {
    onNewChat: () => void
    onOpenSearch: () => void
}

export default function SidebarHeader({
    onNewChat,
    onOpenSearch,
}: SidebarHeaderProps) {
    const { settingsUI } = useSettingsUI()
    const isFrosted = settingsUI.frostedSidebar
    const baseBackground = 'transparent'
    const hoverBackground = isFrosted
        ? 'color-mix(in srgb, var(--theme-surface-hover) 72%, transparent)'
        : 'var(--theme-surface-hover)'
    const baseBorder = '1px solid transparent'
    const hoverBorder = isFrosted
        ? '1px solid color-mix(in srgb, var(--theme-border) 68%, transparent)'
        : '1px solid transparent'

    const itemBaseStyle: React.CSSProperties = {
        width: '100%',
        height: '34px',
        border: baseBorder,
        borderRadius: '10px',
        appearance: 'none',
        WebkitAppearance: 'none',
        background: baseBackground,
        backgroundColor: 'transparent',
        color: 'var(--theme-text-primary)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '0 8px',
        fontSize: '0.84rem',
        fontWeight: 500,
        transition: 'background 0.12s ease, border-color 0.12s ease, color 0.12s ease',
        boxSizing: 'border-box',
        outline: 'none',
    }

    return (
        <div style={{
            padding: '10px 8px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            borderBottom: 'none',
            background: isFrosted
                ? 'transparent'
                : 'color-mix(in srgb, var(--theme-surface) 94%, transparent)',
        }}>
            <button
                onClick={onNewChat}
                style={{
                    ...itemBaseStyle,
                    cursor: 'pointer',
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = hoverBackground
                    e.currentTarget.style.border = hoverBorder
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = baseBackground
                    e.currentTarget.style.border = baseBorder
                }}
            >
                <FileEdit size={15} style={{ color: 'var(--theme-text-secondary)', flexShrink: 0 }} />
                <span style={{ textAlign: 'left' }}>New chat</span>
            </button>

            <button
                type="button"
                onClick={onOpenSearch}
                style={{
                    ...itemBaseStyle,
                    cursor: 'pointer',
                    textAlign: 'left',
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = hoverBackground
                    e.currentTarget.style.border = hoverBorder
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = baseBackground
                    e.currentTarget.style.border = baseBorder
                }}
            >
                <Search size={15} style={{ color: 'var(--theme-text-secondary)', flexShrink: 0 }} />
                <span style={{ textAlign: 'left' }}>Search chats</span>
            </button>
        </div>
    )
}

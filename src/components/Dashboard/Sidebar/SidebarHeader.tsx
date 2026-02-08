import React from 'react'
import { Plus, Search, X } from '../../icons'

interface SidebarHeaderProps {
    onNewChat: () => void
    searchQuery: string
    onSearchChange: (query: string) => void
}

export default function SidebarHeader({
    onNewChat,
    searchQuery,
    onSearchChange,
}: SidebarHeaderProps) {
    return (
        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {/* New Chat Button */}
            <button
                onClick={onNewChat}
                style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid var(--theme-border)',
                    borderRadius: '8px',
                    background: 'transparent',
                    color: 'var(--theme-text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--theme-surface-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
                <Plus size={16} />
                <span style={{ flex: 1, textAlign: 'left' }}>New chat</span>
                <kbd style={{
                    fontSize: '0.65rem',
                    padding: '2px 5px',
                    borderRadius: '4px',
                    background: 'var(--theme-surface-active)',
                    color: 'var(--theme-text-muted)',
                    border: '1px solid var(--theme-border)',
                    fontFamily: 'inherit',
                }}>
                    Ctrl+N
                </kbd>
            </button>

            {/* Inline Search */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--theme-surface-active)',
                border: '1px solid var(--theme-border)',
                borderRadius: '8px',
                padding: '6px 8px',
                gap: '6px',
            }}>
                <Search size={14} style={{ color: 'var(--theme-text-muted)', flexShrink: 0 }} />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search chats"
                    data-sidebar-search
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--theme-text-primary)',
                        fontSize: '0.8rem',
                        width: '100%',
                        outline: 'none',
                        fontFamily: 'inherit',
                    }}
                />
                {searchQuery && (
                    <X
                        size={14}
                        style={{ cursor: 'pointer', color: 'var(--theme-text-muted)', flexShrink: 0 }}
                        onClick={() => onSearchChange('')}
                    />
                )}
            </div>
        </div>
    )
}

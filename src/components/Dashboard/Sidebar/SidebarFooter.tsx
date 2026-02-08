import React from 'react'
import { SettingsIcon } from '../../icons'

interface SidebarFooterProps {
    currentModel: string
    onOpenSettings: () => void
}

export default function SidebarFooter({
    currentModel,
    onOpenSettings,
}: SidebarFooterProps) {
    const displayModel = currentModel.includes('/')
        ? currentModel.split('/').pop() || currentModel
        : currentModel

    return (
        <div style={{
            marginTop: 'auto',
            borderTop: '1px solid var(--theme-border)',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: '4px',
            minWidth: 0,
        }}>
            {/* Model indicator */}
            <div style={{
                fontSize: '0.65rem',
                color: 'var(--theme-text-muted)',
                padding: '0 8px 2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
            }}>
                {displayModel}
            </div>

            {/* Settings button */}
            <button
                onClick={onOpenSettings}
                title="Settings"
                style={{
                    width: '100%',
                    padding: '8px',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--theme-text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: '10px',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    minWidth: 0,
                    overflow: 'hidden',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--theme-surface-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
                <div style={{
                    width: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    <SettingsIcon size={18} strokeWidth={2} />
                </div>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Settings</span>
            </button>
        </div>
    )
}

import React from 'react'

const keyBadgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: '0.7rem',
    fontWeight: 500,
    fontFamily: 'inherit',
    lineHeight: 1,
    background: 'var(--theme-surface-active)',
    border: '1px solid var(--theme-border)',
    color: 'var(--theme-text-secondary)',
}

const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem',
    color: 'var(--theme-text-muted)',
}

const groupStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
}

const footerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '6px 12px',
    borderTop: '1px solid var(--theme-border)',
    flexShrink: 0,
}

export default function CommandPaletteFooter() {
    return (
        <div style={footerStyle} aria-hidden="true">
            <span style={groupStyle}>
                <kbd style={keyBadgeStyle}>↑↓</kbd>
                <span style={labelStyle}>Navigate</span>
            </span>
            <span style={groupStyle}>
                <kbd style={keyBadgeStyle}>↵</kbd>
                <span style={labelStyle}>Select</span>
            </span>
            <span style={groupStyle}>
                <kbd style={keyBadgeStyle}>Esc</kbd>
                <span style={labelStyle}>Close</span>
            </span>
        </div>
    )
}

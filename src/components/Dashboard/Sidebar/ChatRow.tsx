import React, { useState, useRef, useEffect } from 'react'
import { Ellipsis } from '../../icons'
import type { ChatSession } from '../../../contexts/ChatHistoryContext'
import type { ChatSelectedOverlayStyle } from '../../../contexts/SettingsUIContext'

export type ChatRowAction = 'rename' | 'pin' | 'unpin' | 'archive' | 'delete' | 'duplicate'

interface ChatRowProps {
    session: ChatSession
    selectedOverlayStyle: ChatSelectedOverlayStyle
    isActive: boolean
    isMenuOpen: boolean
    isFocused: boolean
    isStreaming: boolean
    isRenaming: boolean
    onSelect: (id: string) => void
    onRenameStart: (id: string) => void
    onRenameConfirm: (id: string, newTitle: string) => void
    onRenameCancel: () => void
    onMoreClick: (e: React.MouseEvent, sessionId: string) => void
}

function getSelectedOverlayStyles(style: ChatSelectedOverlayStyle) {
    switch (style) {
        case 'notion':
            return {
                background: 'color-mix(in srgb, var(--theme-surface-hover) 82%, transparent)',
                border: '1px solid transparent',
                boxShadow: 'none',
            }
        case 'slack':
            return {
                background: 'color-mix(in srgb, var(--theme-accent) 16%, var(--theme-surface-active))',
                border: '1px solid color-mix(in srgb, var(--theme-accent) 28%, transparent)',
                boxShadow: 'none',
            }
        case 'discord':
            return {
                background: 'color-mix(in srgb, var(--theme-surface-active) 92%, var(--theme-surface) 8%)',
                border: '1px solid color-mix(in srgb, var(--theme-border) 62%, transparent)',
                boxShadow: 'none',
            }
        case 'github':
            return {
                background: 'color-mix(in srgb, var(--theme-surface-active) 86%, transparent)',
                border: '1px solid color-mix(in srgb, var(--theme-border) 78%, transparent)',
                boxShadow: 'none',
            }
        case 'linear':
        default:
            return {
                background: 'color-mix(in srgb, var(--theme-surface-active) 88%, black 12%)',
                border: '1px solid color-mix(in srgb, var(--theme-border-hover) 72%, transparent)',
                boxShadow: 'none',
            }
    }
}

export default function ChatRow({
    session,
    selectedOverlayStyle,
    isActive,
    isMenuOpen,
    isFocused,
    isStreaming,
    isRenaming,
    onSelect,
    onRenameConfirm,
    onRenameCancel,
    onMoreClick,
}: ChatRowProps) {
    const [renameValue, setRenameValue] = useState(session.title)
    const [isHovered, setIsHovered] = useState(false)
    const renameInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isRenaming) {
            setRenameValue(session.title)
            setTimeout(() => renameInputRef.current?.select(), 0)
        }
    }, [isRenaming, session.title])

    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            const trimmed = renameValue.trim()
            onRenameConfirm(session.id, trimmed || session.title)
        } else if (e.key === 'Escape') {
            onRenameCancel()
        }
    }

    const handleRenameBlur = () => {
        const trimmed = renameValue.trim()
        onRenameConfirm(session.id, trimmed || session.title)
    }

    const selectedOverlay = getSelectedOverlayStyles(selectedOverlayStyle)

    return (
        <div
            onClick={() => !isRenaming && onSelect(session.id)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 6px',
                cursor: isRenaming ? 'default' : 'pointer',
                borderRadius: '10px',
                height: '34px',
                boxSizing: 'border-box',
                position: 'relative',
                transition: 'background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease',
                background: isActive
                    ? selectedOverlay.background
                    : isFocused
                        ? 'var(--theme-surface-hover)'
                        : isHovered
                            ? 'var(--theme-surface-hover)'
                            : 'transparent',
                border: isActive
                    ? selectedOverlay.border
                    : '1px solid transparent',
                boxShadow: isActive ? selectedOverlay.boxShadow : 'none',
                outline: isFocused ? '1px solid var(--theme-accent)' : 'none',
                outlineOffset: '-1px',
            }}
            data-active={isActive ? 'true' : 'false'}
            role="option"
            aria-selected={isActive}
            tabIndex={-1}
        >
            {/* Content area */}
            <div style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                height: '100%',
            }}>
                {/* Top line: title + actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                    {isRenaming ? (
                        <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={handleRenameKeyDown}
                            onBlur={handleRenameBlur}
                            onClick={e => e.stopPropagation()}
                            style={{
                                flex: 1,
                                background: 'var(--theme-surface-active)',
                                border: '1px solid var(--theme-accent)',
                                borderRadius: '4px',
                                padding: '1px 4px',
                                color: 'var(--theme-text-primary)',
                                fontSize: '0.8rem',
                                fontFamily: 'inherit',
                                outline: 'none',
                                minWidth: 0,
                            }}
                        />
                    ) : (
                        <span style={{
                            flex: 1,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            color: 'var(--theme-text-primary)',
                            minWidth: 0,
                        }}>
                            {session.title}
                        </span>
                    )}

                    {!isRenaming && (
                        isStreaming ? (
                            <div
                                style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    backgroundColor: 'var(--theme-accent)',
                                    animation: 'pulse 1.5s ease-in-out infinite',
                                    marginRight: '5px',
                                    flexShrink: 0,
                                }}
                            />
                        ) : isActive ? (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onMoreClick(e, session.id)
                                }}
                                aria-label="Chat options"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '2px',
                                    borderRadius: '4px',
                                    color: 'var(--theme-text-muted)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: isHovered ? 1 : 0.86,
                                    transition: 'opacity 0.15s ease, background 0.1s ease, color 0.1s ease',
                                    flexShrink: 0,
                                }}
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--theme-surface-active)' }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                            >
                                <Ellipsis size={14} />
                            </button>
                        ) : (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onMoreClick(e, session.id)
                                }}
                                aria-label="Chat options"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '2px',
                                    borderRadius: '4px',
                                    color: 'var(--theme-text-muted)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: isHovered || isMenuOpen ? 1 : 0,
                                    pointerEvents: isHovered || isMenuOpen ? 'auto' : 'none',
                                    transition: 'opacity 0.15s ease, background 0.1s ease, color 0.1s ease',
                                    flexShrink: 0,
                                }}
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--theme-surface-active)' }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                            >
                                <Ellipsis size={14} />
                            </button>
                        )
                    )}
                </div>

            </div>

            {/* Tag badges */}
            {session.tags && session.tags.length > 0 && (
                <div style={{
                    position: 'absolute',
                    bottom: '2px',
                    right: '26px',
                    display: 'flex',
                    gap: '2px',
                }}>
                    {session.tags.slice(0, 2).map(tag => (
                        <span
                            key={tag}
                            style={{
                                fontSize: '0.55rem',
                                padding: '0 3px',
                                borderRadius: '3px',
                                background: 'color-mix(in srgb, var(--theme-accent) 20%, transparent)',
                                color: 'var(--theme-accent)',
                                lineHeight: 1.5,
                            }}
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

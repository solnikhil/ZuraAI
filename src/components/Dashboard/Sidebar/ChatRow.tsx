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

    // Build class list
    const rowClasses = [
        'sidebar-chat-row',
        isActive && 'sidebar-chat-row--active',
        isFocused && 'sidebar-chat-row--focused',
        isRenaming && 'sidebar-chat-row--renaming',
    ].filter(Boolean).join(' ')

    // Active row gets overlay styles applied inline (since they vary by selectedOverlayStyle setting)
    const selectedOverlay = isActive ? getSelectedOverlayStyles(selectedOverlayStyle) : undefined

    // More button visibility class
    const getMoreBtnClass = () => {
        if (isActive) return 'sidebar-chat-row__more-btn sidebar-chat-row__more-btn--always'
        if (isMenuOpen) return 'sidebar-chat-row__more-btn sidebar-chat-row__more-btn--visible'
        return 'sidebar-chat-row__more-btn sidebar-chat-row__more-btn--hidden'
    }

    return (
        <div
            onClick={() => !isRenaming && onSelect(session.id)}
            className={rowClasses}
            style={selectedOverlay ? {
                background: selectedOverlay.background,
                border: selectedOverlay.border,
                boxShadow: selectedOverlay.boxShadow,
            } : undefined}
            data-active={isActive ? 'true' : 'false'}
            role="option"
            aria-selected={isActive}
            tabIndex={-1}
        >
            {/* Content area */}
            <div className="sidebar-chat-row__content">
                {/* Top line: title + actions */}
                <div className="sidebar-chat-row__title-row">
                    {isRenaming ? (
                        <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={handleRenameKeyDown}
                            onBlur={handleRenameBlur}
                            onClick={e => e.stopPropagation()}
                            className="sidebar-chat-row__rename-input"
                        />
                    ) : (
                        <span className="sidebar-chat-row__title">
                            {session.title}
                        </span>
                    )}

                    {!isRenaming && (
                        isStreaming ? (
                            <div className="sidebar-chat-row__streaming-dot" />
                        ) : (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onMoreClick(e, session.id)
                                }}
                                aria-label="Chat options"
                                className={getMoreBtnClass()}
                            >
                                <Ellipsis size={14} />
                            </button>
                        )
                    )}
                </div>
            </div>

            {/* Tag badges */}
            {session.tags && session.tags.length > 0 && (
                <div className="sidebar-chat-row__tags">
                    {session.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="sidebar-chat-row__tag">
                            {tag}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

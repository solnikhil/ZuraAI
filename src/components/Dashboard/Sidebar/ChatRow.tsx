import React, { useState, useRef, useEffect } from 'react'
import { Ellipsis } from '../../icons'
import { formatRelativeTime } from './utils/formatRelativeTime'
import type { ChatSession } from '../../../contexts/ChatHistoryContext'

export type ChatRowAction = 'rename' | 'pin' | 'unpin' | 'archive' | 'delete' | 'duplicate'

interface ChatRowProps {
    session: ChatSession
    isActive: boolean
    isFocused: boolean
    isStreaming: boolean
    isRenaming: boolean
    onSelect: (id: string) => void
    onRenameStart: (id: string) => void
    onRenameConfirm: (id: string, newTitle: string) => void
    onRenameCancel: () => void
    onContextMenu: (e: React.MouseEvent, sessionId: string) => void
    onMoreClick: (e: React.MouseEvent, sessionId: string) => void
}

export default function ChatRow({
    session,
    isActive,
    isFocused,
    isStreaming,
    isRenaming,
    onSelect,
    onRenameConfirm,
    onRenameCancel,
    onContextMenu,
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

    return (
        <div
            onClick={() => !isRenaming && onSelect(session.id)}
            onContextMenu={(e) => onContextMenu(e, session.id)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                padding: '6px 8px',
                paddingLeft: isActive ? '5px' : '8px',
                cursor: isRenaming ? 'default' : 'pointer',
                borderRadius: '8px',
                height: '34px',
                boxSizing: 'border-box',
                position: 'relative',
                transition: 'background 0.12s ease',
                backgroundColor: isActive
                    ? 'color-mix(in srgb, var(--theme-accent) 14%, transparent)'
                    : isFocused
                        ? 'var(--theme-surface-hover)'
                        : isHovered
                            ? 'var(--theme-surface-hover)'
                            : 'transparent',
                borderLeft: isActive ? '3px solid var(--theme-accent)' : '3px solid transparent',
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
                gap: '1px',
                height: '100%',
            }}>
                {/* Top line: title + timestamp */}
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
                            fontWeight: isActive ? 600 : 500,
                            color: 'var(--theme-text-primary)',
                            minWidth: 0,
                        }}>
                            {session.title}
                        </span>
                    )}

                    {!isRenaming && (
                        <span style={{
                            fontSize: '0.65rem',
                            color: 'var(--theme-text-muted)',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                        }}>
                            {formatRelativeTime(session.updatedAt)}
                        </span>
                    )}
                </div>

            </div>

            {/* Right area: streaming dot or more button */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                width: '24px',
                justifyContent: 'center',
                height: '100%',
            }}>
                {isStreaming ? (
                    <div
                        style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--theme-accent)',
                            animation: 'pulse 1.5s ease-in-out infinite',
                        }}
                    />
                ) : (
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            onMoreClick(e, session.id)
                        }}
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
                            opacity: isHovered ? 1 : 0,
                            transition: 'opacity 0.15s ease, background 0.1s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--theme-surface-active)' }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                        <Ellipsis size={14} />
                    </button>
                )}
            </div>

            {/* Tag badges */}
            {session.tags && session.tags.length > 0 && (
                <div style={{
                    position: 'absolute',
                    bottom: '2px',
                    right: '28px',
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

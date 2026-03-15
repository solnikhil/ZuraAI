import React, { useState, useRef, useEffect } from 'react'
import { Ellipsis } from '../../icons'
import type { ChatSession } from '../../../contexts/ChatHistoryContext'
import type { ChatSelectedOverlayStyle } from '../../../contexts/SettingsUIContext'

export type ChatRowAction = 'rename' | 'pin' | 'unpin' | 'delete' | 'duplicate'

interface ChatRowProps {
  session: ChatSession
  selectedOverlayStyle: ChatSelectedOverlayStyle
  isFrosted: boolean
  isActive: boolean
  isMenuOpen: boolean
  isFocused: boolean
  isStreaming: boolean
  isRenaming: boolean
  onSelect: (id: string) => void
  onRenameStart: (id: string) => void
  onRenameConfirm: (id: string, newTitle: string) => void
  onRenameCancel: () => void
  renderMoreButton?: (className: string) => React.ReactNode
}

function getSelectedOverlayStyles(style: ChatSelectedOverlayStyle, isFrosted: boolean) {
  if (isFrosted) {
    const frostedBorder =
      '1px solid color-mix(in srgb, var(--theme-accent) 8%, rgba(255, 255, 255, 0.1))'
    const frostedChipDepth =
      'inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 -1px 0 rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.12)'

    switch (style) {
      case 'notion':
        return {
          background:
            'color-mix(in srgb, var(--theme-accent) 5%, color-mix(in srgb, var(--theme-surface-hover) 90%, rgba(255, 255, 255, 0.1)))',
          border: frostedBorder,
          boxShadow: frostedChipDepth,
        }
      case 'slack':
        return {
          background:
            'color-mix(in srgb, var(--theme-accent) 10%, color-mix(in srgb, var(--theme-surface-active) 90%, rgba(255, 255, 255, 0.09)))',
          border: frostedBorder,
          boxShadow: frostedChipDepth,
        }
      case 'discord':
        return {
          background:
            'color-mix(in srgb, var(--theme-accent) 6%, color-mix(in srgb, var(--theme-surface-active) 91%, rgba(255, 255, 255, 0.1)))',
          border: frostedBorder,
          boxShadow: frostedChipDepth,
        }
      case 'github':
        return {
          background:
            'color-mix(in srgb, var(--theme-accent) 7%, color-mix(in srgb, var(--theme-surface-active) 90%, rgba(255, 255, 255, 0.1)))',
          border: frostedBorder,
          boxShadow: frostedChipDepth,
        }
      case 'linear':
      default:
        return {
          background:
            'color-mix(in srgb, var(--theme-accent) 8%, color-mix(in srgb, var(--theme-surface-active) 90%, rgba(255, 255, 255, 0.09)))',
          border: frostedBorder,
          boxShadow: frostedChipDepth,
        }
    }
  }

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
        border: '1px solid transparent',
        boxShadow: 'none',
      }
    case 'discord':
      return {
        background: 'color-mix(in srgb, var(--theme-surface-active) 92%, var(--theme-surface) 8%)',
        border: '1px solid transparent',
        boxShadow: 'none',
      }
    case 'github':
      return {
        background: 'color-mix(in srgb, var(--theme-surface-active) 86%, transparent)',
        border: '1px solid transparent',
        boxShadow: 'none',
      }
    case 'linear':
    default:
      return {
        background: 'color-mix(in srgb, var(--theme-surface-active) 88%, black 12%)',
        border: '1px solid transparent',
        boxShadow: 'none',
      }
  }
}

export default function ChatRow({
  session,
  selectedOverlayStyle,
  isFrosted,
  isActive,
  isMenuOpen,
  isFocused,
  isStreaming,
  isRenaming,
  onSelect,
  onRenameConfirm,
  onRenameCancel,
  renderMoreButton,
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
  ]
    .filter(Boolean)
    .join(' ')

  // Active row gets overlay styles applied inline (since they vary by selectedOverlayStyle setting)
  const selectedOverlay = isActive
    ? getSelectedOverlayStyles(selectedOverlayStyle, isFrosted)
    : undefined

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
      style={
        selectedOverlay
          ? {
              background: selectedOverlay.background,
              border: selectedOverlay.border,
              boxShadow: selectedOverlay.boxShadow,
            }
          : undefined
      }
      data-active={isActive ? 'true' : 'false'}
      role="option"
      aria-selected={isActive}
      tabIndex={-1}
    >
      <div className="sidebar-chat-row__content">
        <div className="sidebar-chat-row__title-row">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameBlur}
              onClick={(e) => e.stopPropagation()}
              className="sidebar-chat-row__rename-input"
            />
          ) : (
            <span className="sidebar-chat-row__title">{session.title}</span>
          )}

          {!isRenaming &&
            (isStreaming ? (
              <div className="sidebar-chat-row__streaming-dot" />
            ) : (
              renderMoreButton?.(getMoreBtnClass()) ?? (
                <button aria-label="Chat options" className={getMoreBtnClass()}>
                  <Ellipsis size={14} />
                </button>
              )
            ))}
        </div>
      </div>

      {session.tags && session.tags.length > 0 && (
        <div className="sidebar-chat-row__tags">
          {session.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="sidebar-chat-row__tag">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

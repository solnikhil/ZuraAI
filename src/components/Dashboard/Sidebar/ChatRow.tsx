import type { ChatSession } from '../../../contexts/ChatHistoryContext'
import type { ChatSelectedOverlayStyle } from '../../../contexts/SettingsUIContext'

export type ChatRowAction = 'rename' | 'pin' | 'unpin' | 'delete' | 'duplicate'

interface ChatRowProps {
  session: ChatSession
  selectedOverlayStyle: ChatSelectedOverlayStyle
  isFrosted: boolean
  isActive: boolean
  isFocused: boolean
  isStreaming: boolean
  onSelect: (id: string) => void
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
  isFocused,
  isStreaming,
  onSelect,
}: ChatRowProps) {
  const rowClasses = [
    'sidebar-chat-row',
    isActive && 'sidebar-chat-row--active',
    isFocused && 'sidebar-chat-row--focused',
  ]
    .filter(Boolean)
    .join(' ')

  const selectedOverlay = isActive
    ? getSelectedOverlayStyles(selectedOverlayStyle, isFrosted)
    : undefined

  return (
    <div
      onClick={() => onSelect(session.id)}
      className={rowClasses}
      style={
        selectedOverlay
          ? {
              background: selectedOverlay.background,
              border: selectedOverlay.border,
              boxShadow: selectedOverlay.boxShadow,
              marginRight: 6,
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
          <span className="sidebar-chat-row__title">{session.title}</span>

          {isStreaming ? <div className="sidebar-chat-row__streaming-dot" /> : null}
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

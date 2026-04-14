import { createPortal } from 'react-dom'
import {
  Copy,
  Check,
  Info,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from '@/components/icons'
import ResponseInfo from '@/components/ResponseInfo'
import { useResponseInfoPopover } from './useResponseInfoPopover'

const MESSAGE_ACTION_ICON_SIZE = 15
const VERSION_NAV_ICON_SIZE = 16

interface ResponseInfoData {
  model?: string
  defaultModel: string
  latency?: number
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  finishReason?: string
  requestedMaxTokens?: number
}

interface AssistantMessageActionsProps {
  responseVersions?: Array<{ id: string }>
  totalVersions: number
  displayVersionIndex: number
  onNavigateVersion: (direction: 'prev' | 'next') => void
  hasDisplayContent: boolean
  copied: boolean
  onCopy: () => void
  onOpenRegenerateModal?: () => void
  shouldShowInfoTooltip: boolean
  responseInfoData: ResponseInfoData
  messageActionButtonClassName: string
}

export function AssistantMessageActions({
  responseVersions,
  totalVersions,
  displayVersionIndex,
  onNavigateVersion,
  hasDisplayContent,
  copied,
  onCopy,
  onOpenRegenerateModal,
  shouldShowInfoTooltip,
  responseInfoData,
  messageActionButtonClassName,
}: AssistantMessageActionsProps) {
  const {
    infoTriggerRef,
    infoPopoverRef,
    isPopoverOpen,
    isPopoverPositioned,
    popoverPosition,
    handleTriggerMouseEnter,
    handleTriggerMouseLeave,
    handlePopoverMouseEnter,
    handlePopoverMouseLeave,
  } = useResponseInfoPopover()

  return (
    <div
      className="assistant-message-actions"
      data-active={isPopoverOpen ? 'true' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginTop: '12px',
        overflow: 'visible',
      }}
    >
      {responseVersions && responseVersions.length > 0 && (
        <>
          <button
            onClick={() => onNavigateVersion('prev')}
            disabled={displayVersionIndex === 0}
            className="assistant-message-icon-button"
            style={{
              background: 'transparent',
              border: 'none',
              color: displayVersionIndex > 0 ? 'var(--theme-text-muted)' : 'var(--theme-border)',
              cursor: displayVersionIndex > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ChevronLeft size={VERSION_NAV_ICON_SIZE} />
          </button>

          <span
            style={{
              fontSize: '0.8rem',
              color: 'var(--theme-text-secondary)',
              fontFamily: 'monospace',
            }}
          >
            v{displayVersionIndex + 1}/{totalVersions}
          </span>

          <button
            onClick={() => onNavigateVersion('next')}
            disabled={displayVersionIndex >= totalVersions - 1}
            className="assistant-message-icon-button"
            style={{
              background: 'transparent',
              border: 'none',
              color:
                displayVersionIndex < totalVersions - 1
                  ? 'var(--theme-text-muted)'
                  : 'var(--theme-border)',
              cursor: displayVersionIndex < totalVersions - 1 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ChevronRight size={VERSION_NAV_ICON_SIZE} />
          </button>
        </>
      )}

      {/* Copy Button */}
      {hasDisplayContent && (
        <button
          onClick={onCopy}
          className={messageActionButtonClassName}
          style={{
            color: copied ? 'var(--theme-success)' : 'var(--theme-text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            minWidth: '28px',
            minHeight: '28px',
            padding: '6px',
            fontSize: '0.85rem',
            lineHeight: 1,
            fontFamily: 'inherit',
            animationDelay: '0ms',
          }}
        >
          {copied ? (
            <Check size={MESSAGE_ACTION_ICON_SIZE} />
          ) : (
            <Copy size={MESSAGE_ACTION_ICON_SIZE} />
          )}
        </button>
      )}

      {/* Regenerate Button */}
      {onOpenRegenerateModal && (
        <button
          onClick={onOpenRegenerateModal}
          className={messageActionButtonClassName}
          style={{
            color: 'var(--theme-text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            minWidth: '28px',
            minHeight: '28px',
            padding: '6px',
            lineHeight: 1,
            animationDelay: '60ms',
          }}
          title="Regenerate with custom instructions"
        >
          <RotateCcw size={MESSAGE_ACTION_ICON_SIZE} />
        </button>
      )}

      {/* Info Trigger */}
      {shouldShowInfoTooltip && (
        <button
          type="button"
          ref={infoTriggerRef}
          className={`assistant-message-icon-button info-trigger-btn ${messageActionButtonClassName}`}
          data-active={isPopoverOpen ? 'true' : undefined}
          style={{ animationDelay: '120ms' }}
          onMouseEnter={handleTriggerMouseEnter}
          onMouseLeave={handleTriggerMouseLeave}
          aria-label="Response details"
          title="Response details"
        >
          <Info size={MESSAGE_ACTION_ICON_SIZE} />
        </button>
      )}

      {/* Info Popover Portal */}
      {isPopoverOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={infoPopoverRef}
            className={isPopoverPositioned ? 'info-popover-enter' : undefined}
            onMouseEnter={handlePopoverMouseEnter}
            onMouseLeave={handlePopoverMouseLeave}
            style={{
              position: 'fixed',
              top: popoverPosition?.top ?? -9999,
              left: popoverPosition?.left ?? -9999,
              zIndex: 1000,
              opacity: isPopoverPositioned ? 1 : 0,
              pointerEvents: isPopoverPositioned ? 'auto' : 'none',
            }}
          >
            <ResponseInfo
              model={responseInfoData.model || responseInfoData.defaultModel}
              latency={responseInfoData.latency}
              usage={responseInfoData.usage}
              finishReason={responseInfoData.finishReason}
              requestedMaxTokens={responseInfoData.requestedMaxTokens}
            />
          </div>,
          document.body
        )}
    </div>
  )
}

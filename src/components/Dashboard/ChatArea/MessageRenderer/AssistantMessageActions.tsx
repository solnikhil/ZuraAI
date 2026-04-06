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

const MESSAGE_ACTION_ICON_SIZE = 14

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
    popoverPosition,
    handleTriggerMouseEnter,
    handleTriggerMouseLeave,
    handlePopoverMouseEnter,
    handlePopoverMouseLeave,
  } = useResponseInfoPopover()

  return (
    <div
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
            style={{
              background: 'transparent',
              border: 'none',
              color: displayVersionIndex > 0 ? 'var(--theme-text-muted)' : 'var(--theme-border)',
              cursor: displayVersionIndex > 0 ? 'pointer' : 'not-allowed',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ChevronLeft size={16} />
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
            style={{
              background: 'transparent',
              border: 'none',
              color:
                displayVersionIndex < totalVersions - 1
                  ? 'var(--theme-text-muted)'
                  : 'var(--theme-border)',
              cursor: displayVersionIndex < totalVersions - 1 ? 'pointer' : 'not-allowed',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ChevronRight size={16} />
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
            padding: '6px',
            fontSize: '0.85rem',
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
            padding: '6px',
            animationDelay: '60ms',
          }}
          title="Regenerate with custom instructions"
        >
          <RotateCcw size={MESSAGE_ACTION_ICON_SIZE} />
        </button>
      )}

      {/* Info Trigger */}
      {shouldShowInfoTooltip && (
        <div
          ref={infoTriggerRef}
          className={`info-trigger-btn ${messageActionButtonClassName}`}
          data-active={popoverPosition !== null ? 'true' : undefined}
          style={{ animationDelay: '120ms' }}
          onMouseEnter={handleTriggerMouseEnter}
          onMouseLeave={handleTriggerMouseLeave}
        >
          <Info size={13} />
        </div>
      )}

      {/* Info Popover Portal */}
      {popoverPosition &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={infoPopoverRef}
            className="info-popover-enter"
            onMouseEnter={handlePopoverMouseEnter}
            onMouseLeave={handlePopoverMouseLeave}
            style={{
              position: 'fixed',
              top: popoverPosition.top,
              left: popoverPosition.left,
              zIndex: 1000,
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

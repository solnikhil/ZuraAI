/**
 * MessageRenderer - Component for rendering chat messages
 * Handles markdown rendering, code blocks, file attachments, and message actions
 *
 * Performance: This component is wrapped with React.memo() to prevent unnecessary
 * re-renders when parent components re-render with unchanged message props.
 * A custom comparison function ensures deep equality checking for message objects.
 */

import React, { useState, useRef, useEffect, useMemo, memo } from 'react'
import { Box } from 'lucide-react'
import LazyMarkdown from '@/components/LazyMarkdown'
import ThinkingBlockComponent from '@/components/ThinkingBlock'
import { useSettings } from '@/contexts/SettingsContext'
import { writeTextToClipboard } from '@/utils/clipboard'
import { getDeepseekReasoning } from '@/utils/deepseekReasoning'
import { serializeDomToMarkdown } from '@/utils/domToMarkdown'
import { removeToolFollowUpSplitMarker } from '../messageTimeline'
import { resolveStreamPhase } from '../hooks/streaming/streamingContentPlacement'
import type { MessageRendererProps } from './types'
import { areMessagePropsEqual } from './messagePropsComparison'
import { UserMessageBubble, RenderImageFiles } from './UserMessageBubble'
import { WebSearchImageCarousel } from './WebSearchImageCarousel'
import { AssistantMessageActions } from './AssistantMessageActions'
import { RegenerateDialog } from './RegenerateDialog'
import { useWebSources, useWebSearchImages } from './useWebSourceData'

export type { MessageRendererProps } from './types'

/**
 * Main MessageRenderer component
 *
 * Wrapped with React.memo() using a custom comparison function to prevent
 * unnecessary re-renders when parent components re-render with unchanged props.
 */
function MessageRendererComponent({
  message,
  isStreaming = false,
  streamPhase,
  activeToolCalls,
  onCopy,
  onRegenerate,
}: MessageRendererProps) {
  const { settings } = useSettings()
  const [copied, setCopied] = useState(false)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)
  const [displayVersionIndex, setDisplayVersionIndex] = useState(0)
  const messageRef = useRef<HTMLDivElement>(null)

  // Track whether to trigger the staggered button animation.
  // null = no animation (historical messages), true = animate in
  const [showActionButtons, setShowActionButtons] = useState<boolean | null>(null)
  const prevIsStreamingRef = useRef(isStreaming)

  // Hooks for web data
  const { webSourceMap, processMessageContent } = useWebSources(message.toolResults)
  const { webSearchImages, webImageMode } = useWebSearchImages(
    message.toolResults,
    settings.webSearchIncludeImages
  )

  // Trigger staggered button animation ONLY when streaming transitions from true → false
  useEffect(() => {
    if (prevIsStreamingRef.current && !isStreaming) {
      // Streaming just ended on this message - trigger animation
      setShowActionButtons(false)
      requestAnimationFrame(() => {
        setShowActionButtons(true)
      })
    }
    prevIsStreamingRef.current = isStreaming
  }, [isStreaming])

  const versions = message.responseVersions || []
  const totalVersions = versions.length + (message.content ? 1 : 0)
  const currentVersionIndex = message.currentVersionIndex || 0
  const messageActionButtonClassName =
    showActionButtons === true
      ? 'message-action-surface action-btn-animate'
      : 'message-action-surface'

  // Reset display version when message changes
  useEffect(() => {
    setDisplayVersionIndex(currentVersionIndex)
  }, [message.id, currentVersionIndex])

  const getVersionContent = () => {
    if (displayVersionIndex === versions.length && message.content) {
      return message
    } else if (displayVersionIndex < versions.length) {
      return versions[displayVersionIndex]
    }
    return message
  }

  const displayMessage = getVersionContent()
  const rawDisplayContent = displayMessage?.content || ''
  const displayContent = removeToolFollowUpSplitMarker(rawDisplayContent)
  const hasDisplayContent = displayContent.trim().length > 0
  const completedBlocks = useMemo(() => {
    if (!message.thinkingBlocks?.length) {
      return []
    }

    return message.thinkingBlocks
  }, [message.thinkingBlocks])

  const isUser = message.role === 'user'
  const hasThinking = typeof message.thinking === 'string' && message.thinking.trim().length > 0
  const processedDisplayContent = useMemo(
    () => processMessageContent(displayContent),
    [displayContent, processMessageContent]
  )
  const hasVisibleContent = processedDisplayContent.trim().length > 0
  const effectiveStreamPhase = resolveStreamPhase(streamPhase ?? 'answering', hasVisibleContent)
  const isReasoningPhase = effectiveStreamPhase === 'reasoning'
  const isToolPhase = effectiveStreamPhase === 'tool'
  const showThinkingSpinner = isStreaming && isReasoningPhase && !hasThinking
  const completedThinkingCount = completedBlocks.filter((block) => block.type === 'thinking').length
  const activeThinkingBlockKey = `${message.id}:${completedThinkingCount}`
  const hasActiveToolCalls = (activeToolCalls?.length || 0) > 0

  const hasActiveThinkingState =
    hasThinking ||
    showThinkingSpinner ||
    Boolean(message.researchStatus?.isSearching) ||
    hasActiveToolCalls ||
    isToolPhase
  const showThinkingBlock = completedBlocks.length > 0 || hasActiveThinkingState
  const shouldRenderDisplayContent = hasVisibleContent

  const renderDisplayContent = () => (
    <div className="markdown-content">
      <LazyMarkdown
        content={processedDisplayContent}
        webSources={webSourceMap}
        isStreaming={isStreaming}
      />
    </div>
  )

  const handleCopy = async () => {
    const contentToCopy = removeToolFollowUpSplitMarker(message.content)
    const copiedSuccessfully = onCopy
      ? await Promise.resolve(onCopy(contentToCopy))
      : await writeTextToClipboard(contentToCopy)

    if (copiedSuccessfully === false) {
      return
    }

    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const navigateVersion = (direction: 'prev' | 'next') => {
    setDisplayVersionIndex((prev) => {
      if (direction === 'next' && prev < totalVersions - 1) {
        return prev + 1
      } else if (direction === 'prev' && prev > 0) {
        return prev - 1
      }
      return prev
    })
  }

  // When the user selects rendered assistant content and copies it, replace the
  // clipboard payload with best-effort Markdown source (## headings, **bold**,
  // list markers, fenced code) instead of the flattened rendered text.
  const handleCopyEvent = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return
    }

    const container = e.currentTarget
    const range = selection.getRangeAt(0)
    // Only intervene when the selection is contained within this rendered block.
    if (!container.contains(range.commonAncestorContainer)) {
      return
    }

    const fragment = range.cloneContents()
    const markdown = serializeDomToMarkdown(fragment)
    if (!markdown) {
      return
    }

    e.clipboardData.setData('text/plain', markdown)
    e.preventDefault()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault()
      if (messageRef.current) {
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(messageRef.current)
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    }
  }

  if (isUser) {
    return <UserMessageBubble message={message} bubbleStyle={settings.chatBubbleStyle || 'solid'} />
  }

  const shouldShowInfoTooltip =
    !isStreaming &&
    (hasDisplayContent ||
      Boolean(message.thinking) ||
      Boolean(message.model) ||
      Boolean(message.usage) ||
      Boolean(message.finishReason) ||
      typeof message.requestedMaxTokens === 'number' ||
      typeof message.latency === 'number' ||
      Boolean(message.toolResults))

  const shouldShowActionRow =
    !isStreaming && (hasDisplayContent || totalVersions > 0 || shouldShowInfoTooltip)

  return (
    <div
      className="assistant-message-shell"
      style={{ marginBottom: '24px' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onCopy={handleCopyEvent}
      ref={messageRef}
    >
      {message.files && message.files.length > 0 && <RenderImageFiles files={message.files} />}

      {/* Web Search/Extract image carousel - shown after thinking ends, before message content */}
      {!isStreaming && webSearchImages.length > 0 && (
        <WebSearchImageCarousel images={webSearchImages} mode={webImageMode} />
      )}

      {/* Thinking/search/tool activity stays above one continuous assistant message. */}
      {showThinkingBlock && (
        <div
          style={{
            marginBottom: hasVisibleContent ? '8px' : 0,
          }}
        >
          <ThinkingBlockComponent
            messageId={message.id}
            activeBlockKey={activeThinkingBlockKey}
            thinking={message.thinking || ''}
            isThinking={
              isStreaming &&
              isReasoningPhase &&
              !message.researchStatus?.isSearching &&
              !hasActiveToolCalls
            }
            thinkingDuration={message.thinkingDuration}
            isSearching={message.researchStatus?.isSearching || false}
            searchQuery={message.researchStatus?.currentSearch}
            searchQueries={message.researchStatus?.currentSearches}
            completedBlocks={completedBlocks}
            activeToolCalls={activeToolCalls || []}
          />
        </div>
      )}

      {shouldRenderDisplayContent && renderDisplayContent()}

      {/* Prominent, always-visible status while waiting on tool calls.
          This prevents the "blank" / hanging response feeling after a lead-in sentence
          like "All five, fresh versions. Let's go:". The ThinkingBlock also shows active
          tool details, but this guarantees something is obviously happening. */}
      {isStreaming && (isToolPhase || hasActiveToolCalls) && hasVisibleContent && (
        <div
          className="thinking-header tool-calling"
          style={{ marginTop: '8px', marginBottom: '4px' }}
          aria-live="polite"
        >
          <div className="thinking-label">
            <span className="thinking-tool-calling-icon default-icon">
              <Box size={14} />
            </span>
            <span className="thinking-text thinking-tool-calling">
              Working on tools…
            </span>
          </div>
        </div>
      )}

      {shouldShowActionRow && (
        <AssistantMessageActions
          responseVersions={message.responseVersions}
          totalVersions={totalVersions}
          displayVersionIndex={displayVersionIndex}
          onNavigateVersion={navigateVersion}
          hasDisplayContent={hasDisplayContent}
          copied={copied}
          onCopy={handleCopy}
          onOpenRegenerateModal={onRegenerate ? () => setShowRegenerateModal(true) : undefined}
          shouldShowInfoTooltip={shouldShowInfoTooltip}
          responseInfoData={{
            model: message.model,
            defaultModel: settings.aiModel,
            latency: message.latency,
            usage: message.usage,
            finishReason: message.finishReason,
            requestedMaxTokens: message.requestedMaxTokens,
            reasoningEffort: (() => {
              // DeepSeek: surface the per-model reasoning effort when that model
              // has reasoning enabled and effort is not 'none'. Keyed by model code.
              const reasoning = message.model ? getDeepseekReasoning(settings, message.model) : null
              if (reasoning?.enabled && reasoning?.effort !== 'none') {
                return reasoning.effort
              }
              // NVIDIA: surface the per-model reasoning effort when the model
              // supports deep thinking and effort is not 'none'.
              if (message.model) {
                const nvidiaModel = (settings.nvidiaModels || []).find(
                  (m) => m.code === message.model
                )
                if (nvidiaModel?.supportsDeepThinking) {
                  const effort = settings.nvidiaReasoningEffort?.[message.model] || 'high'
                  return effort !== 'none' ? effort : undefined
                }
              }
              return undefined
            })(),
          }}
          messageActionButtonClassName={messageActionButtonClassName}
        />
      )}

      {onRegenerate && (
        <RegenerateDialog
          open={showRegenerateModal}
          onOpenChange={setShowRegenerateModal}
          onRegenerate={(instruction) => {
            onRegenerate(instruction)
            setShowRegenerateModal(false)
          }}
        />
      )}
    </div>
  )
}

/**
 * Memoized MessageRenderer component
 *
 * Uses React.memo() with a custom comparison function (areMessagePropsEqual)
 * to prevent unnecessary re-renders when parent components re-render with
 * unchanged message props.
 */
export const MessageRenderer = memo(MessageRendererComponent, areMessagePropsEqual)

// Set display name for debugging
MessageRenderer.displayName = 'MessageRenderer'

export default MessageRenderer

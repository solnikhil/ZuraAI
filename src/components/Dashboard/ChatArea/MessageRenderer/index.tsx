/**
 * MessageRenderer - Component for rendering chat messages
 * Handles markdown rendering, code blocks, file attachments, and message actions
 *
 * Performance: This component is wrapped with React.memo() to prevent unnecessary
 * re-renders when parent components re-render with unchanged message props.
 * A custom comparison function ensures deep equality checking for message objects.
 */

import React, { useState, useRef, useEffect, useMemo, memo } from 'react'
import LazyMarkdown from '@/components/LazyMarkdown'
import ThinkingBlockComponent from '@/components/ThinkingBlock'
import { useSettings } from '@/contexts/SettingsContext'
import { writeTextToClipboard } from '@/utils/clipboard'
import { getDeepseekReasoning } from '@/utils/deepseekReasoning'
import { serializeDomToMarkdown } from '@/utils/domToMarkdown'
import {
  removeToolFollowUpSplitMarker,
  shouldCaptureFollowUpSnapshot,
  splitMessageTimeline,
  type FollowUpTimelineSnapshot,
} from '../messageTimeline'

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

  // Track if content has arrived during streaming
  const [hasContentDuringStreaming, setHasContentDuringStreaming] = useState(false)
  // Track whether to trigger the staggered button animation.
  // null = no animation (historical messages), true = animate in
  const [showActionButtons, setShowActionButtons] = useState<boolean | null>(null)
  const [followUpSnapshot, setFollowUpSnapshot] = useState<FollowUpTimelineSnapshot | null>(null)
  const prevIsStreamingRef = useRef(isStreaming)

  // Hooks for web data
  const { webSourceMap, processMessageContent } = useWebSources(message.toolResults)
  const { webSearchImages, webImageMode } = useWebSearchImages(
    message.toolResults,
    settings.webSearchIncludeImages
  )

  // Reset content tracking when streaming starts
  useEffect(() => {
    if (isStreaming) {
      setHasContentDuringStreaming(false)
    }
  }, [isStreaming])

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

  // Track when content arrives during streaming
  useEffect(() => {
    if (isStreaming && message.content && message.content.length > 0) {
      setHasContentDuringStreaming(true)
    }
  }, [isStreaming, message.content])

  useEffect(() => {
    setFollowUpSnapshot(null)
  }, [message.id])

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
  const isReasoningPhase = streamPhase === 'reasoning'
  const showThinkingSpinner = isStreaming && isReasoningPhase && !hasThinking
  const completedThinkingCount = completedBlocks.filter((block) => block.type === 'thinking').length
  const activeThinkingBlockKey = `${message.id}:${completedThinkingCount}:${streamPhase || 'idle'}`
  const hasActiveToolCalls = (activeToolCalls?.length || 0) > 0

  // Follow-up snapshot capture
  useEffect(() => {
    if (!shouldCaptureFollowUpSnapshot({
      isStreaming,
      streamPhase,
      content: displayContent,
      isSearching: message.researchStatus?.isSearching || false,
      activeToolCallCount: activeToolCalls?.length || 0,
      existingSnapshot: followUpSnapshot,
    })) {
      return
    }

    setFollowUpSnapshot({
      contentLength: displayContent.length,
      completedBlockCount: completedBlocks.length,
    })
  }, [
    activeToolCalls?.length,
    completedBlocks.length,
    displayContent,
    followUpSnapshot,
    isStreaming,
    message.researchStatus?.isSearching,
    streamPhase,
  ])

  const timeline = useMemo(
    () => splitMessageTimeline(rawDisplayContent, completedBlocks, followUpSnapshot),
    [completedBlocks, followUpSnapshot, rawDisplayContent]
  )

  const topProcessedContent = useMemo(
    () => processMessageContent(timeline.beforeContent),
    [processMessageContent, timeline.beforeContent]
  )
  const bottomProcessedContent = useMemo(
    () => processMessageContent(timeline.afterContent),
    [processMessageContent, timeline.afterContent]
  )
  const hasTopDisplayContent = topProcessedContent.trim().length > 0
  const hasBottomDisplayContent = bottomProcessedContent.trim().length > 0
  const hasSplitFollowUpSection =
    Boolean(followUpSnapshot) || timeline.afterBlocks.length > 0 || hasBottomDisplayContent
  const activeTimelineOwner = hasSplitFollowUpSection ? 'lower' : 'upper'
  const hasActiveThinkingState =
    hasThinking || showThinkingSpinner || Boolean(message.researchStatus?.isSearching) || hasActiveToolCalls
  const showUpperThinkingBlock =
    timeline.beforeBlocks.length > 0 ||
    (activeTimelineOwner === 'upper' && hasActiveThinkingState)
  const showLowerThinkingBlock =
    timeline.afterBlocks.length > 0 ||
    hasBottomDisplayContent ||
    (activeTimelineOwner === 'lower' && hasActiveThinkingState)

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
    !isStreaming &&
    (hasDisplayContent ||
      totalVersions > 0 ||
      shouldShowInfoTooltip)

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

      {/* Upper thinking/search activity - rendered ABOVE its related answer content */}
      {showUpperThinkingBlock && (
        <div style={{ marginTop: 0, marginBottom: hasTopDisplayContent ? '8px' : 0 }}>
          <ThinkingBlockComponent
            messageId={message.id}
            activeBlockKey={
              activeTimelineOwner === 'upper'
                ? activeThinkingBlockKey
                : `${activeThinkingBlockKey}:upper`
            }
            thinking={activeTimelineOwner === 'upper' ? message.thinking || '' : ''}
            isThinking={
              activeTimelineOwner === 'upper' &&
              isStreaming &&
              isReasoningPhase &&
              !message.researchStatus?.isSearching &&
              !hasActiveToolCalls
            }
            thinkingDuration={
              activeTimelineOwner === 'upper' ? message.thinkingDuration : undefined
            }
            isSearching={
              activeTimelineOwner === 'upper' ? message.researchStatus?.isSearching || false : false
            }
            searchQuery={
              activeTimelineOwner === 'upper' ? message.researchStatus?.currentSearch : undefined
            }
            searchQueries={
              activeTimelineOwner === 'upper' ? message.researchStatus?.currentSearches : undefined
            }
            completedBlocks={timeline.beforeBlocks}
            activeToolCalls={activeTimelineOwner === 'upper' ? activeToolCalls : []}
          />
        </div>
      )}

      {/* Message content - only show when not streaming or when content has arrived */}
      {((!isStreaming || hasContentDuringStreaming || completedBlocks.length > 0 || message.researchStatus) &&
        hasTopDisplayContent) && (
        <div className="markdown-content">
          <LazyMarkdown
            content={topProcessedContent}
            webSources={webSourceMap}
            isStreaming={isStreaming}
          />
        </div>
      )}

      {/* Lower thinking/search activity - rendered ABOVE its related follow-up content */}
      {showLowerThinkingBlock && (
        <div
          style={{
            marginTop: hasTopDisplayContent ? '12px' : 0,
            marginBottom: hasBottomDisplayContent ? '8px' : 0,
          }}
        >
          <ThinkingBlockComponent
            messageId={message.id}
            activeBlockKey={
              activeTimelineOwner === 'lower'
                ? activeThinkingBlockKey
                : `${activeThinkingBlockKey}:lower`
            }
            thinking={activeTimelineOwner === 'lower' ? message.thinking || '' : ''}
            isThinking={
              activeTimelineOwner === 'lower' &&
              isStreaming &&
              isReasoningPhase &&
              !message.researchStatus?.isSearching &&
              !hasActiveToolCalls
            }
            thinkingDuration={
              activeTimelineOwner === 'lower' ? message.thinkingDuration : undefined
            }
            isSearching={
              activeTimelineOwner === 'lower' ? message.researchStatus?.isSearching || false : false
            }
            searchQuery={
              activeTimelineOwner === 'lower' ? message.researchStatus?.currentSearch : undefined
            }
            searchQueries={
              activeTimelineOwner === 'lower' ? message.researchStatus?.currentSearches : undefined
            }
            completedBlocks={timeline.afterBlocks}
            activeToolCalls={activeTimelineOwner === 'lower' ? activeToolCalls : []}
          />
        </div>
      )}

      {hasBottomDisplayContent && (
        <div className="markdown-content">
          <LazyMarkdown
            content={bottomProcessedContent}
            webSources={webSourceMap}
            isStreaming={isStreaming}
          />
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
              // has reasoning enabled. Keyed by model code.
              const reasoning = message.model
                ? getDeepseekReasoning(settings, message.model)
                : null
              if (reasoning?.enabled) {
                return reasoning.effort
              }
              // NVIDIA: surface the per-model reasoning effort when the model
              // supports deep thinking.
              if (message.model) {
                const nvidiaModel = (settings.nvidiaModels || []).find(
                  (m) => m.code === message.model
                )
                if (nvidiaModel?.supportsDeepThinking) {
                  return settings.nvidiaReasoningEffort?.[message.model] || 'high'
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

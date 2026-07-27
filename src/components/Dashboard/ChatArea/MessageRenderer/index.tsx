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
  buildMessageTimelineSegments,
  removeToolFollowUpSplitMarker,
  shouldCaptureFollowUpSnapshot,
  type FollowUpTimelineSnapshot,
} from '../messageTimeline'
import { resolveStreamPhase } from '../hooks/streaming/streamingContentPlacement'
import type { MessageRendererProps } from './types'
import { areMessagePropsEqual } from './messagePropsComparison'
import { UserMessageBubble, RenderImageFiles } from './UserMessageBubble'
import { WebSearchImageCarousel } from './WebSearchImageCarousel'
import { AssistantMessageActions } from './AssistantMessageActions'
import { RegenerateDialog } from './RegenerateDialog'
import { useWebSources, useWebSearchImages } from './useWebSourceData'
import { AgentRunTimeline } from '../AgentRunTimeline'

export type { MessageRendererProps } from './types'

function normalizeThinkingForComparison(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
}

function isDuplicateCompletedThinking(
  thinking: string | undefined,
  completedBlocks: NonNullable<MessageRendererProps['message']['thinkingBlocks']>
): boolean {
  const normalizedThinking = normalizeThinkingForComparison(thinking || '')
  if (!normalizedThinking) return false

  const completedThinking = completedBlocks
    .filter((block) => block.type === 'thinking' && block.content)
    .map((block) => normalizeThinkingForComparison(block.content || ''))
    .filter(Boolean)

  if (completedThinking.length === 0) return false

  const completedTranscript = completedThinking.join(' ')

  return (
    completedThinking.includes(normalizedThinking) ||
    completedTranscript === normalizedThinking ||
    completedThinking.some((completed) => completed.startsWith(normalizedThinking)) ||
    completedTranscript.startsWith(normalizedThinking)
  )
}

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
  onStop,
  onCopy,
  onRegenerate,
}: MessageRendererProps) {
  const { settings } = useSettings()
  const [copied, setCopied] = useState(false)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)
  const [displayVersionIndex, setDisplayVersionIndex] = useState(0)
  const messageRef = useRef<HTMLDivElement>(null)

  const [hasContentDuringStreaming, setHasContentDuringStreaming] = useState(false)
  const [showActionButtons, setShowActionButtons] = useState<boolean | null>(null)
  const [followUpSnapshot, setFollowUpSnapshot] = useState<FollowUpTimelineSnapshot | null>(null)
  const prevIsStreamingRef = useRef(isStreaming)

  const { webSourceMap, processMessageContent } = useWebSources(message.toolResults)
  const { webSearchImages, webImageMode } = useWebSearchImages(
    message.toolResults,
    settings.webSearchIncludeImages
  )

  useEffect(() => {
    if (isStreaming) {
      setHasContentDuringStreaming(false)
    }
  }, [isStreaming])

  useEffect(() => {
    if (prevIsStreamingRef.current && !isStreaming) {
      setShowActionButtons(false)
      requestAnimationFrame(() => {
        setShowActionButtons(true)
      })
    }
    prevIsStreamingRef.current = isStreaming
  }, [isStreaming])

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
  const displayThinking = isDuplicateCompletedThinking(message.thinking, completedBlocks)
    ? ''
    : message.thinking || ''
  const hasThinking = displayThinking.trim().length > 0
  const hasActiveToolCalls = (activeToolCalls?.length || 0) > 0

  useEffect(() => {
    if (
      !shouldCaptureFollowUpSnapshot({
        isStreaming,
        streamPhase,
        content: displayContent,
        isSearching: message.researchStatus?.isSearching || false,
        activeToolCallCount: activeToolCalls?.length || 0,
        existingSnapshot: followUpSnapshot,
      })
    ) {
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

  const timelineSegments = useMemo(
    () => buildMessageTimelineSegments(rawDisplayContent, completedBlocks, followUpSnapshot),
    [completedBlocks, followUpSnapshot, rawDisplayContent]
  )

  const renderedSegments = useMemo(
    () =>
      timelineSegments.map((segment) => {
        const processedContent = processMessageContent(segment.content)
        return {
          ...segment,
          processedContent,
          hasVisibleContent: processedContent.trim().length > 0,
        }
      }),
    [processMessageContent, timelineSegments]
  )

  const activeSegmentIndex = renderedSegments.length > 1 ? renderedSegments.length - 1 : 0
  const completedThinkingCount = completedBlocks.filter((block) => block.type === 'thinking').length
  const activeThinkingBlockKey = `${message.id}:${completedThinkingCount}:${streamPhase || 'idle'}`

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

  const handleCopyEvent = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return
    }

    const container = e.currentTarget
    const range = selection.getRangeAt(0)
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

      {!isStreaming && webSearchImages.length > 0 && (
        <WebSearchImageCarousel images={webSearchImages} mode={webImageMode} />
      )}

      {message.agentRun ? (
        <AgentRunTimeline run={message.agentRun} isActive={isStreaming} onStop={onStop} />
      ) : null}

      {renderedSegments.map((segment, index) => {
        const isActiveSegment = index === activeSegmentIndex
        const effectiveSegmentPhase = resolveStreamPhase(
          streamPhase ?? 'answering',
          segment.hasVisibleContent
        )
        const isReasoningPhase = effectiveSegmentPhase === 'reasoning'
        const showThinkingSpinner =
          isStreaming && isActiveSegment && isReasoningPhase && !hasThinking
        const shouldDeferActiveToolCalls =
          isActiveSegment && hasActiveToolCalls && segment.hasVisibleContent
        const hasInlineActiveToolCalls =
          isActiveSegment && hasActiveToolCalls && !shouldDeferActiveToolCalls
        const hasActiveThinkingState =
          (isActiveSegment && hasThinking) ||
          showThinkingSpinner ||
          (isActiveSegment && Boolean(message.researchStatus?.isSearching)) ||
          hasInlineActiveToolCalls
        const showThinkingBlock = segment.blocks.length > 0 || hasActiveThinkingState
        const shouldShowSegmentContent =
          (!isStreaming ||
            hasContentDuringStreaming ||
            completedBlocks.length > 0 ||
            message.researchStatus) &&
          segment.hasVisibleContent
        const hasEarlierSegmentContent = renderedSegments
          .slice(0, index)
          .some((earlierSegment) => earlierSegment.hasVisibleContent)
        const segmentActiveToolCalls = isActiveSegment ? activeToolCalls || [] : []

        return (
          <React.Fragment key={`timeline-segment-${index}`}>
            {showThinkingBlock && (
              <div
                style={{
                  marginTop: index > 0 && hasEarlierSegmentContent ? '12px' : 0,
                  marginBottom: segment.hasVisibleContent ? '8px' : 0,
                }}
              >
                <ThinkingBlockComponent
                  messageId={message.id}
                  activeBlockKey={
                    isActiveSegment
                      ? activeThinkingBlockKey
                      : `${activeThinkingBlockKey}:segment-${index}`
                  }
                  thinking={isActiveSegment ? displayThinking : ''}
                  isThinking={
                    isActiveSegment &&
                    isStreaming &&
                    streamPhase === 'reasoning' &&
                    !message.researchStatus?.isSearching &&
                    !hasActiveToolCalls
                  }
                  thinkingDuration={isActiveSegment ? message.thinkingDuration : undefined}
                  isSearching={
                    isActiveSegment ? message.researchStatus?.isSearching || false : false
                  }
                  searchQuery={isActiveSegment ? message.researchStatus?.currentSearch : undefined}
                  searchQueries={
                    isActiveSegment ? message.researchStatus?.currentSearches : undefined
                  }
                  completedBlocks={segment.blocks}
                  activeToolCalls={shouldDeferActiveToolCalls ? [] : segmentActiveToolCalls}
                />
              </div>
            )}

            {shouldShowSegmentContent && (
              <div className="markdown-content">
                <LazyMarkdown
                  content={segment.processedContent}
                  webSources={webSourceMap}
                  isStreaming={isStreaming}
                />
              </div>
            )}

            {shouldDeferActiveToolCalls && (
              <div style={{ marginTop: '8px' }}>
                <ThinkingBlockComponent
                  messageId={message.id}
                  activeBlockKey={`${activeThinkingBlockKey}:deferred-tools`}
                  thinking=""
                  activeToolCalls={segmentActiveToolCalls}
                  completedBlocks={[]}
                />
              </div>
            )}
          </React.Fragment>
        )
      })}

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
              const reasoning = message.model ? getDeepseekReasoning(settings, message.model) : null
              if (reasoning?.enabled && reasoning?.effort !== 'none') {
                return reasoning.effort
              }
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

export const MessageRenderer = memo(MessageRendererComponent, areMessagePropsEqual)

MessageRenderer.displayName = 'MessageRenderer'

export default MessageRenderer

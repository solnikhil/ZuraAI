/**
 * TokenUsageIndicator - Circular progress showing token usage vs model context window
 * Displays Context Details panel on hover or click (toggleable) with breakdown.
 */

import { useMemo, useState, useRef, useEffect, useId } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Cpu, Scissors } from 'lucide-react'
import { useChatHistory } from '../../../contexts/ChatHistoryContext'
import { useStreamingState } from '../../../contexts/StreamingContext'
import { useSettings } from '../../../contexts/SettingsContext'
import { useModelSelector } from '../ModelSelector/useModelSelector'
import { useModelSelectorContext } from '../../../contexts/ModelSelectorContext'
import { estimateTokens, estimateMessageTokens } from '../../../utils/tokenUtils'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { maybeAnimate, motionSpring, useMotionPreferences } from '@/lib/motion'
import { cn } from '@/lib/utils'
import {
  buildAttachmentText,
  isImageAttachment,
  type AttachedFile,
} from './attachmentUtils'

export const DEFAULT_MAX_CONTEXT = 8192
const CIRCLE_SIZE = 18
const STROKE_WIDTH = 2
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export interface TokenBreakdown {
  systemPrompt: number
  chatMessages: number
  currentInput: number
  attachments: number
  imageAttachments: number
  streamingOutput: number
  responseReserve: number
  totalUsed: number
  totalWithReserve: number
  maxContext: number
  remaining: number
  remainingAfterReserve: number
  fillRatio: number
  reserveFillRatio: number
  usagePercent: number
  reserveUsagePercent: number
  status: ContextRingStatus
  wordsUntilCaution: number
}

export type ContextRingStatus = 'normal' | 'caution' | 'critical' | 'over-limit'

export interface ComputeTokenBreakdownParams {
  messages: Array<{ role: string; content: string }>
  systemPrompt: string
  currentInput: string
  attachmentText?: string
  imageAttachments?: Array<Pick<AttachedFile, 'size'>>
  streamingContent: string
  maxContext: number | undefined
  responseReserve?: number
}

const RESPONSE_RESERVE_DEFAULT = 0
const CAUTION_THRESHOLD = 0.72
const CRITICAL_THRESHOLD = 0.9
const APPROX_TOKENS_PER_IMAGE = 85
const APPROX_IMAGE_BYTES_PER_TOKEN = 4096

function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function getContextStatus(reserveFillRatio: number): ContextRingStatus {
  if (reserveFillRatio >= 1) return 'over-limit'
  if (reserveFillRatio >= CRITICAL_THRESHOLD) return 'critical'
  if (reserveFillRatio >= CAUTION_THRESHOLD) return 'caution'
  return 'normal'
}

function estimateImageAttachmentTokens(files: Array<Pick<AttachedFile, 'size'>> = []) {
  return files.reduce(
    (sum, file) =>
      sum + APPROX_TOKENS_PER_IMAGE + Math.ceil(Math.max(0, file.size) / APPROX_IMAGE_BYTES_PER_TOKEN),
    0
  )
}

function getStatusColor(status: ContextRingStatus) {
  switch (status) {
    case 'over-limit':
      return 'var(--theme-error)'
    case 'critical':
      return 'var(--theme-warning)'
    case 'caution':
      return 'var(--theme-info)'
    default:
      return 'var(--theme-success)'
  }
}

function getStatusLabel(status: ContextRingStatus) {
  switch (status) {
    case 'over-limit':
      return 'Over limit'
    case 'critical':
      return 'Critical'
    case 'caution':
      return 'Caution'
    default:
      return 'Healthy'
  }
}

/**
 * Pure function to compute the token breakdown for the context details ring.
 * Extracted for testability.
 */
export function computeTokenBreakdown({
  messages,
  systemPrompt,
  currentInput,
  attachmentText = '',
  imageAttachments = [],
  streamingContent,
  maxContext: rawMaxContext,
  responseReserve = RESPONSE_RESERVE_DEFAULT,
}: ComputeTokenBreakdownParams): TokenBreakdown {
  const systemPromptTokens = systemPrompt
    ? estimateMessageTokens({ role: 'system', content: systemPrompt })
    : 0
  const chatMessagesTokens = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0)
  const currentInputTokens = estimateTokens(currentInput)
  const attachmentTokens = estimateTokens(attachmentText)
  const imageAttachmentTokens = estimateImageAttachmentTokens(imageAttachments)
  const streamingOutputTokens = estimateTokens(streamingContent)
  const responseReserveTokens = Math.max(0, Math.floor(responseReserve))

  const totalUsed =
    systemPromptTokens +
    chatMessagesTokens +
    currentInputTokens +
    attachmentTokens +
    imageAttachmentTokens +
    streamingOutputTokens
  const totalWithReserve = totalUsed + responseReserveTokens
  const maxContext = rawMaxContext ?? DEFAULT_MAX_CONTEXT
  const remaining = Math.max(0, maxContext - totalUsed)
  const remainingAfterReserve = Math.max(0, maxContext - totalWithReserve)
  const fillRatio = maxContext > 0 ? clampRatio(totalUsed / maxContext) : 0
  const reserveFillRatio = maxContext > 0 ? clampRatio(totalWithReserve / maxContext) : 0
  const status = getContextStatus(reserveFillRatio)
  const tokensUntilCaution = Math.max(0, Math.floor(maxContext * CAUTION_THRESHOLD - totalWithReserve))

  return {
    systemPrompt: systemPromptTokens,
    chatMessages: chatMessagesTokens,
    currentInput: currentInputTokens,
    attachments: attachmentTokens,
    imageAttachments: imageAttachmentTokens,
    streamingOutput: streamingOutputTokens,
    responseReserve: responseReserveTokens,
    totalUsed,
    totalWithReserve,
    maxContext,
    remaining,
    remainingAfterReserve,
    fillRatio,
    reserveFillRatio,
    usagePercent: Math.round(fillRatio * 100),
    reserveUsagePercent: Math.round(reserveFillRatio * 100),
    status,
    wordsUntilCaution: Math.floor(tokensUntilCaution * 0.75),
  }
}

function BreakdownRow({
  label,
  count,
  dotColor,
  percent,
}: {
  label: string
  count: number
  dotColor: string
  percent?: number
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
        <span className="text-[var(--theme-text-secondary)]">{label}</span>
      </div>
      <div className="flex shrink-0 items-baseline gap-1.5">
        {percent != null && (
          <span className="text-[9px] tabular-nums text-[var(--theme-text-muted)]">
            {percent}%
          </span>
        )}
        <span className="font-medium tabular-nums text-[var(--theme-text-primary)]">
          {count.toLocaleString()}
        </span>
      </div>
    </div>
  )
}

export interface TokenUsageIndicatorProps {
  input: string
  attachedFiles?: AttachedFile[]
  className?: string
}

function getTokenPercent(count: number, maxContext: number) {
  if (maxContext <= 0 || count <= 0) return 0
  return Math.max(1, Math.round((count / maxContext) * 100))
}

function getTrimPreview(messages: Array<{ role: string; content: string }>, breakdown: TokenBreakdown) {
  if (breakdown.totalWithReserve <= breakdown.maxContext) {
    return 'No trim needed for this model.'
  }

  let runningTotal =
    breakdown.systemPrompt +
    breakdown.currentInput +
    breakdown.attachments +
    breakdown.imageAttachments +
    breakdown.streamingOutput +
    breakdown.responseReserve
  let keepCount = 0

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const tokens = estimateMessageTokens(messages[index])
    if (runningTotal + tokens > breakdown.maxContext) break
    runningTotal += tokens
    keepCount += 1
  }

  const trimCount = Math.max(0, messages.length - keepCount)
  if (trimCount === 0) {
    return 'The active input and response reserve are the pressure point; older messages would not need removal.'
  }

  return `Would drop ${trimCount.toLocaleString()} oldest message${trimCount === 1 ? '' : 's'} and keep the latest ${keepCount.toLocaleString()} before sending.`
}

export function TokenUsageIndicator({ input, attachedFiles = [], className }: TokenUsageIndicatorProps) {
  const { animationsEnabled } = useMotionPreferences()
  const { sessions, currentSessionId } = useChatHistory()
  const streamingState = useStreamingState()
  const { settings } = useSettings()
  const { currentModel, currentName, allModels } = useModelSelector()
  const { openSelector } = useModelSelectorContext()
  const summaryId = useId()
  const [showTrimPreview, setShowTrimPreview] = useState(false)

  const contextData = useMemo(() => {
    const sessionMessages = currentSessionId
      ? (sessions.find((s) => s.id === currentSessionId)?.messages ?? [])
      : []
    const hasActiveStreamingMessage = Boolean(
      streamingState.isStreaming &&
      currentSessionId &&
      streamingState.sessionId === currentSessionId &&
      streamingState.messageId
    )
    const streamingMessageId = hasActiveStreamingMessage ? streamingState.messageId : null
    const streamingMessage = streamingMessageId
      ? sessionMessages.find((m) => m.id === streamingMessageId)
      : undefined
    const messages = streamingMessageId
      ? sessionMessages.filter((m) => m.id !== streamingMessageId)
      : sessionMessages

    const effectiveStreamingContent = hasActiveStreamingMessage
      ? streamingState.content || streamingMessage?.content || ''
      : ''
    const textAttachmentContext = buildAttachmentText(attachedFiles)
    const imageAttachments = attachedFiles.filter(isImageAttachment)
    const mappedMessages = messages.map((m) => ({ role: m.role, content: m.content }))
    const breakdown = computeTokenBreakdown({
      messages: mappedMessages,
      systemPrompt: settings.systemPrompt ?? '',
      currentInput: input,
      attachmentText: textAttachmentContext,
      imageAttachments,
      streamingContent: effectiveStreamingContent,
      maxContext: currentModel?.maxContext,
      responseReserve: settings.maxTokens,
    })

    return {
      breakdown,
      messages: mappedMessages,
    }
  }, [
    attachedFiles,
    currentSessionId,
    sessions,
    settings.maxTokens,
    settings.systemPrompt,
    input,
    streamingState.isStreaming,
    streamingState.sessionId,
    streamingState.messageId,
    streamingState.content,
    currentModel?.maxContext,
  ])

  const { breakdown, messages } = contextData
  const statusColor = getStatusColor(breakdown.status)
  const statusLabel = getStatusLabel(breakdown.status)
  const strokeDashoffset = CIRCUMFERENCE * (1 - breakdown.reserveFillRatio)
  const modelName = currentModel?.displayName || currentName || 'No model selected'
  const largerModel = currentModel
    ? allModels
        .filter((model) => (model.maxContext ?? 0) > breakdown.maxContext)
        .sort((a, b) => (a.maxContext ?? 0) - (b.maxContext ?? 0))[0]
    : undefined
  const warningMessage =
    breakdown.status === 'over-limit'
      ? 'This may exceed the model window after response reserve.'
      : breakdown.status === 'critical'
        ? 'Context is nearly full after reserving space for the answer.'
        : breakdown.status === 'caution'
          ? 'This chat is getting long for the selected model.'
          : null
  const trimPreview = getTrimPreview(messages, breakdown)

  const [open, setOpen] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const HOVER_OPEN_DELAY_MS = 200
  const HOVER_CLOSE_DELAY_MS = 150

  const clearHoverTimeout = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
  }

  const scheduleHoverAction = (action: () => void, delayMs: number) => {
    clearHoverTimeout()
    hoverTimeoutRef.current = setTimeout(() => {
      hoverTimeoutRef.current = null
      action()
    }, delayMs)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setIsPinned(false)
      setShowTrimPreview(false)
    }
    setOpen(next)
  }

  const handleTriggerMouseEnter = () => {
    if (isPinned) {
      clearHoverTimeout()
      return
    }

    scheduleHoverAction(() => {
      setOpen(true)
    }, HOVER_OPEN_DELAY_MS)
  }

  const handleTriggerMouseLeave = () => {
    if (!isPinned) {
      scheduleHoverAction(() => {
        setOpen(false)
      }, HOVER_CLOSE_DELAY_MS)
    }
  }

  const handleContentMouseEnter = () => {
    clearHoverTimeout()
  }

  const handleContentMouseLeave = () => {
    if (!isPinned) {
      scheduleHoverAction(() => {
        setOpen(false)
      }, HOVER_CLOSE_DELAY_MS)
    }
  }

  const handleTriggerClick = () => {
    clearHoverTimeout()

    if (isPinned) {
      setIsPinned(false)
      setOpen(false)
      setShowTrimPreview(false)
      return
    }

    setIsPinned(true)
    setOpen(true)
  }

  const handleContentInteractOutside = (event: Event) => {
    const target = event.target
    if (!(target instanceof Node)) {
      return
    }

    if (triggerRef.current?.contains(target)) {
      event.preventDefault()
    }
  }

  useEffect(() => {
    return () => {
      clearHoverTimeout()
    }
  }, [])

  const ariaLabel = currentModel
    ? `${statusLabel}: ${breakdown.totalWithReserve.toLocaleString()} / ${breakdown.maxContext.toLocaleString()} tokens including response reserve`
    : breakdown.totalUsed > 0
      ? `~${breakdown.totalUsed.toLocaleString()} tokens (no model selected)`
      : 'No model selected'

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverAnchor asChild>
        <motion.button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel}
          aria-pressed={isPinned}
          aria-describedby={summaryId}
          className={cn('flex items-center justify-center rounded-full cursor-pointer', className)}
          whileHover={maybeAnimate(animationsEnabled, { scale: 1.08 })}
          whileTap={maybeAnimate(animationsEnabled, { scale: 0.96 })}
          transition={motionSpring.gentle}
          onMouseEnter={handleTriggerMouseEnter}
          onMouseLeave={handleTriggerMouseLeave}
          onClick={handleTriggerClick}
        >
          <svg width={CIRCLE_SIZE} height={CIRCLE_SIZE} className="rotate-[-90deg]" aria-hidden>
            <circle
              cx={CIRCLE_SIZE / 2}
              cy={CIRCLE_SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE_WIDTH}
              style={{ color: 'color-mix(in srgb, var(--theme-text-primary) 16%, transparent)' }}
            />
            <circle
              cx={CIRCLE_SIZE / 2}
              cy={CIRCLE_SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE_WIDTH}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ color: statusColor }}
            />
          </svg>
          <span className="sr-only">
            {statusLabel}. {breakdown.reserveUsagePercent}% used with response reserve.
          </span>
        </motion.button>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        sideOffset={8}
        align="end"
        onMouseEnter={handleContentMouseEnter}
        onMouseLeave={handleContentMouseLeave}
        onInteractOutside={handleContentInteractOutside}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className={cn(
          'theme-menu-surface w-72 rounded-xl p-3',
          'data-[state=open]:animate-token-context-in data-[state=closed]:animate-token-context-out'
        )}
      >
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2 animate-token-context-item animate-token-context-item-delay-1">
            <div className="min-w-0">
              <h4 className="text-[13px] font-semibold text-[var(--theme-text-primary)]">
                Context Control
              </h4>
              <p
                id={summaryId}
                className="mt-0.5 truncate text-[11px] text-[var(--theme-text-secondary)]"
              >
                {modelName} · {breakdown.reserveUsagePercent}% with reserve
              </p>
            </div>
            {breakdown.status !== 'normal' && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
                style={{
                  color: statusColor,
                  backgroundColor: `color-mix(in srgb, ${statusColor} 12%, transparent)`,
                }}
              >
                {statusLabel}
              </span>
            )}
          </div>

          {warningMessage && (
            <div
              className="animate-token-context-item animate-token-context-item-delay-2 flex gap-2 rounded-lg border px-2 py-1.5 text-[11px]"
              style={{
                borderColor: `color-mix(in srgb, ${statusColor} 34%, var(--theme-border))`,
                backgroundColor: `color-mix(in srgb, ${statusColor} 8%, transparent)`,
                color: 'var(--theme-text-primary)',
              }}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: statusColor }} />
              <span>{warningMessage}</span>
            </div>
          )}

          <div className="space-y-1.5 animate-token-context-item animate-token-context-item-delay-2">
            <BreakdownRow
              label="System Prompt"
              count={breakdown.systemPrompt}
              dotColor="var(--theme-accent-secondary)"
              percent={getTokenPercent(breakdown.systemPrompt, breakdown.maxContext)}
            />
            <BreakdownRow
              label="Chat Messages"
              count={breakdown.chatMessages}
              dotColor="var(--theme-accent)"
              percent={getTokenPercent(breakdown.chatMessages, breakdown.maxContext)}
            />
            {breakdown.currentInput > 0 && (
              <BreakdownRow
                label="Current Input"
                count={breakdown.currentInput}
                dotColor="var(--theme-info)"
                percent={getTokenPercent(breakdown.currentInput, breakdown.maxContext)}
              />
            )}
            {breakdown.attachments > 0 && (
              <BreakdownRow
                label="Text Attachments"
                count={breakdown.attachments}
                dotColor="var(--theme-warning)"
                percent={getTokenPercent(breakdown.attachments, breakdown.maxContext)}
              />
            )}
            {breakdown.imageAttachments > 0 && (
              <BreakdownRow
                label="Image Attachments"
                count={breakdown.imageAttachments}
                dotColor="var(--theme-accent-secondary)"
                percent={getTokenPercent(breakdown.imageAttachments, breakdown.maxContext)}
              />
            )}
            {breakdown.streamingOutput > 0 && (
              <BreakdownRow
                label="Streaming Output"
                count={breakdown.streamingOutput}
                dotColor="var(--theme-success)"
                percent={getTokenPercent(breakdown.streamingOutput, breakdown.maxContext)}
              />
            )}
            {breakdown.responseReserve > 0 && (
              <BreakdownRow
                label="Response Reserve"
                count={breakdown.responseReserve}
                dotColor="var(--theme-text-muted)"
                percent={getTokenPercent(breakdown.responseReserve, breakdown.maxContext)}
              />
            )}
          </div>

          {currentModel && (
            <>
              <div className="animate-token-context-item animate-token-context-item-delay-3 h-1 w-full overflow-hidden rounded-full bg-[var(--theme-surface-active)]">
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{
                    width: `${Math.min(100, breakdown.reserveFillRatio * 100)}%`,
                    backgroundColor: statusColor,
                  }}
                />
              </div>

              <div className="animate-token-context-item animate-token-context-item-delay-4 space-y-1 border-t border-[var(--theme-border)] pt-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--theme-success)]" />
                    <span className="text-[var(--theme-text-secondary)]">Total Used</span>
                  </div>
                  <span className="font-medium tabular-nums text-[var(--theme-text-primary)]">
                    {breakdown.totalUsed.toLocaleString()} · {breakdown.usagePercent}%
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--theme-text-muted)]" />
                    <span className="text-[var(--theme-text-secondary)]">Remaining After Reserve</span>
                  </div>
                  <span className="font-medium tabular-nums text-[var(--theme-text-primary)]">
                    {breakdown.remainingAfterReserve.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-[var(--theme-text-muted)]">Total Available</span>
                  <span className="font-medium tabular-nums text-[var(--theme-text-secondary)]">
                    {breakdown.maxContext.toLocaleString()}
                  </span>
                </div>
              </div>

              {largerModel && breakdown.status !== 'normal' && (
                <div className="animate-token-context-item animate-token-context-item-delay-4 rounded-lg bg-[var(--theme-surface-subtle)] px-2 py-1.5 text-[11px] text-[var(--theme-text-secondary)]">
                  Larger enabled model: <span className="font-medium text-[var(--theme-text-primary)]">{largerModel.displayName}</span>
                </div>
              )}
            </>
          )}

          {!currentModel && (
            <p className="animate-token-context-item animate-token-context-item-delay-2 text-xs text-[var(--theme-text-muted)]">
              No model selected
            </p>
          )}

          {showTrimPreview && (
            <div className="animate-token-context-item animate-token-context-item-delay-5 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-subtle)] px-2 py-1.5 text-[11px] text-[var(--theme-text-secondary)]">
              {trimPreview}
            </div>
          )}

          <div className="animate-token-context-item animate-token-context-item-delay-5 grid grid-cols-2 gap-1.5 pt-0.5">
            <button
              type="button"
              className="inline-flex min-h-7 items-center justify-center gap-1.5 rounded-lg border border-[var(--theme-border)] px-2 text-[11px] font-medium text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-hover)] hover:text-[var(--theme-text-primary)]"
              onClick={() => {
                openSelector()
                setOpen(false)
              }}
            >
              <Cpu className="h-3.5 w-3.5" />
              Model
            </button>
            <button
              type="button"
              className="inline-flex min-h-7 items-center justify-center gap-1.5 rounded-lg border border-[var(--theme-border)] px-2 text-[11px] font-medium text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-hover)] hover:text-[var(--theme-text-primary)]"
              onClick={() => setShowTrimPreview((value) => !value)}
            >
              <Scissors className="h-3.5 w-3.5" />
              Trim
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

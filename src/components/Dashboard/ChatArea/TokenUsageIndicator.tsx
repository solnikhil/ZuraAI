/**
 * TokenUsageIndicator - Circular progress showing token usage vs model context window
 * Displays Context Details panel on hover or click (toggleable) with breakdown.
 */

import { useMemo, useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useChatHistory } from '../../../contexts/ChatHistoryContext'
import { useStreamingState } from '../../../contexts/StreamingContext'
import { useSettings } from '../../../contexts/SettingsContext'
import { useModelSelector } from '../ModelSelector/useModelSelector'
import { estimateTokens, estimateMessageTokens } from '../../../utils/tokenUtils'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { maybeAnimate, motionSpring, useMotionPreferences } from '@/lib/motion'
import { cn } from '@/lib/utils'

export const DEFAULT_MAX_CONTEXT = 8192
const CIRCLE_SIZE = 18
const STROKE_WIDTH = 2
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export interface TokenBreakdown {
  systemPrompt: number
  chatMessages: number
  currentInput: number
  streamingOutput: number
  totalUsed: number
  maxContext: number
  remaining: number
  fillRatio: number
}

export interface ComputeTokenBreakdownParams {
  messages: Array<{ role: string; content: string }>
  systemPrompt: string
  currentInput: string
  streamingContent: string
  maxContext: number | undefined
}

/**
 * Pure function to compute the token breakdown for the context details ring.
 * Extracted for testability.
 */
export function computeTokenBreakdown({
  messages,
  systemPrompt,
  currentInput,
  streamingContent,
  maxContext: rawMaxContext,
}: ComputeTokenBreakdownParams): TokenBreakdown {
  const systemPromptTokens = systemPrompt
    ? estimateMessageTokens({ role: 'system', content: systemPrompt })
    : 0
  const chatMessagesTokens = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0)
  const currentInputTokens = estimateTokens(currentInput)
  const streamingOutputTokens = estimateTokens(streamingContent)

  const totalUsed =
    systemPromptTokens + chatMessagesTokens + currentInputTokens + streamingOutputTokens
  const maxContext = rawMaxContext ?? DEFAULT_MAX_CONTEXT
  const remaining = Math.max(0, maxContext - totalUsed)
  const fillRatio = maxContext > 0 ? Math.min(1, totalUsed / maxContext) : 0

  return {
    systemPrompt: systemPromptTokens,
    chatMessages: chatMessagesTokens,
    currentInput: currentInputTokens,
    streamingOutput: streamingOutputTokens,
    totalUsed,
    maxContext,
    remaining,
    fillRatio,
  }
}

function BreakdownRow({
  label,
  count,
  dotColor,
}: {
  label: string
  count: number
  dotColor: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
        <span className="text-[var(--theme-text-secondary)]">{label}</span>
      </div>
      <span className="font-medium tabular-nums text-[var(--theme-text-primary)]">
        {count.toLocaleString()}
      </span>
    </div>
  )
}

export interface TokenUsageIndicatorProps {
  input: string
  className?: string
}

export function TokenUsageIndicator({ input, className }: TokenUsageIndicatorProps) {
  const { animationsEnabled } = useMotionPreferences()
  const { sessions, currentSessionId } = useChatHistory()
  const streamingState = useStreamingState()
  const { settings } = useSettings()
  const { currentModel } = useModelSelector()

  const breakdown = useMemo((): TokenBreakdown => {
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

    return computeTokenBreakdown({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      systemPrompt: settings.systemPrompt ?? '',
      currentInput: input,
      streamingContent: effectiveStreamingContent,
      maxContext: currentModel?.maxContext,
    })
  }, [
    currentSessionId,
    sessions,
    settings.systemPrompt,
    input,
    streamingState.isStreaming,
    streamingState.sessionId,
    streamingState.messageId,
    streamingState.content,
    currentModel?.maxContext,
  ])

  const strokeDashoffset = CIRCUMFERENCE * (1 - breakdown.fillRatio)

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
    ? `${breakdown.totalUsed.toLocaleString()} / ${breakdown.maxContext.toLocaleString()} tokens`
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
              className="text-[var(--theme-text-secondary)]"
            />
          </svg>
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
          'theme-menu-surface w-64 rounded-xl p-4',
          'data-[state=open]:animate-token-context-in data-[state=closed]:animate-token-context-out'
        )}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between animate-token-context-item animate-token-context-item-delay-1">
            <h4 className="text-sm font-semibold text-[var(--theme-text-primary)]">
              Context Details
            </h4>
            <span className="rounded-md bg-[var(--theme-surface-active)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--theme-text-secondary)]">
              Token
            </span>
          </div>

          <div className="space-y-2 animate-token-context-item animate-token-context-item-delay-2">
            <BreakdownRow
              label="System Prompt"
              count={breakdown.systemPrompt}
              dotColor="var(--theme-accent-secondary)"
            />
            <BreakdownRow
              label="Chat Messages"
              count={breakdown.chatMessages}
              dotColor="var(--theme-accent)"
            />
            {breakdown.currentInput > 0 && (
              <BreakdownRow
                label="Current Input"
                count={breakdown.currentInput}
                dotColor="var(--theme-info)"
              />
            )}
            {breakdown.streamingOutput > 0 && (
              <BreakdownRow
                label="Streaming Output"
                count={breakdown.streamingOutput}
                dotColor="var(--theme-success)"
              />
            )}
          </div>

          {currentModel && (
            <>
              <div className="animate-token-context-item animate-token-context-item-delay-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--theme-surface-active)]">
                <div
                  className="h-full rounded-full bg-[var(--theme-success)] transition-all duration-200"
                  style={{ width: `${Math.min(100, breakdown.fillRatio * 100)}%` }}
                />
              </div>

              <div className="animate-token-context-item animate-token-context-item-delay-4 space-y-1.5 border-t border-[var(--theme-border)] pt-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--theme-success)]" />
                    <span className="text-[var(--theme-text-secondary)]">Total Used</span>
                  </div>
                  <span className="font-medium tabular-nums text-[var(--theme-text-primary)]">
                    {breakdown.totalUsed.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--theme-text-muted)]" />
                    <span className="text-[var(--theme-text-secondary)]">Remaining</span>
                  </div>
                  <span className="font-medium tabular-nums text-[var(--theme-text-primary)]">
                    {breakdown.remaining.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--theme-text-muted)]">Total Available</span>
                  <span className="font-medium tabular-nums text-[var(--theme-text-secondary)]">
                    {breakdown.maxContext.toLocaleString()}
                  </span>
                </div>
              </div>
            </>
          )}

          {!currentModel && (
            <p className="animate-token-context-item animate-token-context-item-delay-2 text-xs text-[var(--theme-text-muted)]">
              No model selected
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

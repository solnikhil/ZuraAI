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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const DEFAULT_MAX_CONTEXT = 8192
const CIRCLE_SIZE = 18
const STROKE_WIDTH = 2
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** ~4 chars per token heuristic for streaming output */
function estimateOutputTokens(content: string): number {
  if (!content) return 0
  return Math.ceil(content.length / 4)
}

interface TokenBreakdown {
  systemPrompt: number
  chatMessages: number
  currentInput: number
  streamingOutput: number
  totalUsed: number
  maxContext: number
  remaining: number
  fillRatio: number
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
        <div
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <span className="text-white/80">{label}</span>
      </div>
      <span className="font-medium tabular-nums text-white">
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
  const { sessions, currentSessionId } = useChatHistory()
  const streamingState = useStreamingState()
  const { settings } = useSettings()
  const { currentModel } = useModelSelector()

  const breakdown = useMemo((): TokenBreakdown => {
    const messages = currentSessionId
      ? sessions.find(s => s.id === currentSessionId)?.messages ?? []
      : []
    const systemPrompt = settings.systemPrompt ?? ''

    const messagesForEstimate = messages.map(m => ({
      role: m.role,
      content: m.content + (m.thinking ? `\n${m.thinking}` : ''),
    }))

    const systemPromptTokens = systemPrompt
      ? estimateMessageTokens({ role: 'system', content: systemPrompt })
      : 0
    const chatMessagesTokens = messagesForEstimate.reduce(
      (sum, m) => sum + estimateMessageTokens(m),
      0
    )
    const currentInputTokens = estimateTokens(input)
    const streamingOutputTokens =
      streamingState.isStreaming && streamingState.content
        ? estimateOutputTokens(streamingState.content)
        : 0

    const totalUsed =
      systemPromptTokens +
      chatMessagesTokens +
      currentInputTokens +
      streamingOutputTokens
    const maxContext = currentModel?.maxContext ?? DEFAULT_MAX_CONTEXT
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
  }, [
    currentSessionId,
    sessions,
    settings.systemPrompt,
    input,
    streamingState.isStreaming,
    streamingState.content,
    currentModel?.maxContext,
  ])

  const strokeDashoffset = CIRCUMFERENCE * (1 - breakdown.fillRatio)

  const [open, setOpen] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const HOVER_DELAY_MS = 200

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setIsPinned(false)
    }
    setOpen(next)
  }

  const handleTriggerMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    hoverTimeoutRef.current = setTimeout(() => {
      hoverTimeoutRef.current = null
      setOpen(true)
    }, HOVER_DELAY_MS)
  }

  const handleTriggerMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    if (!isPinned) {
      hoverTimeoutRef.current = setTimeout(() => {
        hoverTimeoutRef.current = null
        setOpen(false)
      }, 150)
    }
  }

  const handleContentMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
  }

  const handleContentMouseLeave = () => {
    if (!isPinned) {
      hoverTimeoutRef.current = setTimeout(() => {
        hoverTimeoutRef.current = null
        setOpen(false)
      }, 150)
    }
  }

  const handleTriggerClick = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setIsPinned((p) => !p)
    setOpen((o) => !o)
  }

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])

  const ariaLabel = currentModel
    ? `${breakdown.totalUsed.toLocaleString()} / ${breakdown.maxContext.toLocaleString()} tokens`
    : breakdown.totalUsed > 0
      ? `~${breakdown.totalUsed.toLocaleString()} tokens (no model selected)`
      : 'No model selected'

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <motion.button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            'flex items-center justify-center rounded-full cursor-pointer',
            className
          )}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          onMouseEnter={handleTriggerMouseEnter}
          onMouseLeave={handleTriggerMouseLeave}
          onClick={handleTriggerClick}
        >
          <svg
            width={CIRCLE_SIZE}
            height={CIRCLE_SIZE}
            className="rotate-[-90deg]"
            aria-hidden
          >
            <circle
              cx={CIRCLE_SIZE / 2}
              cy={CIRCLE_SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE_WIDTH}
              className="text-white/15"
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
              className="text-white/60"
            />
          </svg>
        </motion.button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={8}
        align="end"
        onMouseEnter={handleContentMouseEnter}
        onMouseLeave={handleContentMouseLeave}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className={cn(
          'w-64 rounded-xl border border-white/10 bg-neutral-900/95 p-4 shadow-xl backdrop-blur-sm',
          'data-[state=open]:animate-token-context-in data-[state=closed]:animate-token-context-out'
        )}
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between animate-token-context-item animate-token-context-item-delay-1">
            <h4 className="text-sm font-semibold text-white">Context Details</h4>
            <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/80">
              Token
            </span>
          </div>

          {/* Breakdown */}
          <div className="space-y-2 animate-token-context-item animate-token-context-item-delay-2">
            <BreakdownRow
              label="System Prompt"
              count={breakdown.systemPrompt}
              dotColor="#ec4899"
            />
            <BreakdownRow
              label="Chat Messages"
              count={breakdown.chatMessages}
              dotColor="#f97316"
            />
            {breakdown.currentInput > 0 && (
              <BreakdownRow
                label="Current Input"
                count={breakdown.currentInput}
                dotColor="#3b82f6"
              />
            )}
            {breakdown.streamingOutput > 0 && (
              <BreakdownRow
                label="Streaming Output"
                count={breakdown.streamingOutput}
                dotColor="#22c55e"
              />
            )}
          </div>

          {/* Progress bar */}
          {currentModel && (
            <>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10 animate-token-context-item animate-token-context-item-delay-3">
                <div
                  className="h-full rounded-full bg-emerald-500/90 transition-all duration-200"
                  style={{ width: `${Math.min(100, breakdown.fillRatio * 100)}%` }}
                />
              </div>

              {/* Summary */}
              <div className="space-y-1.5 border-t border-white/10 pt-3 animate-token-context-item animate-token-context-item-delay-4">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="text-white/70">Total Used</span>
                  </div>
                  <span className="font-medium tabular-nums text-white">
                    {breakdown.totalUsed.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-white/40" />
                    <span className="text-white/70">Remaining</span>
                  </div>
                  <span className="font-medium tabular-nums text-white">
                    {breakdown.remaining.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-white/50">Total Available</span>
                  <span className="font-medium tabular-nums text-white/90">
                    {breakdown.maxContext.toLocaleString()}
                  </span>
                </div>
              </div>
            </>
          )}

          {!currentModel && (
            <p className="text-xs text-white/50 animate-token-context-item animate-token-context-item-delay-2">
              No model selected
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

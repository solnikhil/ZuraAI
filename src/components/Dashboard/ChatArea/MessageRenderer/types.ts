import type { Message } from '@/chat/types'
import type { StreamingPhase } from '@/contexts/StreamingContext'

export interface MessageRendererProps {
  message: Message
  isStreaming?: boolean
  streamPhase?: StreamingPhase
  sessionId?: string
  /** Active tool calls during streaming (for in-message tool calling animation) */
  activeToolCalls?: Array<{ name: string; arguments?: Record<string, unknown> }>
  /** Stops the active Agent run. Only provided for the currently streaming message. */
  onStop?: () => void
  onCopy?: (content: string) => void | Promise<boolean>
  onRegenerate?: (instruction: string) => void
}

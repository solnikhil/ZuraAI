import type {
  Message,
  ThinkingBlock,
  ToolCallResult,
} from '@/contexts/ChatHistoryContext'
import type { StreamingPhase } from '@/contexts/StreamingContext'

export interface MessageRendererProps {
  message: Message & {
    thinking?: string
    thinkingDuration?: number
    thinkingBlocks?: ThinkingBlock[]
    researchStatus?: {
      currentRound: number
      maxRounds: number
      currentSearch?: string
      currentSearches?: string[]
      isSearching: boolean
    }
    responseVersions?: Array<{
      id: string
      content: string
      timestamp: number
      instruction?: string
      model?: string
    }>
    currentVersionIndex?: number
    toolResults?: ToolCallResult[]
    researchPlan?: {
      topic: string
      steps: Array<{ stepNumber: number; query: string; rationale?: string }>
    }
    researchProgress?: { currentStep: number; totalSteps: number; currentQuery?: string }
  }
  isStreaming?: boolean
  streamPhase?: StreamingPhase
  sessionId?: string
  /** Active tool calls during streaming (for in-message tool calling animation) */
  activeToolCalls?: Array<{ name: string; arguments?: Record<string, unknown> }>
  onCopy?: (content: string) => void
  onRegenerate?: (instruction: string) => void
}

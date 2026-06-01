import type { ToolCallResult, ToolExecutionMetadata } from '../tools/types'

export type { ToolCallResult }

export type AssistantMode = 'chat' | 'agent'

export type AgentCapabilityState = 'enabled' | 'unavailable' | 'approval-required'

/**
 * Agent Desktop (Agent View) capability state recorded in the Agent_Run
 * capabilities. Req 11.1, 8.5, 9.2.
 * - `unavailable`: non-Windows platform, the VirtualDesktopAccessor binding is
 *   unavailable, or the Agent_Desktop_Skill is disabled.
 * - `available`: enabled + binding loaded, but no session is currently active.
 * - `active`: an Agent_Desktop session is currently provisioned.
 *
 * This is the canonical renderer-side definition; `src/electron/types.ts`
 * re-exports it and `electron/agentDesktop/types.ts` mirrors it for the main
 * process.
 */
export type AgentDesktopCapabilityState = 'available' | 'active' | 'unavailable'

export type AgentStepStatus =
  | 'pending'
  | 'awaiting-approval'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rejected'

export interface AgentRunCapabilities {
  web: AgentCapabilityState
  code: AgentCapabilityState
  mcp: AgentCapabilityState
  computer: AgentCapabilityState
  /**
   * Agent Desktop (Agent View) capability state. Input is delivered only while
   * the Agent_Desktop is the displayed Virtual_Desktop because all Virtual
   * Desktops for one Windows user share a single Input_Session (Req 3.10).
   * Resolved by `buildAgentCapabilities`: `unavailable` on non-Windows / when
   * the VDA binding is unavailable / when the skill is disabled, `active` when
   * a session is provisioned, otherwise `available` (Req 11.1, 8.5, 9.2).
   */
  agentDesktop: AgentDesktopCapabilityState
}

export interface AgentStep {
  id: string
  kind: 'plan' | 'tool' | 'web' | 'code' | 'mcp' | 'computer' | 'verify' | 'answer'
  status: AgentStepStatus
  title: string
  summary: string
  toolCallId?: string
  toolName?: string
  arguments?: Record<string, unknown>
  result?: unknown
  startedAt?: number
  completedAt?: number
  durationMs?: number
  approvalState?: 'not-required' | 'pending' | 'approved' | 'rejected' | 'timed_out' | 'cancelled'
}

export interface AgentRun {
  id: string
  mode: 'agent'
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  startedAt: number
  completedAt?: number
  capabilities: AgentRunCapabilities
  steps: AgentStep[]
}

export interface FileAttachment {
  id: string
  name: string
  type: string
  size: number
  data: string
  mimeType: string
}

export interface ThinkingBlock {
  type: 'thinking' | 'searching' | 'tool'
  content?: string
  query?: string
  duration?: number
  timestamp: number
  toolName?: string
  toolInput?: Record<string, unknown>
  toolOutput?: {
    success: boolean
    data?: unknown
    error?: string
    executionTime?: number
    metadata?: ToolExecutionMetadata
  }
}

export interface ResponseVersion {
  id: string
  content: string
  timestamp: number
  instruction?: string
  model?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  image?: string
  files?: FileAttachment[]
  timestamp: number
  tokenCount?: number
  model?: string
  latency?: number
  thinking?: string
  thinkingDuration?: number
  thinkingBlocks?: ThinkingBlock[]
  toolResults?: ToolCallResult[]
  agentRun?: AgentRun
  researchStatus?: {
    currentRound: number
    maxRounds: number
    currentSearch?: string
    currentSearches?: string[]
    isSearching: boolean
  }
  researchPlan?: {
    topic: string
    steps: Array<{ stepNumber: number; query: string; rationale?: string }>
  }
  researchProgress?: { currentStep: number; totalSteps: number; currentQuery?: string }
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    thinkingTokens?: number
    tps?: number
    ttft?: number
    cachedInputTokens?: number
    cachedOutputTokens?: number
    cacheMissInputTokens?: number
    cacheWriteInputTokens?: number
  }
  finishReason?: string
  requestedMaxTokens?: number
  responseVersions?: ResponseVersion[]
  currentVersionIndex?: number
}

export interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  totalTokens?: number
  pinned?: boolean
  folderId?: string | null
  tags?: string[]
  messageCount?: number
}

export interface ChatSessionMetadata {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  totalTokens?: number
  pinned: boolean
  folderId: string | null
  tags: string[]
  messageCount: number
}

export interface Folder {
  id: string
  name: string
  order: number
  createdAt: number
}

export interface ChatIndexData {
  sessions: ChatSessionMetadata[]
  folders: Folder[]
  version: number
}

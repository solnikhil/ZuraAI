import type { ToolCallResult, ToolExecutionMetadata } from '../tools/types'
import type { ArtifactDocument, ArtifactSummary } from '../artifacts/artifactTypes'
export type { ArtifactDocument, ArtifactSummary } from '../artifacts/artifactTypes'

export type { ToolCallResult }

export type AssistantMode = 'chat' | 'agent'

export type AgentCapabilityState = 'enabled' | 'unavailable' | 'approval-required'

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
  artifacts?: ArtifactDocument[]
  /** Carried on lightweight sessions (from metadata) so index re-saves don't drop old artifact history */
  artifactSummaries?: ArtifactSummary[]
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
  artifactCount?: number
  artifactSummaries?: ArtifactSummary[]
  /** Last ~30 messages for instant preview when switching chats (kept small for perf) */
  recentMessages?: Message[]
}

export interface Folder {
  id: string
  name: string
  order: number
  createdAt: number
  memoryMode?: 'default' | 'folder-only'
}

export interface ChatIndexData {
  sessions: ChatSessionMetadata[]
  folders: Folder[]
  version: number
}

import type { ToolExecutionMetadata } from '../tools/types'

export interface ToolCallResult {
  toolCall: {
    id: string
    name: string
    arguments: Record<string, unknown>
  }
  result: {
    success: boolean
    data?: unknown
    error?: string
    executionTime?: number
    metadata?: ToolExecutionMetadata
  }
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
}

export interface Folder {
  id: string
  name: string
  order: number
  createdAt: number
}

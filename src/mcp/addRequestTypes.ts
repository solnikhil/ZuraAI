import type { McpAuthMode, McpServerConfig, McpServerRuntimeState, McpTransportType } from './types'

export type McpAgentAddRequestMode = 'catalogue' | 'custom'
export type McpAgentAddRequestStatus =
  | 'pending'
  | 'cancelled'
  | 'added'
  | 'connected'
  | 'needs_setup'
  | 'failed'

export interface McpAgentAddCustomConfig {
  name?: string
  transport?: McpTransportType
  command?: string
  args?: string[]
  cwd?: string
  url?: string
  env?: string[]
  headers?: string[]
  authMode?: McpAuthMode
}

export interface McpAgentAddRequestInput {
  mode: McpAgentAddRequestMode
  query?: string
  catalogueEntryId?: string
  reason?: string
  custom?: McpAgentAddCustomConfig
}

export interface McpAgentAddReview {
  requestId: string
  status: McpAgentAddRequestStatus
  mode: McpAgentAddRequestMode
  serverName: string
  sourceLabel: string
  reason: string
  transport: McpTransportType
  command?: string
  args?: string[]
  url?: string
  requiredSecrets: string[]
  authMode: McpAuthMode
  riskNotes: string[]
  canAdd: boolean
  error?: string
  serverId?: string
}

export interface McpAgentAddApproveResult {
  requestId: string
  status: McpAgentAddRequestStatus
  server?: McpServerConfig
  runtimeState?: McpServerRuntimeState
  requiredSecrets: string[]
  error?: string
}

import type {
  McpAuthConfig,
  McpConfigValueSource,
  McpServerTrustState,
  McpTransportType,
} from './types'

export type McpSecretStorageKind = 'env' | 'header' | 'token'

export interface McpDraftConfigValue {
  id: string
  name: string
  valueSource: McpConfigValueSource
  value: string
  secretValue: string
  secretKey?: string
  secretStored: boolean
  clearSecret: boolean
  secretStorageKind: McpSecretStorageKind
}

export interface McpDraftServer {
  id: string
  name: string
  enabled: boolean
  trustState: McpServerTrustState
  transport: McpTransportType
  command: string
  argsText: string
  cwd: string
  url: string
  env: McpDraftConfigValue[]
  headers: McpDraftConfigValue[]
  authToken: McpDraftConfigValue | null
  auth: McpAuthConfig
  autoConnect: boolean
  startupTimeoutMs: string
  toolTimeoutMs: string
  reconnectAttempts: string
  reconnectDelayMs: string
  requireApproval: boolean
  toolAllowlistText: string
  toolBlocklistText: string
  createdAt?: string
  updatedAt?: string
}

export interface McpConfigValueInputPayload {
  name: string
  valueSource: McpConfigValueSource
  value?: string
  secretKey?: string
  secretValue?: string
  clearSecret?: boolean
  secretStorageKind?: McpSecretStorageKind
}

export interface McpServerInputPayload {
  id: string
  name: string
  enabled: boolean
  trustState: McpServerTrustState
  transport: McpTransportType
  command?: string
  args?: string[]
  cwd?: string
  url?: string
  env: McpConfigValueInputPayload[]
  headers: McpConfigValueInputPayload[]
  auth?: McpAuthConfig
  autoConnect: boolean
  startupTimeoutMs?: number
  toolTimeoutMs?: number
  reconnectAttempts?: number
  reconnectDelayMs?: number
  requireApproval: boolean
  toolAllowlist?: string[]
  toolBlocklist?: string[]
  createdAt?: string
  updatedAt?: string
}

export function createEmptyMcpDraftServer(): McpDraftServer {
  const now = new Date().toISOString()
  return {
    id: createDraftId(),
    name: '',
    enabled: false,
    trustState: 'untrusted',
    transport: 'stdio',
    command: '',
    argsText: '',
    cwd: '',
    url: '',
    env: [],
    headers: [],
    authToken: null,
    auth: { mode: 'none', state: 'none' },
    autoConnect: false,
    startupTimeoutMs: '',
    toolTimeoutMs: '',
    reconnectAttempts: '',
    reconnectDelayMs: '',
    requireApproval: true,
    toolAllowlistText: '',
    toolBlocklistText: '',
    createdAt: now,
    updatedAt: now,
  }
}

export function createDraftConfigValue(
  kind: McpSecretStorageKind,
  overrides: Partial<McpDraftConfigValue> = {}
): McpDraftConfigValue {
  return {
    id: createDraftId(),
    name: '',
    valueSource: 'plaintext',
    value: '',
    secretValue: '',
    secretKey: undefined,
    secretStored: false,
    clearSecret: false,
    secretStorageKind: kind,
    ...overrides,
  }
}

function createDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

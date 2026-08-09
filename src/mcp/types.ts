export type McpTransportType = 'stdio' | 'sse' | 'websocket'

export type McpServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type McpServerTrustState = 'untrusted' | 'trusted'

export type McpConfigValueSource = 'plaintext' | 'secret'

export type McpAuthMode =
  | 'none'
  | 'envSecret'
  | 'headerSecret'
  | 'bearerToken'
  | 'basicAuth'
  | 'oauth2Pkce'
  | 'jsonCredential'
  | 'connectionString'

export type McpAuthState = 'none' | 'configured' | 'signed_in' | 'reauth_required' | 'failed'

export interface McpOAuthConfig {
  authorizationServer?: string
  resourceMetadataUrl?: string
  issuer?: string
  authorizationEndpoint?: string
  tokenEndpoint?: string
  registrationEndpoint?: string
  clientId?: string
  clientSecretKey?: string
  accessTokenKey?: string
  refreshTokenKey?: string
  expiresAt?: number
  scope?: string
  tokenType?: string
}

export interface McpAuthConfig {
  mode: McpAuthMode
  state?: McpAuthState
  oauth?: McpOAuthConfig
  lastError?: string | null
  updatedAt?: string
}

export interface McpAuthStatus {
  serverId: string
  mode: McpAuthMode
  state: McpAuthState
  label: string
  requiresSignIn: boolean
  lastError?: string | null
  expiresAt?: number
}

export type McpJsonRpcId = string | number

export interface McpJsonSchema {
  type?: string | string[]
  title?: string
  description?: string
  default?: unknown
  enum?: unknown[]
  properties?: Record<string, McpJsonSchema>
  required?: string[]
  items?: McpJsonSchema | McpJsonSchema[]
  oneOf?: McpJsonSchema[]
  anyOf?: McpJsonSchema[]
  allOf?: McpJsonSchema[]
  additionalProperties?: boolean | McpJsonSchema
  [key: string]: unknown
}

export interface McpConfigValue {
  name: string
  valueSource: McpConfigValueSource
  value?: string
  secretKey?: string
}

export interface McpResolvedConfigValue {
  name: string
  value: string
}

export interface McpToolManifest {
  name: string
  title?: string
  description?: string
  inputSchema: McpJsonSchema
  annotations?: Record<string, unknown>
}

export interface McpResourceManifest {
  uri: string
  name?: string
  title?: string
  description?: string
  mimeType?: string
  size?: number
  annotations?: Record<string, unknown>
}

export interface McpPromptArgument {
  name: string
  title?: string
  description?: string
  required?: boolean
}

export interface McpPromptManifest {
  name: string
  title?: string
  description?: string
  arguments?: McpPromptArgument[]
}

export interface McpExposurePolicy {
  userVisible: boolean
  modelVisible: boolean
  requiresExplicitUserAction: boolean
}

export interface McpResourceContentItem {
  uri: string
  mimeType?: string
  text?: string
  blob?: string
}

export interface McpResourceReadResult {
  contents: McpResourceContentItem[]
}

export interface McpPromptMessage {
  role: string
  content: unknown
}

export interface McpPromptResult {
  description?: string
  messages: McpPromptMessage[]
}

export interface McpServerCapabilities {
  tools: boolean
  resources: boolean
  prompts: boolean
}

export interface McpServerConfig {
  id: string
  name: string
  enabled: boolean
  trustState: McpServerTrustState
  transport: McpTransportType
  command?: string
  args?: string[]
  cwd?: string
  url?: string
  env?: McpConfigValue[]
  headers?: McpConfigValue[]
  auth?: McpAuthConfig
  autoConnect?: boolean
  startupTimeoutMs?: number
  toolTimeoutMs?: number
  reconnectAttempts?: number
  reconnectDelayMs?: number
  requireApproval: boolean
  toolAllowlist?: string[]
  toolBlocklist?: string[]
  lastKnownTools?: McpToolManifest[]
  lastKnownResources?: McpResourceManifest[]
  lastKnownPrompts?: McpPromptManifest[]
  lastConnectionError?: string | null
  lastConnectionTime?: string | null
  createdAt: string
  updatedAt: string
}

export interface McpResolvedServerConfig extends Omit<McpServerConfig, 'env' | 'headers'> {
  env: Record<string, string>
  headers: Record<string, string>
}

export interface McpServerStoreFile {
  version: number
  revision: number
  servers: McpServerConfig[]
}

export interface McpServerConnectionInfo {
  protocolVersion: string
  serverName?: string
  serverVersion?: string
}

export interface McpInitializeResult {
  protocolVersion: string
  capabilities?: {
    tools?: unknown
    resources?: unknown
    prompts?: unknown
    [key: string]: unknown
  }
  serverInfo?: {
    name?: string
    version?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface McpListToolsResult {
  tools?: McpToolManifest[]
  [key: string]: unknown
}

export interface McpServerRuntimeState {
  serverId: string
  status: McpServerStatus
  error?: string
  lastConnectionError?: string | null
  lastConnectionTime?: string | null
  tools: McpToolManifest[]
  resources: McpResourceManifest[]
  prompts: McpPromptManifest[]
  capabilities: McpServerCapabilities
  connectionInfo?: McpServerConnectionInfo
  lastUpdatedAt?: string
}

export interface McpNamespacedToolIdentity {
  namespacedName: string
  serverId: string
  serverName: string
  serverSlug: string
  toolName: string
  toolSlug: string
}

export interface McpNamespacedTool extends McpNamespacedToolIdentity {
  manifest: McpToolManifest
}

export interface McpRuntimeResource {
  serverId: string
  serverName: string
  manifest: McpResourceManifest
  exposure: McpExposurePolicy
}

export interface McpRuntimePrompt {
  serverId: string
  serverName: string
  manifest: McpPromptManifest
  exposure: McpExposurePolicy
}

export interface McpRuntimeSnapshot {
  servers: McpServerConfig[]
  runtimeStates: McpServerRuntimeState[]
  tools: McpNamespacedTool[]
  resources: McpRuntimeResource[]
  prompts: McpRuntimePrompt[]
  pendingApprovals: McpApprovalRequest[]
  authStatuses?: McpAuthStatus[]
}

export interface McpToolLookupRecord {
  namespacedName: string
  serverId: string
  originalToolName: string
}

export interface McpApprovalRequest {
  id: string
  serverId: string
  serverName: string
  serverTransport: McpTransportType
  toolName: string
  namespacedToolName: string
  arguments: Record<string, unknown>
  requestedAt: number
  expiresAt: number
}

export type McpApprovalOutcome = 'approved' | 'rejected' | 'timed_out' | 'cancelled'

export interface McpApprovalDecision {
  requestId: string
  approved: boolean
  resolvedAt: number
  outcome: McpApprovalOutcome
}

export type McpToolApprovalState = 'not-required' | McpApprovalOutcome

export type McpToolExecutionOutcome = 'success' | 'error' | 'rejected' | 'timed_out' | 'cancelled'

export interface McpToolExecutionMetadata {
  origin: 'mcp'
  serverId: string
  serverName: string
  namespacedToolName: string
  originalToolName: string
  trusted: boolean
  approvalState: McpToolApprovalState
  durationMs: number
  outcome: McpToolExecutionOutcome
}

export interface McpToolExecutionResult {
  success: boolean
  data?: unknown
  error?: string
  metadata: McpToolExecutionMetadata
}

export interface McpListResourcesResult {
  resources?: McpResourceManifest[]
  [key: string]: unknown
}

export interface McpReadResourceResult {
  contents?: McpResourceContentItem[]
  [key: string]: unknown
}

export interface McpListPromptsResult {
  prompts?: McpPromptManifest[]
  [key: string]: unknown
}

export interface McpGetPromptResult {
  description?: string
  messages?: McpPromptMessage[]
  [key: string]: unknown
}

export interface McpJsonRpcErrorObject {
  code: number
  message: string
  data?: unknown
}

export interface McpJsonRpcRequest {
  jsonrpc: '2.0'
  id: McpJsonRpcId
  method: string
  params?: unknown
}

export interface McpJsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

export interface McpJsonRpcSuccessResponse {
  jsonrpc: '2.0'
  id: McpJsonRpcId
  result: unknown
}

export interface McpJsonRpcErrorResponse {
  jsonrpc: '2.0'
  id: McpJsonRpcId | null
  error: McpJsonRpcErrorObject
}

export type McpJsonRpcResponse = McpJsonRpcSuccessResponse | McpJsonRpcErrorResponse

export type McpJsonRpcMessage = McpJsonRpcRequest | McpJsonRpcNotification | McpJsonRpcResponse

function toMcpSlug(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return slug || fallback
}

function toMcpServerSlug(serverName: string): string {
  return toMcpSlug(serverName, 'server')
}

function toMcpToolSlug(toolName: string): string {
  return toMcpSlug(toolName, 'tool')
}

export function buildMcpNamespacedToolName(serverName: string, toolName: string): string {
  return `mcp__${toMcpServerSlug(serverName)}__${toMcpToolSlug(toolName)}`
}

export function createMcpNamespacedToolIdentity(
  serverId: string,
  serverName: string,
  toolName: string
): McpNamespacedToolIdentity {
  const serverSlug = toMcpServerSlug(serverName)
  const toolSlug = toMcpToolSlug(toolName)

  return {
    namespacedName: `mcp__${serverSlug}__${toolSlug}`,
    serverId,
    serverName,
    serverSlug,
    toolName,
    toolSlug,
  }
}

export function parseMcpNamespacedToolName(
  namespacedName: string
): Pick<McpNamespacedToolIdentity, 'serverSlug' | 'toolSlug'> | null {
  const match = /^mcp__([a-z0-9_]+)__([a-z0-9_]+)$/.exec(namespacedName)
  if (!match) {
    return null
  }

  const [, serverSlug, toolSlug] = match
  return { serverSlug, toolSlug }
}

import { randomUUID } from 'crypto'

import {
  draftServerToInputPayload,
  type McpConfigValueInputPayload,
  type McpServerInputPayload,
} from '../../src/mcp/draft'
import {
  loadMcpCatalogue,
  type McpCatalogueEntry,
} from '../../src/mcp/catalogue'
import type {
  McpAgentAddApproveResult,
  McpAgentAddCustomConfig,
  McpAgentAddRequestInput,
  McpAgentAddReview,
} from '../../src/mcp/addRequestTypes'
import type { McpAuthMode, McpServerConfig, McpTransportType } from '../../src/mcp/types'
import { normalizeMcpServerConfig } from './mcpStorage'

const PENDING_REQUEST_TTL_MS = 10 * 60_000
const SECRET_VALUE_PATTERN = /(key|token|secret|password|private|credential)/i
const SUPPORTED_TRANSPORTS = new Set<McpTransportType>(['stdio', 'sse', 'websocket'])
const SUPPORTED_AUTH_MODES = new Set<McpAuthMode>([
  'none',
  'envSecret',
  'headerSecret',
  'bearerToken',
  'basicAuth',
  'oauth2Pkce',
  'jsonCredential',
  'connectionString',
])

interface PendingMcpAddRequest {
  review: McpAgentAddReview
  payload: McpServerInputPayload
  createdAt: number
}

const pendingRequests = new Map<string, PendingMcpAddRequest>()

export function createMcpAddRequest(input: unknown): McpAgentAddReview {
  pruneExpiredRequests()
  const parsed = parseRequestInput(input)
  const requestId = randomUUID()

  const resolved =
    parsed.mode === 'catalogue'
      ? resolveCatalogueAddRequest(parsed, requestId)
      : resolveCustomAddRequest(parsed, requestId)

  pendingRequests.set(requestId, {
    review: resolved.review,
    payload: resolved.payload,
    createdAt: Date.now(),
  })

  return cloneReview(resolved.review)
}

export function getPendingMcpAddRequest(requestId: string): McpAgentAddReview {
  const pending = getPendingRequestOrThrow(requestId)
  return cloneReview(pending.review)
}

export function cancelPendingMcpAddRequest(requestId: string): McpAgentAddReview {
  const pending = getPendingRequestOrThrow(requestId)
  pending.review = { ...pending.review, status: 'cancelled' }
  pendingRequests.delete(requestId)
  return cloneReview(pending.review)
}

export async function approvePendingMcpAddRequest(
  requestId: string,
  options: {
    addServer: (payload: McpServerInputPayload) => Promise<McpServerConfig>
    connectServer: (serverId: string) => Promise<McpAgentAddApproveResult['runtimeState']>
    startOAuth: (serverId: string) => Promise<{ ok: boolean; error?: string }>
  }
): Promise<McpAgentAddApproveResult> {
  const pending = getPendingRequestOrThrow(requestId)
  if (!pending.review.canAdd) {
    throw new Error(pending.review.error || 'MCP add request cannot be approved.')
  }

  let server: McpServerConfig
  try {
    server = await options.addServer(pending.payload)
  } catch (error) {
    pending.review = {
      ...pending.review,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }
    return {
      requestId,
      status: 'failed',
      requiredSecrets: pending.review.requiredSecrets,
      error: pending.review.error,
    }
  }

  pending.review = {
    ...pending.review,
    status: 'added',
    serverId: server.id,
  }

  if (pending.review.requiredSecrets.length > 0 && pending.review.authMode !== 'oauth2Pkce') {
    pending.review = { ...pending.review, status: 'needs_setup' }
    pendingRequests.delete(requestId)
    return {
      requestId,
      status: 'needs_setup',
      server,
      requiredSecrets: pending.review.requiredSecrets,
    }
  }

  if (pending.review.authMode === 'oauth2Pkce') {
    const authResult = await options.startOAuth(server.id)
    if (!authResult.ok) {
      pending.review = {
        ...pending.review,
        status: 'needs_setup',
        error: authResult.error || 'MCP OAuth sign-in is required before connecting.',
      }
      pendingRequests.delete(requestId)
      return {
        requestId,
        status: 'needs_setup',
        server,
        requiredSecrets: pending.review.requiredSecrets,
        error: pending.review.error,
      }
    }
  }

  try {
    const runtimeState = await options.connectServer(server.id)
    pending.review = { ...pending.review, status: 'connected' }
    pendingRequests.delete(requestId)
    return {
      requestId,
      status: 'connected',
      server,
      runtimeState,
      requiredSecrets: pending.review.requiredSecrets,
    }
  } catch (error) {
    pending.review = {
      ...pending.review,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }
    pendingRequests.delete(requestId)
    return {
      requestId,
      status: 'failed',
      server,
      requiredSecrets: pending.review.requiredSecrets,
      error: pending.review.error,
    }
  }
}

function resolveCatalogueAddRequest(
  input: McpAgentAddRequestInput,
  requestId: string
): { review: McpAgentAddReview; payload: McpServerInputPayload } {
  const entries = loadMcpCatalogue()
  const entry = findCatalogueEntry(entries, input)
  if (!entry?.supported || !entry.draft) {
    const query = input.catalogueEntryId || input.query || 'requested MCP'
    throw new Error(`No supported bundled MCP catalogue entry found for "${query}".`)
  }

  const draft = {
    ...entry.draft,
    enabled: true,
    trustState: 'untrusted' as const,
    requireApproval: true,
    autoConnect: false,
  }
  const payload = draftServerToInputPayload(draft)
  const authMode = payload.auth?.mode ?? inferAuthModeFromSecrets(entry.secretRequirements)
  const riskNotes = [
    payload.transport === 'stdio'
      ? 'Starts a local MCP process from the reviewed package command.'
      : 'Connects to a remote MCP server URL.',
    'Tools remain untrusted until you review and trust them.',
  ]

  return {
    payload,
    review: {
      requestId,
      status: 'pending',
      mode: 'catalogue',
      serverName: payload.name || entry.title || entry.name,
      sourceLabel: entry.sourceLabel,
      reason: input.reason?.trim() || `Add ${entry.title || entry.name} from the bundled MCP catalogue.`,
      transport: payload.transport,
      command: payload.command,
      args: payload.args,
      url: payload.url,
      requiredSecrets: [...entry.secretRequirements],
      authMode,
      riskNotes,
      canAdd: true,
    },
  }
}

function resolveCustomAddRequest(
  input: McpAgentAddRequestInput,
  requestId: string
): { review: McpAgentAddReview; payload: McpServerInputPayload } {
  const custom = input.custom
  if (!custom || typeof custom !== 'object') {
    throw new Error('Custom MCP add requests require a custom config.')
  }

  assertNoRawSecretValues(custom)

  const transport = normalizeTransport(custom.transport)
  const name = normalizeString(custom.name) || normalizeString(input.query) || 'Custom MCP Server'
  const now = new Date().toISOString()
  const envPayload: McpConfigValueInputPayload[] = normalizeSecretNames(custom.env).map((envName) => ({
    name: envName,
    valueSource: 'secret',
    secretStorageKind: 'env',
  }))
  const headerPayload: McpConfigValueInputPayload[] = normalizeSecretNames(custom.headers).map((headerName) => ({
    name: headerName,
    valueSource: 'secret',
    secretStorageKind: 'header',
  }))

  const rawServer = {
    id: `agent-mcp-${randomUUID()}`,
    name,
    enabled: true,
    trustState: 'untrusted',
    transport,
    command: transport === 'stdio' ? normalizeString(custom.command) : undefined,
    args: normalizeStringArray(custom.args),
    cwd: normalizeString(custom.cwd),
    url: transport === 'stdio' ? undefined : normalizeString(custom.url),
    env: envPayload,
    headers: headerPayload,
    auth: {
      mode: normalizeAuthMode(custom.authMode),
      state: normalizeAuthMode(custom.authMode) === 'none' ? 'none' : 'configured',
      lastError: null,
      updatedAt: now,
    },
    autoConnect: false,
    requireApproval: true,
    createdAt: now,
    updatedAt: now,
  }

  const normalized = normalizeMcpServerConfig(rawServer, 0, now)
  if (!normalized) {
    throw new Error('Custom MCP server config is invalid.')
  }
  if (normalized.transport === 'stdio' && !normalized.command) {
    throw new Error('Custom stdio MCP servers require a command.')
  }
  if (normalized.transport !== 'stdio' && !normalized.url) {
    throw new Error('Custom remote MCP servers require a URL.')
  }
  if (normalized.transport !== 'stdio') {
    try {
      const parsedUrl = new URL(normalized.url ?? '')
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsedUrl.protocol)) {
        throw new Error('unsupported protocol')
      }
    } catch {
      throw new Error('Custom remote MCP servers require a valid URL.')
    }
  }

  const payload: McpServerInputPayload = {
    id: normalized.id,
    name: normalized.name,
    enabled: true,
    trustState: 'untrusted',
    transport: normalized.transport,
    command: normalized.command,
    args: normalized.args ?? [],
    cwd: normalized.cwd,
    url: normalized.url,
    env: envPayload,
    headers: headerPayload,
    auth: normalized.auth,
    autoConnect: false,
    requireApproval: true,
  }
  const requiredSecrets = [
    ...normalizeSecretNames(custom.env),
    ...normalizeSecretNames(custom.headers),
  ]

  return {
    payload,
    review: {
      requestId,
      status: 'pending',
      mode: 'custom',
      serverName: normalized.name,
      sourceLabel: 'Custom MCP config',
      reason: input.reason?.trim() || 'Add a custom MCP server requested by the agent.',
      transport: normalized.transport,
      command: normalized.command,
      args: normalized.args ?? [],
      url: normalized.url,
      requiredSecrets,
      authMode: normalized.auth?.mode ?? 'none',
      riskNotes: [
        'Custom MCP config was proposed by the agent and needs careful review.',
        normalized.transport === 'stdio'
          ? 'This will start a local process with the shown command.'
          : 'This will connect to the shown remote URL.',
        'Tools remain untrusted until you review and trust them.',
      ],
      canAdd: true,
    },
  }
}

function parseRequestInput(value: unknown): McpAgentAddRequestInput {
  if (!isRecord(value)) {
    throw new Error('MCP add request arguments must be an object.')
  }

  const mode = value.mode === 'custom' ? 'custom' : 'catalogue'
  return {
    mode,
    query: normalizeString(value.query),
    catalogueEntryId: normalizeString(value.catalogueEntryId),
    reason: normalizeString(value.reason),
    custom: isRecord(value.custom) ? value.custom as McpAgentAddCustomConfig : undefined,
  }
}

function findCatalogueEntry(
  entries: McpCatalogueEntry[],
  input: McpAgentAddRequestInput
): McpCatalogueEntry | undefined {
  const id = input.catalogueEntryId?.trim()
  if (id) {
    return entries.find((entry) => entry.id === id || entry.name === id)
  }

  const query = input.query?.trim().toLowerCase()
  if (!query) {
    throw new Error('Catalogue MCP add requests require a query or catalogueEntryId.')
  }

  return entries.find((entry) =>
    [entry.title, entry.name, entry.description, entry.publisher]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(query))
  )
}

function getPendingRequestOrThrow(requestId: string): PendingMcpAddRequest {
  pruneExpiredRequests()
  const trimmed = typeof requestId === 'string' ? requestId.trim() : ''
  if (!trimmed) {
    throw new Error('MCP add request id is required.')
  }

  const pending = pendingRequests.get(trimmed)
  if (!pending) {
    throw new Error('MCP add request was not found or has expired.')
  }
  return pending
}

function pruneExpiredRequests(): void {
  const now = Date.now()
  for (const [requestId, pending] of pendingRequests) {
    if (now - pending.createdAt > PENDING_REQUEST_TTL_MS) {
      pendingRequests.delete(requestId)
    }
  }
}

function normalizeTransport(value: unknown): McpTransportType {
  if (value === 'stdio' || value === 'sse' || value === 'websocket') {
    return value
  }
  if (typeof value === 'string' && value.trim() && !SUPPORTED_TRANSPORTS.has(value as McpTransportType)) {
    throw new Error(`Unsupported MCP transport: ${value}`)
  }
  return 'stdio'
}

function normalizeAuthMode(value: unknown): McpAuthMode {
  if (typeof value === 'string' && SUPPORTED_AUTH_MODES.has(value as McpAuthMode)) {
    return value as McpAuthMode
  }
  return 'none'
}

function inferAuthModeFromSecrets(secretRequirements: string[]): McpAuthMode {
  if (secretRequirements.length > 0) return 'envSecret'
  return 'none'
}

function normalizeSecretNames(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values
    .map((value) => normalizeString(value))
    .filter(Boolean))]
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return values.map((value) => normalizeString(value)).filter(Boolean)
}

function assertNoRawSecretValues(custom: McpAgentAddCustomConfig): void {
  for (const [key, value] of Object.entries(custom as Record<string, unknown>)) {
    if (typeof value === 'string' && SECRET_VALUE_PATTERN.test(key) && value.trim()) {
      throw new Error(`Custom MCP add requests must not include raw secret values (${key}).`)
    }
  }

  for (const arg of normalizeStringArray(custom.args)) {
    if (/^--?(api[-_]?key|token|secret|password|private[-_]?key)(=|$)/i.test(arg)) {
      throw new Error('Custom MCP add requests must not include raw secret values in args.')
    }
  }
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneReview(review: McpAgentAddReview): McpAgentAddReview {
  return {
    ...review,
    args: review.args ? [...review.args] : undefined,
    requiredSecrets: [...review.requiredSecrets],
    riskNotes: [...review.riskNotes],
  }
}

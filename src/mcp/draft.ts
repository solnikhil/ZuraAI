import type {
  McpConfigValue,
  McpConfigValueSource,
  McpServerConfig,
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

interface ComparableConfigValue {
  name: string
  valueSource: McpConfigValueSource
  value?: string
  secretKey?: string
  secretStorageKind?: McpSecretStorageKind
}

interface ComparableServer {
  id: string
  name: string
  enabled: boolean
  trustState: McpServerTrustState
  transport: McpTransportType
  command?: string
  args: string[]
  cwd?: string
  url?: string
  env: ComparableConfigValue[]
  headers: ComparableConfigValue[]
  autoConnect: boolean
  startupTimeoutMs?: number
  toolTimeoutMs?: number
  reconnectAttempts?: number
  reconnectDelayMs?: number
  requireApproval: boolean
  toolAllowlist: string[]
  toolBlocklist: string[]
}

const AUTHORIZATION_HEADER_NAME = 'Authorization'

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

export function mcpServerToDraftServer(server: McpServerConfig): McpDraftServer {
  const { authToken, headers } = splitAuthTokenFromHeaders(server.headers ?? [])

  return {
    id: server.id,
    name: server.name,
    enabled: server.enabled,
    trustState: server.trustState,
    transport: server.transport,
    command: server.command ?? '',
    argsText: (server.args ?? []).join('\n'),
    cwd: server.cwd ?? '',
    url: server.url ?? '',
    env: (server.env ?? []).map((entry, index) => configValueToDraft(entry, 'env', index)),
    headers: headers.map((entry, index) => configValueToDraft(entry, 'header', index)),
    authToken,
    autoConnect: server.autoConnect ?? false,
    startupTimeoutMs: toNumberInput(server.startupTimeoutMs),
    toolTimeoutMs: toNumberInput(server.toolTimeoutMs),
    reconnectAttempts: toNumberInput(server.reconnectAttempts),
    reconnectDelayMs: toNumberInput(server.reconnectDelayMs),
    requireApproval: server.requireApproval,
    toolAllowlistText: (server.toolAllowlist ?? []).join('\n'),
    toolBlocklistText: (server.toolBlocklist ?? []).join('\n'),
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  }
}

export function draftServerToInputPayload(draft: McpDraftServer): McpServerInputPayload {
  const env = draft.env
    .map((entry) => draftConfigValueToPayload(entry))
    .filter((entry): entry is McpConfigValueInputPayload => entry !== null)
  const headers = draft.headers
    .map((entry) => draftConfigValueToPayload(entry))
    .filter((entry): entry is McpConfigValueInputPayload => entry !== null)

  const authTokenPayload = draftAuthTokenToPayload(draft.authToken)
  if (authTokenPayload) {
    headers.unshift(authTokenPayload)
  }

  return {
    id: draft.id,
    name: draft.name.trim(),
    enabled: draft.enabled,
    trustState: draft.trustState,
    transport: draft.transport,
    command: normalizeOptionalString(draft.command),
    args: parseArgsText(draft.argsText),
    cwd: normalizeOptionalString(draft.cwd),
    url: normalizeOptionalString(draft.url),
    env,
    headers,
    autoConnect: draft.autoConnect,
    startupTimeoutMs: normalizeOptionalInteger(draft.startupTimeoutMs),
    toolTimeoutMs: normalizeOptionalInteger(draft.toolTimeoutMs),
    reconnectAttempts: normalizeOptionalInteger(draft.reconnectAttempts),
    reconnectDelayMs: normalizeOptionalInteger(draft.reconnectDelayMs),
    requireApproval: draft.requireApproval,
    toolAllowlist: parseListText(draft.toolAllowlistText),
    toolBlocklist: parseListText(draft.toolBlocklistText),
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  }
}

export function isDraftServerEqualToLiveServer(
  draft: McpDraftServer,
  liveServer: McpServerConfig
): boolean {
  if (hasPendingSecretEdits(draft)) {
    return false
  }

  return JSON.stringify(toComparableServerFromDraft(draft)) === JSON.stringify(toComparableServerFromLive(liveServer))
}

export function validateDraftServer(draft: McpDraftServer): string[] {
  const errors: string[] = []

  if (!draft.name.trim()) {
    errors.push('Server name is required.')
  }

  if (draft.transport === 'stdio' && !draft.command.trim()) {
    errors.push('A stdio server needs a command.')
  }

  if (draft.transport !== 'stdio') {
    const url = draft.url.trim()
    if (!url) {
      errors.push('A remote server needs a URL.')
    } else {
      try {
        const parsed = new URL(url)
        if (!parsed.protocol) {
          errors.push('Remote server URL is invalid.')
        }
      } catch {
        errors.push('Remote server URL is invalid.')
      }
    }
  }

  validateConfigEntries('Environment variable', draft.env, errors)
  validateConfigEntries('Header', draft.headers, errors)

  if (draft.authToken) {
    validateSecretEntry('Auth token', draft.authToken, errors)
  }

  validateNumericField('Startup timeout', draft.startupTimeoutMs, errors)
  validateNumericField('Tool timeout', draft.toolTimeoutMs, errors)
  validateNumericField('Reconnect attempts', draft.reconnectAttempts, errors)
  validateNumericField('Reconnect delay', draft.reconnectDelayMs, errors)
  validateToolPolicy(draft.toolAllowlistText, draft.toolBlocklistText, errors)

  return dedupeStrings(errors)
}

function configValueToDraft(
  entry: McpConfigValue,
  fallbackStorageKind: McpSecretStorageKind,
  index: number
): McpDraftConfigValue {
  return {
    id: `${fallbackStorageKind}-${entry.name}-${index}`,
    name: entry.name,
    valueSource: entry.valueSource,
    value: entry.valueSource === 'plaintext' ? entry.value ?? '' : '',
    secretValue: '',
    secretKey: entry.secretKey,
    secretStored: entry.valueSource === 'secret' && Boolean(entry.secretKey),
    clearSecret: false,
    secretStorageKind:
      fallbackStorageKind === 'header' && entry.secretKey?.endsWith('.token') ? 'token' : fallbackStorageKind,
  }
}

function splitAuthTokenFromHeaders(headers: McpConfigValue[]): {
  authToken: McpDraftConfigValue | null
  headers: McpConfigValue[]
} {
  const remainingHeaders: McpConfigValue[] = []
  let authToken: McpDraftConfigValue | null = null

  headers.forEach((entry, index) => {
    if (authToken == null && entry.name.toLowerCase() === AUTHORIZATION_HEADER_NAME.toLowerCase()) {
      authToken = configValueToAuthTokenDraft(entry, index)
      return
    }

    remainingHeaders.push(entry)
  })

  return {
    authToken,
    headers: remainingHeaders,
  }
}

function configValueToAuthTokenDraft(entry: McpConfigValue, index: number): McpDraftConfigValue {
  const storageKind: McpSecretStorageKind = entry.secretKey?.endsWith('.token') ? 'token' : 'header'
  const tokenValue = entry.valueSource === 'plaintext' ? stripBearerPrefix(entry.value ?? '') : ''

  return {
    id: `token-${index}`,
    name: AUTHORIZATION_HEADER_NAME,
    valueSource: entry.valueSource,
    value: tokenValue,
    secretValue: '',
    secretKey: entry.secretKey,
    secretStored: entry.valueSource === 'secret' && Boolean(entry.secretKey),
    clearSecret: false,
    secretStorageKind: storageKind,
  }
}

function draftConfigValueToPayload(entry: McpDraftConfigValue): McpConfigValueInputPayload | null {
  const name = entry.name.trim()
  if (!name) {
    return null
  }

  if (entry.valueSource === 'plaintext') {
    return {
      name,
      valueSource: 'plaintext',
      value: entry.value,
      secretStorageKind: entry.secretStorageKind,
    }
  }

  return {
    name,
    valueSource: 'secret',
    secretKey: normalizeOptionalString(entry.secretKey),
    secretValue: normalizeOptionalString(entry.secretValue),
    clearSecret: entry.clearSecret,
    secretStorageKind: entry.secretStorageKind,
  }
}

function draftAuthTokenToPayload(entry: McpDraftConfigValue | null): McpConfigValueInputPayload | null {
  if (!entry) {
    return null
  }

  if (entry.valueSource === 'plaintext') {
    const token = entry.value.trim()
    if (!token) {
      return null
    }

    return {
      name: AUTHORIZATION_HEADER_NAME,
      valueSource: 'plaintext',
      value: ensureBearerPrefix(token),
      secretStorageKind: 'token',
    }
  }

  if (!entry.secretStored && !entry.secretValue.trim() && !entry.clearSecret) {
    return null
  }

  return {
    name: AUTHORIZATION_HEADER_NAME,
    valueSource: 'secret',
    secretKey: normalizeOptionalString(entry.secretKey),
    secretValue: entry.secretValue.trim() ? ensureBearerPrefix(entry.secretValue) : undefined,
    clearSecret: entry.clearSecret,
    secretStorageKind: 'token',
  }
}

function toComparableServerFromDraft(draft: McpDraftServer): ComparableServer {
  const payload = draftServerToInputPayload(draft)

  return normalizeComparableServer({
    id: payload.id,
    name: payload.name,
    enabled: payload.enabled,
    trustState: payload.trustState,
    transport: payload.transport,
    command: payload.command,
    args: payload.args ?? [],
    cwd: payload.cwd,
    url: payload.url,
    env: payload.env,
    headers: payload.headers,
    autoConnect: payload.autoConnect,
    startupTimeoutMs: payload.startupTimeoutMs,
    toolTimeoutMs: payload.toolTimeoutMs,
    reconnectAttempts: payload.reconnectAttempts,
    reconnectDelayMs: payload.reconnectDelayMs,
    requireApproval: payload.requireApproval,
    toolAllowlist: payload.toolAllowlist ?? [],
    toolBlocklist: payload.toolBlocklist ?? [],
  })
}

function toComparableServerFromLive(server: McpServerConfig): ComparableServer {
  return normalizeComparableServer({
    id: server.id,
    name: server.name,
    enabled: server.enabled,
    trustState: server.trustState,
    transport: server.transport,
    command: server.command,
    args: server.args ?? [],
    cwd: server.cwd,
    url: server.url,
    env: server.env ?? [],
    headers: server.headers ?? [],
    autoConnect: server.autoConnect ?? false,
    startupTimeoutMs: server.startupTimeoutMs,
    toolTimeoutMs: server.toolTimeoutMs,
    reconnectAttempts: server.reconnectAttempts,
    reconnectDelayMs: server.reconnectDelayMs,
    requireApproval: server.requireApproval,
    toolAllowlist: server.toolAllowlist ?? [],
    toolBlocklist: server.toolBlocklist ?? [],
  })
}

function normalizeComparableServer(server: ComparableServer): ComparableServer {
  return {
    ...server,
    command: normalizeOptionalString(server.command),
    args: [...server.args].map((entry) => entry.trim()).filter(Boolean),
    cwd: normalizeOptionalString(server.cwd),
    url: normalizeOptionalString(server.url),
    env: sortComparableConfigValues(server.env.map(toComparableConfigValue)),
    headers: sortComparableConfigValues(server.headers.map(toComparableConfigValue)),
    startupTimeoutMs: normalizeOptionalNumber(server.startupTimeoutMs),
    toolTimeoutMs: normalizeOptionalNumber(server.toolTimeoutMs),
    reconnectAttempts: normalizeOptionalNumber(server.reconnectAttempts),
    reconnectDelayMs: normalizeOptionalNumber(server.reconnectDelayMs),
    toolAllowlist: [...server.toolAllowlist].map((entry) => entry.trim()).filter(Boolean).sort(),
    toolBlocklist: [...server.toolBlocklist].map((entry) => entry.trim()).filter(Boolean).sort(),
  }
}

function toComparableConfigValue(
  entry: McpConfigValue | McpConfigValueInputPayload
): ComparableConfigValue {
  const secretStorageKind =
    'secretStorageKind' in entry ? entry.secretStorageKind : undefined

  return {
    name: entry.name.trim(),
    valueSource: entry.valueSource,
    value: entry.valueSource === 'plaintext' ? entry.value ?? '' : undefined,
    secretKey: entry.valueSource === 'secret' ? normalizeOptionalString(entry.secretKey) : undefined,
    secretStorageKind:
      entry.valueSource === 'secret' && entry.secretKey?.endsWith('.token')
        ? 'token'
        : secretStorageKind,
  }
}

function sortComparableConfigValues(values: ComparableConfigValue[]): ComparableConfigValue[] {
  return [...values].sort((left, right) => {
    return [left.name, left.valueSource, left.value ?? '', left.secretKey ?? ''].join('|').localeCompare(
      [right.name, right.valueSource, right.value ?? '', right.secretKey ?? ''].join('|')
    )
  })
}

function hasPendingSecretEdits(draft: McpDraftServer): boolean {
  return [...draft.env, ...draft.headers, ...(draft.authToken ? [draft.authToken] : [])].some(
    (entry) => entry.valueSource === 'secret' && (entry.clearSecret || entry.secretValue.trim().length > 0)
  )
}

function validateConfigEntries(
  label: string,
  entries: McpDraftConfigValue[],
  errors: string[]
): void {
  const seenNames = new Set<string>()

  entries.forEach((entry) => {
    const name = entry.name.trim()
    if (!name) {
      errors.push(`${label} name is required.`)
      return
    }

    const normalizedName = name.toLowerCase()
    if (seenNames.has(normalizedName)) {
      errors.push(`${label}s must use unique names.`)
      return
    }
    seenNames.add(normalizedName)

    validateSecretEntry(`${label} ${name}`, entry, errors)
  })
}

function validateSecretEntry(label: string, entry: McpDraftConfigValue, errors: string[]): void {
  if (entry.valueSource !== 'secret') {
    return
  }

  const hasStoredSecret = entry.secretStored && !entry.clearSecret
  const hasNewSecret = entry.secretValue.trim().length > 0
  if (!hasStoredSecret && !hasNewSecret) {
    errors.push(`${label} needs a secret value or a stored secret.`)
  }
}

function validateNumericField(label: string, rawValue: string, errors: string[]): void {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    return
  }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    errors.push(`${label} must be a non-negative whole number.`)
  }
}

function parseArgsText(argsText: string): string[] {
  return argsText
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function toNumberInput(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function normalizeOptionalInteger(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    return undefined
  }

  return Math.max(0, Math.round(parsed))
}

function normalizeOptionalNumber(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  return value
}

function ensureBearerPrefix(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  return /^bearer\s+/i.test(trimmed) ? trimmed : `Bearer ${trimmed}`
}

function stripBearerPrefix(value: string): string {
  return value.trim().replace(/^bearer\s+/i, '')
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function parseListText(value: string | undefined): string[] {
  return [...new Set((value ?? '').split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean))]
}

function validateToolPolicy(allowlistText: string | undefined, blocklistText: string | undefined, errors: string[]): void {
  const allowlist = new Set(parseListText(allowlistText).map((entry) => entry.toLowerCase()))
  const blocklist = new Set(parseListText(blocklistText).map((entry) => entry.toLowerCase()))

  for (const toolName of allowlist) {
    if (blocklist.has(toolName)) {
      errors.push(`Tool policy conflict: "${toolName}" appears in both the allowlist and blocklist.`)
    }
  }
}

function createDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

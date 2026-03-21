import { app } from 'electron'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'

import { getSecureValueAsync } from '../secureStorage'

import type {
  McpConfigValue,
  McpJsonSchema,
  McpResolvedServerConfig,
  McpServerConfig,
  McpServerStoreFile,
  McpServerTrustState,
  McpToolManifest,
  McpTransportType,
} from '../../src/mcp/types'

export const MCP_SERVER_STORE_VERSION = 1

let cachedStore: McpServerStoreFile | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 1000

let pendingWrite: Promise<void> = Promise.resolve()

function getDefaultStore(): McpServerStoreFile {
  return {
    version: MCP_SERVER_STORE_VERSION,
    servers: [],
  }
}

export function getMcpStoreFilePath(): string {
  return path.join(app.getPath('userData'), 'mcp-servers.json')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function normalizeTransport(value: unknown): McpTransportType {
  return value === 'sse' || value === 'websocket' ? value : 'stdio'
}

function normalizeTrustState(value: unknown): McpServerTrustState {
  return value === 'trusted' ? 'trusted' : 'untrusted'
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function normalizeJsonSchema(value: unknown): McpJsonSchema {
  return isRecord(value) ? { ...value } as McpJsonSchema : {}
}

function normalizeToolManifest(value: unknown): McpToolManifest | null {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim()) {
    return null
  }

  return {
    name: value.name.trim(),
    title: typeof value.title === 'string' && value.title.trim() ? value.title.trim() : undefined,
    description:
      typeof value.description === 'string' && value.description.trim()
        ? value.description.trim()
        : undefined,
    inputSchema: normalizeJsonSchema(value.inputSchema),
    annotations: isRecord(value.annotations) ? { ...value.annotations } : undefined,
  }
}

function normalizeToolManifestList(value: unknown): McpToolManifest[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(normalizeToolManifest)
    .filter((tool): tool is McpToolManifest => tool !== null)
}

function normalizeConfigValue(value: unknown): McpConfigValue | null {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim()) {
    return null
  }

  const valueSource = value.valueSource === 'secret' ? 'secret' : 'plaintext'
  const normalized: McpConfigValue = {
    name: value.name.trim(),
    valueSource,
  }

  if (valueSource === 'secret') {
    if (typeof value.secretKey === 'string' && value.secretKey.trim()) {
      normalized.secretKey = value.secretKey.trim()
    }
  } else if (typeof value.value === 'string') {
    normalized.value = value.value
  }

  return normalized
}

function normalizeConfigValueList(value: unknown): McpConfigValue[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(normalizeConfigValue)
    .filter((entry): entry is McpConfigValue => entry !== null)
}

export function buildMcpSecretStorageKey(
  serverId: string,
  kind: 'env' | 'header' | 'token',
  name?: string
): string {
  const safeServerId = serverId.trim()
  const safeName = name?.trim()

  if (kind === 'token') {
    return `mcp.server.${safeServerId}.token`
  }

  return `mcp.server.${safeServerId}.${kind}.${safeName ?? 'value'}`
}

export function normalizeMcpServerConfig(
  raw: unknown,
  index: number,
  now = new Date().toISOString()
): McpServerConfig | null {
  if (!isRecord(raw)) {
    return null
  }

  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `mcp-server-${index + 1}`
  const name =
    typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : `MCP Server ${index + 1}`

  return {
    id,
    name,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : false,
    trustState: normalizeTrustState(raw.trustState),
    transport: normalizeTransport(raw.transport),
    command: typeof raw.command === 'string' && raw.command.trim() ? raw.command.trim() : undefined,
    args: normalizeStringArray(raw.args),
    cwd: typeof raw.cwd === 'string' && raw.cwd.trim() ? raw.cwd.trim() : undefined,
    url: typeof raw.url === 'string' && raw.url.trim() ? raw.url.trim() : undefined,
    env: normalizeConfigValueList(raw.env),
    headers: normalizeConfigValueList(raw.headers),
    autoConnect: typeof raw.autoConnect === 'boolean' ? raw.autoConnect : false,
    startupTimeoutMs:
      typeof raw.startupTimeoutMs === 'number' && Number.isFinite(raw.startupTimeoutMs)
        ? Math.max(0, Math.round(raw.startupTimeoutMs))
        : undefined,
    toolTimeoutMs:
      typeof raw.toolTimeoutMs === 'number' && Number.isFinite(raw.toolTimeoutMs)
        ? Math.max(0, Math.round(raw.toolTimeoutMs))
        : undefined,
    reconnectAttempts:
      typeof raw.reconnectAttempts === 'number' && Number.isFinite(raw.reconnectAttempts)
        ? Math.max(0, Math.round(raw.reconnectAttempts))
        : undefined,
    reconnectDelayMs:
      typeof raw.reconnectDelayMs === 'number' && Number.isFinite(raw.reconnectDelayMs)
        ? Math.max(0, Math.round(raw.reconnectDelayMs))
        : undefined,
    requireApproval: typeof raw.requireApproval === 'boolean' ? raw.requireApproval : true,
    lastKnownTools: normalizeToolManifestList(raw.lastKnownTools),
    lastConnectionError:
      raw.lastConnectionError == null
        ? null
        : typeof raw.lastConnectionError === 'string'
          ? raw.lastConnectionError
          : null,
    lastConnectionTime:
      raw.lastConnectionTime == null
        ? null
        : typeof raw.lastConnectionTime === 'string' && raw.lastConnectionTime.trim()
          ? raw.lastConnectionTime
          : null,
    createdAt: normalizeTimestamp(raw.createdAt, now),
    updatedAt: normalizeTimestamp(raw.updatedAt, now),
  }
}

export function normalizeMcpStore(raw: unknown, now = new Date().toISOString()): McpServerStoreFile {
  const input = isRecord(raw) ? raw : {}
  const version =
    typeof input.version === 'number' && Number.isFinite(input.version)
      ? Math.max(1, Math.round(input.version))
      : MCP_SERVER_STORE_VERSION

  const normalizedServers = Array.isArray(input.servers)
    ? input.servers
        .map((server, index) => normalizeMcpServerConfig(server, index, now))
        .filter((server): server is McpServerConfig => server !== null)
    : []

  return {
    version: version < MCP_SERVER_STORE_VERSION ? MCP_SERVER_STORE_VERSION : version,
    servers: normalizedServers,
  }
}

function migrateMcpStore(store: McpServerStoreFile): McpServerStoreFile {
  if (store.version < MCP_SERVER_STORE_VERSION) {
    return {
      version: MCP_SERVER_STORE_VERSION,
      servers: store.servers,
    }
  }

  return store
}

async function readMcpStoreInternal(): Promise<McpServerStoreFile> {
  if (cachedStore && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedStore
  }

  const filePath = getMcpStoreFilePath()
  try {
    if (!fsSync.existsSync(filePath)) {
      const emptyStore = getDefaultStore()
      cachedStore = emptyStore
      cacheTimestamp = Date.now()
      return emptyStore
    }

    const file = await fs.readFile(filePath, 'utf-8')
    const parsed = normalizeMcpStore(JSON.parse(file))
    const migrated = migrateMcpStore(parsed)
    cachedStore = migrated
    cacheTimestamp = Date.now()
    return migrated
  } catch (error) {
    console.error('[MCP Storage] Failed to read MCP server config:', error)
    const emptyStore = getDefaultStore()
    cachedStore = emptyStore
    cacheTimestamp = Date.now()
    return emptyStore
  }
}

async function writeMcpStoreInternal(store: McpServerStoreFile): Promise<void> {
  const normalized = normalizeMcpStore(store)
  const filePath = getMcpStoreFilePath()

  const doWrite = async () => {
    const dir = path.dirname(filePath)
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true })
    }

    await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), 'utf-8')
    cachedStore = normalized
    cacheTimestamp = Date.now()
  }

  pendingWrite = pendingWrite.then(doWrite)
  await pendingWrite
}

export async function loadMcpServerStore(): Promise<McpServerStoreFile> {
  return readMcpStoreInternal()
}

export async function loadMcpServers(): Promise<McpServerConfig[]> {
  const store = await readMcpStoreInternal()
  return store.servers
}

export async function saveMcpServerStore(store: McpServerStoreFile): Promise<void> {
  await writeMcpStoreInternal({
    version: MCP_SERVER_STORE_VERSION,
    servers: store.servers,
  })
}

export async function saveMcpServers(servers: McpServerConfig[]): Promise<void> {
  await writeMcpStoreInternal({
    version: MCP_SERVER_STORE_VERSION,
    servers,
  })
}

function configValuesToRecord(values: McpConfigValue[]): Promise<Record<string, string>> {
  return values.reduce<Promise<Record<string, string>>>(async (accPromise, entry) => {
    const acc = await accPromise

    if (entry.valueSource === 'secret') {
      const secretKey = entry.secretKey?.trim()
      if (secretKey) {
        const resolved = await getSecureValueAsync(secretKey)
        if (resolved) {
          acc[entry.name] = resolved
        }
      }
      return acc
    }

    acc[entry.name] = entry.value ?? ''
    return acc
  }, Promise.resolve({}))
}

export async function resolveMcpServerSecrets(
  server: McpServerConfig
): Promise<McpResolvedServerConfig> {
  const normalized = normalizeMcpServerConfig(server, 0)
  if (!normalized) {
    throw new Error('Cannot resolve secrets for invalid MCP server config')
  }

  const env = await configValuesToRecord(normalized.env ?? [])
  const headers = await configValuesToRecord(normalized.headers ?? [])

  return {
    ...normalized,
    env,
    headers,
  }
}

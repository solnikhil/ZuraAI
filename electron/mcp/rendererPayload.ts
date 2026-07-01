import type { McpAuthConfig, McpAuthMode, McpConfigValue, McpServerConfig } from '../../src/mcp/types'

import { setSecureValueAsync } from '../secureStorage'

import { buildMcpSecretStorageKey } from './mcpStorage'

type RendererSecretStorageKind = 'env' | 'header' | 'token'

export async function prepareRendererMcpServerInput(
  rawServer: unknown,
  options: {
    serverId: string
    existingServer?: McpServerConfig
  }
): Promise<Record<string, unknown>> {
  const input = isRecord(rawServer) ? { ...rawServer } : {}
  const env = await prepareConfigValueList(input.env, {
    serverId: options.serverId,
    kind: 'env',
    existingValues: options.existingServer?.env ?? [],
  })
  const headers = await prepareConfigValueList(input.headers, {
    serverId: options.serverId,
    kind: 'header',
    existingValues: options.existingServer?.headers ?? [],
  })

  const nextSecretKeys = new Set<string>([
    ...env.usedSecretKeys,
    ...headers.usedSecretKeys,
  ])
  const previousSecretKeys = collectServerSecretKeys(options.existingServer)

  await Promise.all(
    [...previousSecretKeys]
      .filter((secretKey) => !nextSecretKeys.has(secretKey))
      .map((secretKey) => setSecureValueAsync(secretKey, ''))
  )

  return {
    id: options.serverId,
    name: getOptionalTrimmedString(input.name),
    enabled: normalizeBoolean(input.enabled, options.existingServer?.enabled ?? false),
    trustState: normalizeTrustState(input.trustState, options.existingServer?.trustState ?? 'untrusted'),
    transport: normalizeTransport(input.transport, options.existingServer?.transport),
    command: getOptionalTrimmedString(input.command),
    args: normalizeStringArray(input.args),
    cwd: getOptionalTrimmedString(input.cwd),
    url: getOptionalTrimmedString(input.url),
    env: env.values,
    headers: headers.values,
    auth: normalizeRendererAuthConfig(input.auth, options.serverId, options.existingServer?.auth),
    autoConnect: normalizeBoolean(input.autoConnect, options.existingServer?.autoConnect ?? false),
    startupTimeoutMs: normalizeOptionalInteger(input.startupTimeoutMs),
    toolTimeoutMs: normalizeOptionalInteger(input.toolTimeoutMs),
    reconnectAttempts: normalizeOptionalInteger(input.reconnectAttempts),
    reconnectDelayMs: normalizeOptionalInteger(input.reconnectDelayMs),
    requireApproval: normalizeBoolean(input.requireApproval, options.existingServer?.requireApproval ?? true),
    toolAllowlist: normalizeStringArray(input.toolAllowlist),
    toolBlocklist: normalizeStringArray(input.toolBlocklist),
  }
}

export async function clearMcpServerSecrets(server: McpServerConfig | undefined): Promise<void> {
  if (!server) {
    return
  }

  await Promise.all([...collectServerSecretKeys(server)].map((secretKey) => setSecureValueAsync(secretKey, '')))
}

async function prepareConfigValueList(
  rawValues: unknown,
  options: {
    serverId: string
    kind: 'env' | 'header'
    existingValues: McpConfigValue[]
  }
): Promise<{ values: McpConfigValue[]; usedSecretKeys: Set<string> }> {
  const existingValuesByName = new Map(
    options.existingValues.map((entry) => [entry.name.toLowerCase(), entry])
  )
  const values: McpConfigValue[] = []
  const usedSecretKeys = new Set<string>()

  if (!Array.isArray(rawValues)) {
    return { values, usedSecretKeys }
  }

  for (const rawValue of rawValues) {
    const prepared = await prepareConfigValue(rawValue, {
      serverId: options.serverId,
      kind: options.kind,
      existingValue: getExistingConfigValue(rawValue, existingValuesByName),
    })

    if (!prepared) {
      continue
    }

    values.push(prepared.value)
    if (prepared.secretKey) {
      usedSecretKeys.add(prepared.secretKey)
    }
  }

  return { values, usedSecretKeys }
}

async function prepareConfigValue(
  rawValue: unknown,
  options: {
    serverId: string
    kind: 'env' | 'header'
    existingValue?: McpConfigValue
  }
): Promise<{ value: McpConfigValue; secretKey?: string } | null> {
  if (!isRecord(rawValue)) {
    return null
  }

  const name = typeof rawValue.name === 'string' ? rawValue.name.trim() : ''
  if (!name) {
    return null
  }

  const valueSource = rawValue.valueSource === 'secret' ? 'secret' : 'plaintext'
  if (valueSource === 'plaintext') {
    return {
      value: {
        name,
        valueSource: 'plaintext',
        value: typeof rawValue.value === 'string' ? rawValue.value : '',
      },
    }
  }

  const storageKind = normalizeSecretStorageKind(rawValue.secretStorageKind, options.kind)
  const expectedSecretKey = buildMcpSecretStorageKey(
    options.serverId,
    storageKind,
    storageKind === 'token' ? undefined : name
  )
  const rendererProvidedSecretKey =
    typeof rawValue.secretKey === 'string' && rawValue.secretKey.trim()
      ? rawValue.secretKey.trim()
      : undefined
  const existingSecretKey = options.existingValue?.secretKey?.trim()
  const reusableExistingSecretKey =
    existingSecretKey && isSafeSecretKeyForServer(existingSecretKey, options.serverId)
      ? existingSecretKey
      : undefined
  const secretKey =
    rendererProvidedSecretKey === expectedSecretKey
      ? rendererProvidedSecretKey
      : reusableExistingSecretKey ?? expectedSecretKey

  const clearSecret = rawValue.clearSecret === true
  const secretValue = typeof rawValue.secretValue === 'string' ? rawValue.secretValue.trim() : ''

  if (clearSecret) {
    await setSecureValueAsync(secretKey, '')
  }

  if (secretValue) {
    await setSecureValueAsync(secretKey, secretValue)
  }

  const canReuseStoredSecret = !clearSecret && Boolean(reusableExistingSecretKey)
  if (!secretValue && !canReuseStoredSecret) {
    return null
  }

  return {
    value: {
      name,
      valueSource: 'secret',
      secretKey,
    },
    secretKey,
  }
}

function getExistingConfigValue(
  rawValue: unknown,
  existingValuesByName: Map<string, McpConfigValue>
): McpConfigValue | undefined {
  if (!isRecord(rawValue) || typeof rawValue.name !== 'string') {
    return undefined
  }

  return existingValuesByName.get(rawValue.name.trim().toLowerCase())
}

function collectServerSecretKeys(server: McpServerConfig | undefined): Set<string> {
  const secretKeys = new Set<string>()

  for (const entry of [...(server?.env ?? []), ...(server?.headers ?? [])]) {
    if (entry.valueSource === 'secret' && entry.secretKey?.trim()) {
      secretKeys.add(entry.secretKey.trim())
    }
  }

  const oauth = server?.auth?.oauth
  for (const key of [oauth?.accessTokenKey, oauth?.refreshTokenKey, oauth?.clientSecretKey]) {
    if (typeof key === 'string' && key.trim()) {
      secretKeys.add(key.trim())
    }
  }

  return secretKeys
}

function normalizeRendererAuthConfig(
  rawAuth: unknown,
  serverId: string,
  existingAuth?: McpAuthConfig
): McpAuthConfig {
  if (!isRecord(rawAuth)) {
    return existingAuth ?? { mode: 'none', state: 'none' }
  }

  const mode = normalizeAuthMode(rawAuth.mode)
  const now = new Date().toISOString()
  if (mode !== 'oauth2Pkce') {
    return {
      mode,
      state: mode === 'none' ? 'none' : 'configured',
      lastError: null,
      updatedAt: now,
    }
  }

  const rawOauth = isRecord(rawAuth.oauth) ? rawAuth.oauth : {}
  const existingOauth = existingAuth?.oauth
  return {
    mode: 'oauth2Pkce',
    state:
      existingAuth?.mode === 'oauth2Pkce' && existingAuth.state === 'signed_in'
        ? 'signed_in'
        : 'reauth_required',
    lastError: null,
    updatedAt: now,
    oauth: {
      authorizationServer:
        getOptionalTrimmedString(rawOauth.authorizationServer) ??
        existingOauth?.authorizationServer,
      resourceMetadataUrl:
        getOptionalTrimmedString(rawOauth.resourceMetadataUrl) ??
        existingOauth?.resourceMetadataUrl,
      issuer: existingOauth?.issuer,
      authorizationEndpoint: existingOauth?.authorizationEndpoint,
      tokenEndpoint: existingOauth?.tokenEndpoint,
      registrationEndpoint: existingOauth?.registrationEndpoint,
      clientId: getOptionalTrimmedString(rawOauth.clientId) ?? existingOauth?.clientId,
      clientSecretKey: safeExistingOauthSecretKey(existingOauth?.clientSecretKey, serverId),
      accessTokenKey:
        safeExistingOauthSecretKey(existingOauth?.accessTokenKey, serverId) ??
        buildMcpSecretStorageKey(serverId, 'oauth-access-token'),
      refreshTokenKey:
        safeExistingOauthSecretKey(existingOauth?.refreshTokenKey, serverId) ??
        buildMcpSecretStorageKey(serverId, 'oauth-refresh-token'),
      expiresAt: existingOauth?.expiresAt,
      scope: getOptionalTrimmedString(rawOauth.scope) ?? existingOauth?.scope,
      tokenType: existingOauth?.tokenType,
    },
  }
}

function normalizeAuthMode(value: unknown): McpAuthMode {
  if (
    value === 'envSecret' ||
    value === 'headerSecret' ||
    value === 'bearerToken' ||
    value === 'basicAuth' ||
    value === 'oauth2Pkce' ||
    value === 'jsonCredential' ||
    value === 'connectionString'
  ) {
    return value
  }

  return 'none'
}

function safeExistingOauthSecretKey(value: unknown, serverId: string): string | undefined {
  return typeof value === 'string' && isSafeSecretKeyForServer(value, serverId)
    ? value
    : undefined
}

function normalizeSecretStorageKind(
  value: unknown,
  fallback: 'env' | 'header'
): RendererSecretStorageKind {
  if (value === 'token' || value === 'env' || value === 'header') {
    return value
  }

  return fallback
}

function normalizeTransport(
  value: unknown,
  fallback: McpServerConfig['transport'] | undefined
): McpServerConfig['transport'] {
  if (value === 'stdio' || value === 'sse' || value === 'websocket') {
    return value
  }

  return fallback ?? 'stdio'
}

function normalizeTrustState(
  value: unknown,
  fallback: McpServerConfig['trustState']
): McpServerConfig['trustState'] {
  if (value === 'trusted' || value === 'untrusted') {
    return value
  }

  return fallback
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeOptionalInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  return Math.max(0, Math.round(value))
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

function getOptionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isSafeSecretKeyForServer(secretKey: string, serverId: string): boolean {
  return secretKey.startsWith(`mcp.server.${serverId}.`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

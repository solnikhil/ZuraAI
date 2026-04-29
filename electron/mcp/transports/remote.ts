import type { McpTransportType } from '../../../src/mcp/types'

export const MCP_EXPERIMENTAL_REMOTE_TRANSPORTS_ENV =
  'ZURA_ENABLE_EXPERIMENTAL_MCP_REMOTE_TRANSPORTS'

export interface McpReconnectPolicy {
  enabled: boolean
  maxAttempts: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

export interface McpRemoteTransportBaseOptions {
  featureEnabled?: boolean
  reconnectPolicy?: Partial<McpReconnectPolicy>
}

export const DEFAULT_MCP_RECONNECT_POLICY: McpReconnectPolicy = Object.freeze({
  enabled: false,
  maxAttempts: 0,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
})

export function isExperimentalRemoteTransportEnabled(explicitFlag?: boolean): boolean {
  if (typeof explicitFlag === 'boolean') {
    return explicitFlag
  }

  const rawValue = process.env[MCP_EXPERIMENTAL_REMOTE_TRANSPORTS_ENV]?.trim().toLowerCase()
  return rawValue === '1' || rawValue === 'true' || rawValue === 'yes' || rawValue === 'on'
}

export function normalizeMcpReconnectPolicy(
  reconnectPolicy?: Partial<McpReconnectPolicy>
): McpReconnectPolicy {
  return {
    enabled: reconnectPolicy?.enabled === true,
    maxAttempts: normalizePositiveInteger(reconnectPolicy?.maxAttempts, 0),
    initialDelayMs: normalizePositiveInteger(reconnectPolicy?.initialDelayMs, 1000),
    maxDelayMs: normalizePositiveInteger(reconnectPolicy?.maxDelayMs, 30000),
    backoffMultiplier: normalizePositiveNumber(reconnectPolicy?.backoffMultiplier, 2),
  }
}

export function validateMcpRemoteUrl(
  rawUrl: string,
  transportType: Extract<McpTransportType, 'sse' | 'websocket'>,
  allowedProtocols: readonly string[]
): URL {
  const value = rawUrl.trim()
  if (!value) {
    throw new Error(`MCP ${transportType} transport requires a URL`)
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`MCP ${transportType} transport URL is invalid: ${rawUrl}`)
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(
      `MCP ${transportType} transport URL must use ${allowedProtocols.join(' or ')}`
    )
  }

  if (!parsed.hostname) {
    throw new Error(`MCP ${transportType} transport URL must include a hostname`)
  }

  if (parsed.username || parsed.password) {
    throw new Error(
      `MCP ${transportType} transport URL must not embed credentials; use secure headers or tokens instead`
    )
  }

  if (parsed.hash) {
    throw new Error(`MCP ${transportType} transport URL must not include a fragment`)
  }

  return parsed
}

export function resolveValidatedMcpRemoteUrl(
  rawUrl: string,
  baseUrl: URL,
  transportType: Extract<McpTransportType, 'sse' | 'websocket'>,
  allowedProtocols: readonly string[],
  options: { requireSameOrigin?: boolean } = {}
): URL {
  const resolved = validateMcpRemoteUrl(new URL(rawUrl, baseUrl).toString(), transportType, allowedProtocols)

  if (options.requireSameOrigin !== false && resolved.origin !== baseUrl.origin) {
    throw new Error(
      `MCP ${transportType} transport URL must remain on the original origin (${baseUrl.origin})`
    )
  }

  return resolved
}

export function buildMcpReconnectDelay(policy: McpReconnectPolicy, attempt: number): number {
  const normalizedAttempt = Math.max(0, attempt)
  const exponentialDelay = policy.initialDelayMs * Math.max(1, policy.backoffMultiplier) ** normalizedAttempt
  return Math.min(policy.maxDelayMs, Math.max(policy.initialDelayMs, Math.round(exponentialDelay)))
}

export async function waitForMcpReconnectDelay(delayMs: number): Promise<void> {
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    return
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

export function redactMcpHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, isSensitiveHeaderName(key) ? maskSecret(value) : value])
  )
}

export function summarizeMcpRemoteTarget(url: URL, headers?: Record<string, string>): Record<string, unknown> {
  return {
    url: url.toString(),
    headers: redactMcpHeaders(headers),
  }
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

/**
 * Shared retry loop for MCP remote transport connect operations.
 * Both SSE and WebSocket transports use the same retry/backoff pattern.
 */
export async function connectWithRetry(
  policy: McpReconnectPolicy,
  attempt: () => Promise<void>
): Promise<Error | null> {
  const maxAttempts = policy.enabled ? policy.maxAttempts + 1 : 1
  let lastError: Error | null = null

  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      await attempt()
      return null
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (i >= maxAttempts - 1) break
      await waitForMcpReconnectDelay(buildMcpReconnectDelay(policy, i))
    }
  }

  return lastError
}


function isSensitiveHeaderName(headerName: string): boolean {
  return /authorization|token|secret|cookie|key/i.test(headerName)
}

function maskSecret(value: string): string {
  if (!value) {
    return '[redacted]'
  }

  const trimmed = value.trim()
  if (trimmed.length <= 8) {
    return '[redacted]'
  }

  return `${trimmed.slice(0, 4)}...[redacted]...${trimmed.slice(-2)}`
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(0, Math.round(value))
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(0, value)
}

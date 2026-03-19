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

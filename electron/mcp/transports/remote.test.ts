// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MCP_RECONNECT_POLICY,
  buildMcpReconnectDelay,
  normalizeMcpReconnectPolicy,
  redactMcpHeaders,
  validateMcpRemoteUrl,
} from './remote'
import { SseMcpTransport } from './sse'
import { WebSocketMcpTransport } from './websocket'

describe('remote MCP transport helpers', () => {
  it('validates strict transport-specific URLs', () => {
    expect(validateMcpRemoteUrl('https://example.com/mcp', 'sse', ['http:', 'https:']).href).toBe(
      'https://example.com/mcp'
    )

    expect(() => validateMcpRemoteUrl('ftp://example.com', 'sse', ['http:', 'https:'])).toThrow(
      'MCP sse transport URL must use http: or https:'
    )

    expect(() => validateMcpRemoteUrl('wss://user:pass@example.com', 'websocket', ['ws:', 'wss:'])).toThrow(
      'must not embed credentials'
    )
  })

  it('keeps reconnect placeholders conservative by default', () => {
    expect(DEFAULT_MCP_RECONNECT_POLICY).toEqual({
      enabled: false,
      maxAttempts: 0,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    })

    expect(normalizeMcpReconnectPolicy({ maxAttempts: 3, initialDelayMs: 500 })).toEqual({
      enabled: false,
      maxAttempts: 3,
      initialDelayMs: 500,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    })

    expect(buildMcpReconnectDelay({
      enabled: true,
      maxAttempts: 3,
      initialDelayMs: 500,
      maxDelayMs: 2000,
      backoffMultiplier: 2,
    }, 0)).toBe(500)

    expect(buildMcpReconnectDelay({
      enabled: true,
      maxAttempts: 3,
      initialDelayMs: 500,
      maxDelayMs: 2000,
      backoffMultiplier: 2,
    }, 3)).toBe(2000)
  })

  it('redacts sensitive headers before diagnostics are surfaced', () => {
    expect(redactMcpHeaders({
      Authorization: 'Bearer super-secret-token',
      'X-Trace-Id': 'trace-123',
    })).toEqual({
      Authorization: 'Bear...[redacted]...en',
      'X-Trace-Id': 'trace-123',
    })
  })

  it('keeps SSE and WebSocket transports feature-gated for now', async () => {
    const sse = new SseMcpTransport({ url: 'https://example.com/mcp' })
    const websocket = new WebSocketMcpTransport({ url: 'wss://example.com/mcp' })

    await expect(sse.connect()).rejects.toThrow('Experimental MCP SSE transport is disabled')
    await expect(websocket.connect()).rejects.toThrow(
      'Experimental MCP WebSocket transport is disabled'
    )
  })
})

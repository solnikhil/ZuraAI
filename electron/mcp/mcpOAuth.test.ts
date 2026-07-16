// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { lookup } from 'node:dns/promises'

import type { McpServerConfig } from '../../src/mcp/types'
import { buildMcpSecretStorageKey } from './mcpStorage'
import {
  applyOAuthAuthorizationHeader,
  createPkcePair,
  fetchMcpOAuthEndpoint,
  getMcpAuthStatus,
  validateMcpOAuthEndpoint,
} from './mcpOAuth'

const secureValues = vi.hoisted(() => new Map<string, string>())

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/zura-mcp-oauth-test'),
    isPackaged: false,
  },
  shell: {
    openExternal: vi.fn(async () => true),
  },
}))

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}))

vi.mock('../secureStorage', () => ({
  getSecureValueAsync: vi.fn(async (key: string) => secureValues.get(key) ?? ''),
  setSecureValueAsync: vi.fn(async (key: string, value: string) => {
    secureValues.set(key, value)
    return true
  }),
}))

describe('MCP OAuth helpers', () => {
  it('reports sanitized auth status without exposing tokens', () => {
    const status = getMcpAuthStatus(
      createServer({
        auth: {
          mode: 'oauth2Pkce',
          state: 'reauth_required',
          lastError: 'expired',
          oauth: {
            clientId: 'client-1',
            accessTokenKey: 'mcp.server.server-1.oauth.accessToken',
            refreshTokenKey: 'mcp.server.server-1.oauth.refreshToken',
          },
        },
      })
    )

    expect(status).toEqual({
      serverId: 'server-1',
      mode: 'oauth2Pkce',
      state: 'reauth_required',
      label: 'Needs sign-in',
      requiresSignIn: true,
      lastError: 'expired',
      expiresAt: undefined,
    })
    expect(JSON.stringify(status)).not.toContain('accessToken')
    expect(JSON.stringify(status)).not.toContain('refreshToken')
  })

  it('generates S256 PKCE verifier and challenge values', () => {
    const first = createPkcePair()
    const second = createPkcePair()

    expect(first.verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(first.challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(first.verifier).not.toEqual(first.challenge)
    expect(first.verifier).not.toEqual(second.verifier)
  })

  it('injects an Authorization bearer header from secure storage', async () => {
    secureValues.set(buildMcpSecretStorageKey('server-1', 'oauth-access-token'), 'stored-token')

    await expect(
      applyOAuthAuthorizationHeader(
        createServer({
          auth: {
            mode: 'oauth2Pkce',
            state: 'signed_in',
            oauth: {
              accessTokenKey: buildMcpSecretStorageKey('server-1', 'oauth-access-token'),
            },
          },
        })
      )
    ).resolves.toEqual({ Authorization: 'Bearer stored-token' })
  })

  it('rejects unsafe discovered OAuth endpoints', () => {
    for (const endpoint of [
      'http://169.254.169.254/latest/meta-data',
      'https://127.0.0.1/token',
      'https://10.0.0.8/token',
      'https://auth.local/token',
      'file:///tmp/token',
    ]) {
      expect(() => validateMcpOAuthEndpoint(endpoint)).toThrow()
    }
    expect(() => validateMcpOAuthEndpoint('https://user:pass@example.com/token')).toThrow()
    expect(validateMcpOAuthEndpoint('https://auth.example.com/token').href).toBe(
      'https://auth.example.com/token'
    )
    expect(
      validateMcpOAuthEndpoint('http://127.0.0.1:4444/token', { allowLoopback: true }).href
    ).toBe('http://127.0.0.1:4444/token')
  })

  it('disables redirects and attaches a bounded abort signal to OAuth fetches', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchMcpOAuthEndpoint('https://auth.example.com/token', { method: 'POST' })

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://auth.example.com/token'),
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      })
    )
    vi.unstubAllGlobals()
  })

  it('rejects public-looking hostnames that resolve to private addresses', async () => {
    vi.mocked(lookup).mockResolvedValueOnce([{ address: '192.168.1.20', family: 4 }])
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchMcpOAuthEndpoint('https://attacker.example/token', { method: 'POST' })
    ).rejects.toThrow('resolved to a local or private network address')
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

function createServer(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: 'server-1',
    name: 'Remote MCP',
    enabled: true,
    trustState: 'trusted',
    transport: 'sse',
    url: 'https://mcp.example.com/sse',
    env: [],
    headers: [],
    requireApproval: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

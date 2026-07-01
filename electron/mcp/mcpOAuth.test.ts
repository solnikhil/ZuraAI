// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import type { McpServerConfig } from '../../src/mcp/types'
import { buildMcpSecretStorageKey } from './mcpStorage'
import { applyOAuthAuthorizationHeader, createPkcePair, getMcpAuthStatus } from './mcpOAuth'

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

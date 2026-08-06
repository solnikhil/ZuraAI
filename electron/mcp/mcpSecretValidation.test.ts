// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/zura-test' },
}))

vi.mock('../secureStorage', () => ({
  getSecureValueAsync: vi.fn(async (key: string) => {
    if (key.startsWith('mcp.server.')) {
      return 'resolved-secret-value'
    }
    return null
  }),
}))

vi.mock('../startup/logger', () => ({
  log: { withTag: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }) },
}))

vi.mock('../utils/atomicFile', () => ({
  writeFileAtomic: vi.fn(async () => undefined),
}))

vi.mock('../utils/serializedTaskQueue', () => ({
  RecoverableSerializedTaskQueue: class {
    run(fn: () => Promise<void>) {
      return fn()
    }
  },
}))

import { validateMcpSecretKey, resolveMcpServerSecrets } from './mcpStorage'
import type { McpServerConfig } from '../../src/mcp/types'

describe('validateMcpSecretKey', () => {
  it('rejects a config referencing groqApiKey directly', () => {
    expect(() => validateMcpSecretKey('myserver', 'groqApiKey')).toThrow(
      /not within the namespace of server "myserver"/
    )
  })

  it('rejects a config referencing brevoApiKey directly', () => {
    expect(() => validateMcpSecretKey('myserver', 'brevoApiKey')).toThrow(
      /not within the namespace of server "myserver"/
    )
  })

  it('rejects a config referencing tavilyApiKey directly', () => {
    expect(() => validateMcpSecretKey('myserver', 'tavilyApiKey')).toThrow(
      /not within the namespace of server "myserver"/
    )
  })

  it('rejects a key namespaced to a different server', () => {
    expect(() => validateMcpSecretKey('myserver', 'mcp.server.otherServer.env.KEY')).toThrow(
      /not within the namespace of server "myserver"/
    )
  })

  it('accepts a correctly namespaced env key', () => {
    expect(() => validateMcpSecretKey('myserver', 'mcp.server.myserver.env.API_KEY')).not.toThrow()
  })

  it('accepts a correctly namespaced token key', () => {
    expect(() => validateMcpSecretKey('myserver', 'mcp.server.myserver.token')).not.toThrow()
  })

  it('accepts a correctly namespaced header key', () => {
    expect(() =>
      validateMcpSecretKey('myserver', 'mcp.server.myserver.header.Authorization')
    ).not.toThrow()
  })

  it('accepts a correctly namespaced oauth.accessToken key', () => {
    expect(() =>
      validateMcpSecretKey('myserver', 'mcp.server.myserver.oauth.accessToken')
    ).not.toThrow()
  })

  it('accepts a correctly namespaced oauth.refreshToken key', () => {
    expect(() =>
      validateMcpSecretKey('myserver', 'mcp.server.myserver.oauth.refreshToken')
    ).not.toThrow()
  })

  it('accepts a correctly namespaced oauth.clientSecret key', () => {
    expect(() =>
      validateMcpSecretKey('myserver', 'mcp.server.myserver.oauth.clientSecret')
    ).not.toThrow()
  })
})

describe('resolveMcpServerSecrets - namespace enforcement', () => {
  function makeServerConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
    return {
      id: 'myserver',
      name: 'My Server',
      enabled: true,
      trustState: 'trusted',
      transport: 'stdio',
      command: '/usr/bin/server',
      args: [],
      env: [],
      headers: [],
      auth: { mode: 'none', state: 'none' },
      autoConnect: false,
      requireApproval: true,
      toolAllowlist: [],
      toolBlocklist: [],
      lastKnownTools: [],
      lastKnownResources: [],
      lastKnownPrompts: [],
      lastConnectionError: null,
      lastConnectionTime: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    }
  }

  it('rejects env secret with tampered key (groqApiKey)', async () => {
    const config = makeServerConfig({
      env: [{ name: 'API_KEY', valueSource: 'secret', secretKey: 'groqApiKey' }],
    })

    await expect(resolveMcpServerSecrets(config)).rejects.toThrow(
      /not within the namespace of server "myserver"/
    )
  })

  it('rejects header secret with tampered key (brevoApiKey)', async () => {
    const config = makeServerConfig({
      headers: [{ name: 'X-Api-Key', valueSource: 'secret', secretKey: 'brevoApiKey' }],
    })

    await expect(resolveMcpServerSecrets(config)).rejects.toThrow(
      /not within the namespace of server "myserver"/
    )
  })

  it('rejects env secret referencing another server namespace', async () => {
    const config = makeServerConfig({
      env: [
        {
          name: 'KEY',
          valueSource: 'secret',
          secretKey: 'mcp.server.otherServer.env.KEY',
        },
      ],
    })

    await expect(resolveMcpServerSecrets(config)).rejects.toThrow(
      /not within the namespace of server "myserver"/
    )
  })

  it('resolves correctly namespaced env secrets', async () => {
    const config = makeServerConfig({
      env: [
        {
          name: 'API_KEY',
          valueSource: 'secret',
          secretKey: 'mcp.server.myserver.env.API_KEY',
        },
      ],
    })

    const result = await resolveMcpServerSecrets(config)
    expect(result.env).toEqual({ API_KEY: 'resolved-secret-value' })
  })

  it('resolves correctly namespaced header secrets', async () => {
    const config = makeServerConfig({
      headers: [
        {
          name: 'Authorization',
          valueSource: 'secret',
          secretKey: 'mcp.server.myserver.header.Authorization',
        },
      ],
    })

    const result = await resolveMcpServerSecrets(config)
    expect(result.headers).toEqual({ Authorization: 'resolved-secret-value' })
  })

  it('handles plaintext values without validation', async () => {
    const config = makeServerConfig({
      env: [{ name: 'NODE_ENV', valueSource: 'plaintext', value: 'production' }],
    })

    const result = await resolveMcpServerSecrets(config)
    expect(result.env).toEqual({ NODE_ENV: 'production' })
  })
})

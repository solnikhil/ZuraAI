// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

const secureValues = new Map<string, string>()
let userDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataPath),
  },
}))

vi.mock('../secureStorage', () => ({
  getSecureValueAsync: vi.fn(async (key: string) => secureValues.get(key) ?? ''),
}))

import {
  MCP_SERVER_STORE_VERSION,
  buildMcpSecretStorageKey,
  getMcpStoreFilePath,
  loadMcpServerStore,
  normalizeMcpServerConfig,
  normalizeMcpStore,
  resolveMcpServerSecrets,
  saveMcpServers,
} from './mcpStorage'

describe('mcpStorage', () => {
  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'zura-mcp-storage-'))
    secureValues.clear()
  })

  afterEach(async () => {
    if (userDataPath) {
      await fs.rm(userDataPath, { recursive: true, force: true })
    }
    vi.clearAllMocks()
  })

  it('normalizes malformed store data and upgrades the version', () => {
    const store = normalizeMcpStore({
      version: 0,
      servers: [
        {
          id: ' server-1 ',
          name: ' Filesystem ',
          enabled: true,
          transport: 'websocket',
          args: [' node ', 2, ' server.js '],
          env: [
            { name: ' TOKEN ', valueSource: 'secret', secretKey: ' secret.key ' },
            { name: '', valueSource: 'plaintext', value: 'skip' },
          ],
          lastKnownTools: [
            { name: ' read_file ', inputSchema: { type: 'object' } },
            { inputSchema: {} },
          ],
        },
      ],
    })

    expect(store.version).toBe(MCP_SERVER_STORE_VERSION)
    expect(store.servers).toHaveLength(1)
    expect(store.servers[0]).toMatchObject({
      id: 'server-1',
      name: 'Filesystem',
      trustState: 'untrusted',
      transport: 'websocket',
      args: ['node', 'server.js'],
      requireApproval: true,
    })
    expect(store.servers[0].env).toEqual([
      { name: 'TOKEN', valueSource: 'secret', secretKey: 'secret.key' },
    ])
    expect(store.servers[0].lastKnownTools).toEqual([
      {
        name: 'read_file',
        inputSchema: { type: 'object' },
        title: undefined,
        description: undefined,
        annotations: undefined,
      },
    ])
  })

  it('saves and reloads the normalized MCP server store', async () => {
    const now = new Date().toISOString()
    const server = normalizeMcpServerConfig(
      {
        id: 'server-1',
        name: 'Filesystem',
        enabled: true,
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        createdAt: now,
        updatedAt: now,
      },
      0,
      now
    )

    expect(server).not.toBeNull()
    await saveMcpServers([server!])

    const loaded = await loadMcpServerStore()
    expect(loaded.version).toBe(MCP_SERVER_STORE_VERSION)
    expect(loaded.servers).toHaveLength(1)
    expect(loaded.servers[0].command).toBe('npx')
    expect(getMcpStoreFilePath()).toBe(path.join(userDataPath, 'mcp-servers.json'))
  })

  it('quarantines a corrupt MCP store file before returning an empty store', async () => {
    const storePath = getMcpStoreFilePath()
    await fs.mkdir(path.dirname(storePath), { recursive: true })
    await fs.writeFile(storePath, '{ this is not valid json', 'utf-8')

    const loaded = await loadMcpServerStore()
    const directoryEntries = await fs.readdir(path.dirname(storePath))

    expect(loaded).toEqual({ version: MCP_SERVER_STORE_VERSION, servers: [] })
    expect(directoryEntries.some((entry) => entry.startsWith('mcp-servers.json.corrupt-'))).toBe(
      true
    )
    expect(directoryEntries.includes('mcp-servers.json')).toBe(false)
  })

  it('surfaces operational read errors without quarantining the configured path', async () => {
    const storePath = getMcpStoreFilePath()
    await fs.mkdir(storePath, { recursive: true })

    await expect(loadMcpServerStore()).rejects.toMatchObject({ code: expect.any(String) })
    const stat = await fs.stat(storePath)
    expect(stat.isDirectory()).toBe(true)
    const directoryEntries = await fs.readdir(path.dirname(storePath))
    expect(directoryEntries.some((entry) => entry.startsWith('mcp-servers.json.corrupt-'))).toBe(
      false
    )
  })

  it('resolves secret-backed env vars and headers from secure storage', async () => {
    secureValues.set('mcp.server.server-1.env.API_KEY', 'env-secret')
    secureValues.set('mcp.server.server-1.header.Authorization', 'Bearer secret-token')

    const resolved = await resolveMcpServerSecrets({
      id: 'server-1',
      name: 'Remote API',
      enabled: true,
      trustState: 'trusted',
      transport: 'sse',
      url: 'https://example.com/mcp',
      env: [
        { name: 'API_KEY', valueSource: 'secret', secretKey: 'mcp.server.server-1.env.API_KEY' },
        { name: 'MODE', valueSource: 'plaintext', value: 'prod' },
      ],
      headers: [
        {
          name: 'Authorization',
          valueSource: 'secret',
          secretKey: 'mcp.server.server-1.header.Authorization',
        },
      ],
      requireApproval: true,
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T00:00:00.000Z',
    })

    expect(resolved.env).toEqual({
      API_KEY: 'env-secret',
      MODE: 'prod',
    })
    expect(resolved.headers).toEqual({
      Authorization: 'Bearer secret-token',
    })
  })

  it('builds deterministic secure-storage keys for MCP secrets', () => {
    expect(buildMcpSecretStorageKey('server-1', 'env', 'API_KEY')).toBe(
      'mcp.server.server-1.env.API_KEY'
    )
    expect(buildMcpSecretStorageKey('server-1', 'header', 'Authorization')).toBe(
      'mcp.server.server-1.header.Authorization'
    )
    expect(buildMcpSecretStorageKey('server-1', 'token')).toBe('mcp.server.server-1.token')
  })
})

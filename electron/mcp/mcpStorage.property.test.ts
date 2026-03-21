// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

let userDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataPath),
  },
}))

vi.mock('../secureStorage', () => ({
  getSecureValueAsync: vi.fn(async () => ''),
}))

import { loadMcpServerStore, normalizeMcpServerConfig, saveMcpServers } from './mcpStorage'

describe('mcpStorage property checks', () => {
  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'zura-mcp-storage-prop-'))
  })

  afterEach(async () => {
    await fs.rm(userDataPath, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('round-trips normalized MCP server configs with policy and cached manifest fields intact', async () => {
    const now = new Date().toISOString()
    const servers = [0, 1, 2, 3, 4].map((index) =>
      normalizeMcpServerConfig(
        {
          id: `server-${index}`,
          name: `Server ${index}`,
          enabled: index % 2 === 0,
          trustState: index % 2 === 0 ? 'trusted' : 'untrusted',
          transport: index % 3 === 0 ? 'stdio' : index % 3 === 1 ? 'sse' : 'websocket',
          command: 'node',
          args: ['server.js'],
          url: index % 3 === 0 ? undefined : `https://example-${index}.test/mcp`,
          autoConnect: index % 2 === 0,
          reconnectAttempts: index,
          reconnectDelayMs: 250 * (index + 1),
          requireApproval: index % 2 !== 0,
          toolAllowlist: index % 2 === 0 ? ['read_file'] : [],
          toolBlocklist: index % 2 !== 0 ? ['delete_file'] : [],
          lastKnownTools: [{ name: 'read_file', inputSchema: { type: 'object' } }],
          lastKnownResources: [{ uri: `file:///tmp/${index}.txt`, title: `File ${index}` }],
          lastKnownPrompts: [{ name: `prompt_${index}`, title: `Prompt ${index}` }],
          createdAt: now,
          updatedAt: now,
        },
        index,
        now
      )
    )

    await saveMcpServers(servers.filter((server): server is NonNullable<typeof server> => server !== null))
    const loaded = await loadMcpServerStore()

    expect(loaded.servers).toHaveLength(5)
    for (const [index, server] of loaded.servers.entries()) {
      expect(server.id).toBe(`server-${index}`)
      expect(server.toolAllowlist ?? []).toEqual(index % 2 === 0 ? ['read_file'] : [])
      expect(server.toolBlocklist ?? []).toEqual(index % 2 !== 0 ? ['delete_file'] : [])
      expect(server.lastKnownResources?.[0]?.uri).toBe(`file:///tmp/${index}.txt`)
      expect(server.lastKnownPrompts?.[0]?.name).toBe(`prompt_${index}`)
    }
  })
})

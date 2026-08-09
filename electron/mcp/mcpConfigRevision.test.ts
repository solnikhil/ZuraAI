// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

let userDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataPath),
  },
}))

vi.mock('../secureStorage', () => ({
  getSecureValueAsync: vi.fn(async () => ''),
}))

import {
  getMcpConfigRevision,
  loadMcpServerStore,
  resetMcpStoreCache,
  saveMcpServers,
  saveMcpServersWithRevision,
} from './mcpStorage'
import type { McpServerConfig } from '../../src/mcp/types'

function makeServer(id: string): McpServerConfig {
  return {
    id,
    name: `Server ${id}`,
    enabled: true,
    trustState: 'untrusted',
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('mcpConfigRevision', () => {
  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'zura-mcp-revision-'))
    resetMcpStoreCache()
  })

  afterEach(async () => {
    if (userDataPath) {
      await fs.rm(userDataPath, { recursive: true, force: true })
    }
    vi.clearAllMocks()
  })

  it('getMcpConfigRevision returns 0 for fresh/empty config', async () => {
    const revision = await getMcpConfigRevision()
    expect(revision).toBe(0)
  })

  it('saveMcpServersWithRevision succeeds when expectedRevision matches', async () => {
    const server = makeServer('s1')
    await expect(saveMcpServersWithRevision([server], 0)).resolves.toBeUndefined()

    const store = await loadMcpServerStore()
    expect(store.revision).toBe(1)
    expect(store.servers).toHaveLength(1)
    expect(store.servers[0].id).toBe('s1')
  })

  it('saveMcpServersWithRevision rejects when expectedRevision is stale', async () => {
    const server = makeServer('s1')
    await saveMcpServersWithRevision([server], 0)

    await expect(saveMcpServersWithRevision([makeServer('s2')], 0)).rejects.toThrow(
      'MCP configuration conflict: expected revision 0 but found 1'
    )
  })

  it('revision increments after each successful save', async () => {
    expect(await getMcpConfigRevision()).toBe(0)

    await saveMcpServersWithRevision([makeServer('s1')], 0)
    expect(await getMcpConfigRevision()).toBe(1)

    await saveMcpServersWithRevision([makeServer('s2')], 1)
    expect(await getMcpConfigRevision()).toBe(2)

    await saveMcpServersWithRevision([makeServer('s3')], 2)
    expect(await getMcpConfigRevision()).toBe(3)
  })

  it('two concurrent saves with same revision: first succeeds, second rejected', async () => {
    const server1 = makeServer('s1')
    const server2 = makeServer('s2')

    // Both start with revision 0
    const save1 = saveMcpServersWithRevision([server1], 0)
    const save2 = saveMcpServersWithRevision([server2], 0)

    const results = await Promise.allSettled([save1, save2])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const rejectedResult = rejected[0] as PromiseRejectedResult
    expect(rejectedResult.reason.message).toContain('MCP configuration conflict')
  })

  it('normal saveMcpServers also increments revision', async () => {
    expect(await getMcpConfigRevision()).toBe(0)

    await saveMcpServers([makeServer('s1')])
    expect(await getMcpConfigRevision()).toBe(1)

    await saveMcpServers([makeServer('s2')])
    expect(await getMcpConfigRevision()).toBe(2)
  })
})

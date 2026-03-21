import { describe, expect, it } from 'vitest'

import { createMcpToolRegistry, getMcpToolLookupByName } from './mcpRegistry'

describe('createMcpToolRegistry', () => {
  it('creates runtime MCP tool descriptors only for enabled connected servers', () => {
    const registry = createMcpToolRegistry({
      servers: [
        {
          id: 'server-1',
          name: 'Filesystem',
          enabled: true,
          trustState: 'trusted',
          transport: 'stdio',
          requireApproval: true,
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:00.000Z',
        },
        {
          id: 'server-2',
          name: 'Docs',
          enabled: false,
          trustState: 'trusted',
          transport: 'sse',
          requireApproval: true,
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:00.000Z',
        },
      ],
      runtimeStates: [
        {
          serverId: 'server-1',
          status: 'connected',
          tools: [],
          capabilities: { tools: true, resources: false, prompts: false },
        },
        {
          serverId: 'server-2',
          status: 'connected',
          tools: [],
          capabilities: { tools: true, resources: false, prompts: false },
        },
      ],
      tools: [
        {
          namespacedName: 'mcp__filesystem__read_file',
          serverId: 'server-1',
          serverName: 'Filesystem',
          serverSlug: 'filesystem',
          toolName: 'read_file',
          toolSlug: 'read_file',
          manifest: {
            name: 'read_file',
            description: 'Read a file from disk',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Absolute path' },
              },
              required: ['path'],
            },
          },
        },
        {
          namespacedName: 'mcp__docs__search',
          serverId: 'server-2',
          serverName: 'Docs',
          serverSlug: 'docs',
          toolName: 'search',
          toolSlug: 'search',
          manifest: {
            name: 'search',
            inputSchema: { type: 'object', properties: {}, required: [] },
          },
        },
      ],
    })

    expect(registry).toHaveLength(1)
    expect(registry[0]).toMatchObject({
      name: 'mcp__filesystem__read_file',
      origin: 'mcp',
      category: 'mcp',
      mcp: {
        namespacedName: 'mcp__filesystem__read_file',
        serverId: 'server-1',
        originalToolName: 'read_file',
        serverName: 'Filesystem',
      },
    })
  })

  it('returns reverse lookup metadata for a namespaced MCP tool', () => {
    const registry = createMcpToolRegistry({
      servers: [
        {
          id: 'server-1',
          name: 'Filesystem',
          enabled: true,
          trustState: 'trusted',
          transport: 'stdio',
          requireApproval: true,
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:00.000Z',
        },
      ],
      runtimeStates: [
        {
          serverId: 'server-1',
          status: 'connected',
          tools: [],
          capabilities: { tools: true, resources: false, prompts: false },
        },
      ],
      tools: [
        {
          namespacedName: 'mcp__filesystem__read_file',
          serverId: 'server-1',
          serverName: 'Filesystem',
          serverSlug: 'filesystem',
          toolName: 'read_file',
          toolSlug: 'read_file',
          manifest: {
            name: 'read_file',
            inputSchema: { type: 'object', properties: {}, required: [] },
          },
        },
      ],
    })

    expect(getMcpToolLookupByName(registry, 'mcp__filesystem__read_file')).toEqual({
      namespacedName: 'mcp__filesystem__read_file',
      serverId: 'server-1',
      originalToolName: 'read_file',
    })
  })
})

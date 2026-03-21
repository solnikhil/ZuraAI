import { describe, expect, it } from 'vitest'

import { getBuiltinToolDefinitions } from './definitions'
import { createMcpToolRegistry } from './mcpRegistry'
import { getToolsForProvider, getToolsSummaryForPrompt } from './toolManager'

function createRuntimeTools() {
  return createMcpToolRegistry({
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
    ],
  })
}

describe('toolManager MCP coexistence', () => {
  it('converts built-in and MCP tools together for OpenAI-compatible providers', () => {
    const availableTools = [...getBuiltinToolDefinitions(), ...createRuntimeTools()]

    const tools = getToolsForProvider({
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      enabledTools: ['web_search', 'mcp__filesystem__read_file'],
      availableTools,
    })

    expect(tools).toHaveLength(2)
    expect(tools?.map((tool) => tool.function.name)).toEqual([
      'web_search',
      'mcp__filesystem__read_file',
    ])
  })

  it('includes MCP runtime tools in the prompt summary with server metadata', () => {
    const availableTools = [...getBuiltinToolDefinitions(), ...createRuntimeTools()]

    const summary = getToolsSummaryForPrompt(['web_search', 'mcp__filesystem__read_file'], availableTools)

    expect(summary).toContain('web_search')
    expect(summary).toContain('mcp__filesystem__read_file [MCP Filesystem/read_file]')
  })
})

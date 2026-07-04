import type { McpNamespacedTool, McpRuntimeSnapshot, McpToolLookupRecord } from '../mcp/types'

import type { McpToolDescriptor, ToolDescriptor, ToolInputSchema } from './types'
import { isMcpToolDescriptor } from './types'

export function createMcpToolRegistry(
  snapshot: Pick<McpRuntimeSnapshot, 'servers' | 'runtimeStates' | 'tools'>
): McpToolDescriptor[] {
  const serversById = new Map(snapshot.servers.map((server) => [server.id, server]))
  const enabledServerIds = new Set(
    snapshot.servers
      .filter((server) => server.enabled && server.trustState === 'trusted')
      .map((server) => server.id)
  )
  const connectedServerIds = new Set(
    snapshot.runtimeStates
      .filter((runtimeState) => runtimeState.status === 'connected')
      .map((runtimeState) => runtimeState.serverId)
  )

  return snapshot.tools
    .filter((tool) => enabledServerIds.has(tool.serverId) && connectedServerIds.has(tool.serverId))
    .map((tool) => createMcpToolDescriptor(tool, serversById.get(tool.serverId)))
}

export function getMcpToolLookupByName(
  tools: ToolDescriptor[],
  namespacedName: string
): McpToolLookupRecord | null {
  const tool = tools.find((candidate) => candidate.name === namespacedName)
  if (!tool || !isMcpToolDescriptor(tool)) {
    return null
  }

  return {
    namespacedName: tool.mcp.namespacedName,
    serverId: tool.mcp.serverId,
    originalToolName: tool.mcp.originalToolName,
  }
}

function createMcpToolDescriptor(
  tool: McpNamespacedTool,
  server: McpRuntimeSnapshot['servers'][number] | undefined
): McpToolDescriptor {
  return {
    name: tool.namespacedName,
    description:
      tool.manifest.description?.trim() ||
      tool.manifest.title?.trim() ||
      `Tool provided by the ${tool.serverName} MCP server.`,
    parameters: normalizeToolInputSchema(tool.manifest.inputSchema),
    category: 'mcp',
    origin: 'mcp',
    requiresApproval: server?.requireApproval === true,
    mcp: {
      namespacedName: tool.namespacedName,
      serverId: tool.serverId,
      originalToolName: tool.toolName,
      serverName: tool.serverName,
    },
  }
}

function normalizeToolInputSchema(
  schema: McpNamespacedTool['manifest']['inputSchema']
): ToolInputSchema {
  return {
    ...schema,
    type: 'object',
    properties: schema.properties && !Array.isArray(schema.properties) ? schema.properties : {},
    required: Array.isArray(schema.required) ? schema.required : [],
  }
}

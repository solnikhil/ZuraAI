import type {
  McpPromptManifest,
  McpPromptResult,
  McpResourceManifest,
  McpResourceReadResult,
  McpServerConfig,
  McpServerRuntimeState,
} from '../../src/mcp/types'

function cloneToolManifest(
  tool: NonNullable<McpServerConfig['lastKnownTools']>[number]
): NonNullable<McpServerConfig['lastKnownTools']>[number] {
  return {
    ...tool,
    inputSchema: { ...tool.inputSchema },
    annotations: tool.annotations ? { ...tool.annotations } : undefined,
  }
}

export function cloneResourceManifest(resource: McpResourceManifest): McpResourceManifest {
  return {
    ...resource,
    annotations: resource.annotations ? { ...resource.annotations } : undefined,
  }
}

export function clonePromptManifest(prompt: McpPromptManifest): McpPromptManifest {
  return {
    ...prompt,
    arguments: prompt.arguments ? prompt.arguments.map((argument) => ({ ...argument })) : [],
  }
}

export function cloneServer(server: McpServerConfig): McpServerConfig {
  return {
    ...server,
    args: server.args ? [...server.args] : [],
    env: server.env ? server.env.map((entry) => ({ ...entry })) : [],
    headers: server.headers ? server.headers.map((entry) => ({ ...entry })) : [],
    toolAllowlist: server.toolAllowlist ? [...server.toolAllowlist] : [],
    toolBlocklist: server.toolBlocklist ? [...server.toolBlocklist] : [],
    lastKnownTools: server.lastKnownTools ? server.lastKnownTools.map(cloneToolManifest) : [],
    lastKnownResources: server.lastKnownResources
      ? server.lastKnownResources.map((resource) => cloneResourceManifest(resource))
      : [],
    lastKnownPrompts: server.lastKnownPrompts
      ? server.lastKnownPrompts.map((prompt) => clonePromptManifest(prompt))
      : [],
  }
}

export function cloneRuntimeState(runtimeState: McpServerRuntimeState): McpServerRuntimeState {
  return {
    ...runtimeState,
    tools: runtimeState.tools.map(cloneToolManifest),
    resources: (runtimeState.resources ?? []).map((resource) => cloneResourceManifest(resource)),
    prompts: (runtimeState.prompts ?? []).map((prompt) => clonePromptManifest(prompt)),
    capabilities: { ...runtimeState.capabilities },
    connectionInfo: runtimeState.connectionInfo ? { ...runtimeState.connectionInfo } : undefined,
  }
}

export function cloneReadResourceResult(result: McpResourceReadResult): McpResourceReadResult {
  return {
    contents: result.contents.map((item) => ({ ...item })),
  }
}

export function clonePromptResult(result: McpPromptResult): McpPromptResult {
  return {
    description: result.description,
    messages: result.messages.map((message) => ({ ...message })),
  }
}

export function createInitialRuntimeState(server: McpServerConfig): McpServerRuntimeState {
  return {
    serverId: server.id,
    status: 'disconnected',
    error: undefined,
    lastConnectionError: server.lastConnectionError ?? null,
    lastConnectionTime: server.lastConnectionTime ?? null,
    tools: server.lastKnownTools ? server.lastKnownTools.map(cloneToolManifest) : [],
    resources: server.lastKnownResources
      ? server.lastKnownResources.map((resource) => cloneResourceManifest(resource))
      : [],
    prompts: server.lastKnownPrompts
      ? server.lastKnownPrompts.map((prompt) => clonePromptManifest(prompt))
      : [],
    capabilities: {
      tools: false,
      resources: false,
      prompts: false,
    },
    lastUpdatedAt: new Date().toISOString(),
  }
}

export function mergeRuntimeStateWithServer(
  server: McpServerConfig,
  runtimeState: McpServerRuntimeState | undefined
): McpServerRuntimeState {
  return {
    serverId: server.id,
    status: runtimeState?.status ?? 'disconnected',
    error: runtimeState?.error,
    lastConnectionError: runtimeState?.lastConnectionError ?? server.lastConnectionError ?? null,
    lastConnectionTime: runtimeState?.lastConnectionTime ?? server.lastConnectionTime ?? null,
    tools: runtimeState?.tools
      ? runtimeState.tools.map(cloneToolManifest)
      : server.lastKnownTools
        ? server.lastKnownTools.map(cloneToolManifest)
        : [],
    resources: runtimeState?.resources
      ? runtimeState.resources.map((resource) => cloneResourceManifest(resource))
      : server.lastKnownResources
        ? server.lastKnownResources.map((resource) => cloneResourceManifest(resource))
        : [],
    prompts: runtimeState?.prompts
      ? runtimeState.prompts.map((prompt) => clonePromptManifest(prompt))
      : server.lastKnownPrompts
        ? server.lastKnownPrompts.map((prompt) => clonePromptManifest(prompt))
        : [],
    capabilities: runtimeState?.capabilities
      ? { ...runtimeState.capabilities }
      : {
          tools: false,
          resources: false,
          prompts: false,
        },
    connectionInfo: runtimeState?.connectionInfo ? { ...runtimeState.connectionInfo } : undefined,
    lastUpdatedAt: new Date().toISOString(),
  }
}

export function buildPersistedServerRuntimeMetadata(
  server: McpServerConfig,
  runtimeState: McpServerRuntimeState
): McpServerConfig {
  return {
    ...server,
    lastKnownTools: runtimeState.tools.map(cloneToolManifest),
    lastKnownResources: (runtimeState.resources ?? []).map((resource) =>
      cloneResourceManifest(resource)
    ),
    lastKnownPrompts: (runtimeState.prompts ?? []).map((prompt) => clonePromptManifest(prompt)),
    lastConnectionError: runtimeState.lastConnectionError ?? null,
    lastConnectionTime: runtimeState.lastConnectionTime ?? null,
  }
}

export function hasPersistedRuntimeMetadataChanged(
  previousServer: McpServerConfig,
  nextServer: McpServerConfig
): boolean {
  return (
    JSON.stringify(previousServer.lastKnownTools ?? []) !==
      JSON.stringify(nextServer.lastKnownTools ?? []) ||
    JSON.stringify(previousServer.lastKnownResources ?? []) !==
      JSON.stringify(nextServer.lastKnownResources ?? []) ||
    JSON.stringify(previousServer.lastKnownPrompts ?? []) !==
      JSON.stringify(nextServer.lastKnownPrompts ?? []) ||
    (previousServer.lastConnectionError ?? null) !== (nextServer.lastConnectionError ?? null) ||
    (previousServer.lastConnectionTime ?? null) !== (nextServer.lastConnectionTime ?? null)
  )
}

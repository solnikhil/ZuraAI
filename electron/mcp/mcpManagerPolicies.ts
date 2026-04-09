import type {
  McpExposurePolicy,
  McpNamespacedTool,
  McpServerConfig,
  McpServerRuntimeState,
} from '../../src/mcp/types'

export function getUserVisibleExposure(): McpExposurePolicy {
  return {
    userVisible: true,
    modelVisible: false,
    requiresExplicitUserAction: true,
  }
}

export function isServerContentVisible(
  server: McpServerConfig,
  runtimeState: McpServerRuntimeState | undefined
): runtimeState is McpServerRuntimeState {
  return Boolean(
    runtimeState &&
      runtimeState.status === 'connected' &&
      server.enabled === true &&
      server.trustState === 'trusted'
  )
}

export function isToolAllowedForServer(server: McpServerConfig, toolName: string): boolean {
  const normalizedToolName = toolName.trim().toLowerCase()
  const allowlist = new Set(
    (server.toolAllowlist ?? []).map((entry) => entry.trim().toLowerCase()).filter(Boolean)
  )
  const blocklist = new Set(
    (server.toolBlocklist ?? []).map((entry) => entry.trim().toLowerCase()).filter(Boolean)
  )

  if (blocklist.has(normalizedToolName)) {
    return false
  }

  return allowlist.size === 0 || allowlist.has(normalizedToolName)
}

export function ensureUniqueNamespacedTools(tools: McpNamespacedTool[]): McpNamespacedTool[] {
  const counts = new Map<string, number>()

  return tools.map((tool) => {
    const duplicateCount = counts.get(tool.namespacedName) ?? 0
    counts.set(tool.namespacedName, duplicateCount + 1)

    if (duplicateCount === 0) {
      return tool
    }

    const suffix = toCollisionSafeSlug(tool.serverId)
    return {
      ...tool,
      serverSlug: `${tool.serverSlug}_${suffix}`,
      namespacedName: `mcp__${tool.serverSlug}_${suffix}__${tool.toolSlug}`,
    }
  })
}

function toCollisionSafeSlug(serverId: string): string {
  return (
    serverId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 12) || 'server'
  )
}

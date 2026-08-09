import { createHash } from 'crypto'

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

/** Bounded numeric disambiguation attempts after the identity digest. */
const MAX_NAME_ALLOCATION_ATTEMPTS = 64

/**
 * Assigns a globally unique, stable namespaced name to every exposed MCP tool.
 *
 * Names are allocated against the set of names already emitted, not against a
 * count of original names. Counting originals missed two real collisions:
 *
 * - Two tools on the *same* server whose names differ only in punctuation
 *   (`a-b` and `a.b`) slug identically, and the old suffix (derived from the
 *   shared server id) was identical too, so the second tool re-collided and
 *   became unreachable.
 * - Two *different* servers whose ids slug to the same truncated 12 characters
 *   produced identical resolved names, so dispatch could reach the wrong
 *   server's tool.
 *
 * The first tool to claim a name keeps it, so existing names stay stable.
 * Later collisions fall back to a digest of the tool's true identity
 * (`serverId` + `toolName`), which is stable across restarts.
 */
export function ensureUniqueNamespacedTools(tools: McpNamespacedTool[]): McpNamespacedTool[] {
  const used = new Set<string>()
  const seenIdentities = new Set<string>()
  const resolved: McpNamespacedTool[] = []

  for (const tool of tools) {
    // MCP tool names are unique per server, so an identical (serverId, toolName)
    // pair is the same tool listed twice. Exposing it under two names would
    // inflate the model's inventory for no benefit.
    const identity = `${tool.serverId}\u0000${tool.toolName}`
    if (seenIdentities.has(identity)) {
      continue
    }
    seenIdentities.add(identity)

    if (!used.has(tool.namespacedName)) {
      used.add(tool.namespacedName)
      resolved.push(tool)
      continue
    }

    const allocation = allocateUniqueName(tool, used)
    if (!allocation) {
      // Fail closed: exposing a tool under a name that already belongs to a
      // different tool would dispatch the wrong original. Dropping it keeps
      // dispatch unambiguous.
      continue
    }

    used.add(allocation.namespacedName)
    resolved.push({ ...tool, ...allocation })
  }

  return resolved
}

function allocateUniqueName(
  tool: McpNamespacedTool,
  used: ReadonlySet<string>
): { serverSlug: string; namespacedName: string } | null {
  const digest = toIdentityDigest(tool.serverId, tool.toolName)
  const suffixes = [
    // Preferred, human-readable form kept for backwards compatibility.
    toCollisionSafeSlug(tool.serverId),
    // Collision-resistant identity, distinct per (serverId, toolName).
    digest,
  ]
  for (let attempt = 2; attempt <= MAX_NAME_ALLOCATION_ATTEMPTS; attempt += 1) {
    suffixes.push(`${digest}_${attempt}`)
  }

  for (const suffix of suffixes) {
    const serverSlug = `${tool.serverSlug}_${suffix}`
    const namespacedName = `mcp__${serverSlug}__${tool.toolSlug}`
    if (!used.has(namespacedName)) {
      return { serverSlug, namespacedName }
    }
  }

  return null
}

/**
 * Stable, collision-resistant digest of a tool's true identity.
 *
 * Uses `serverId` + `toolName` rather than their slugs so punctuation-only
 * differences and truncated server ids still produce distinct values.
 */
function toIdentityDigest(serverId: string, toolName: string): string {
  return createHash('sha256').update(`${serverId}\u0000${toolName}`).digest('hex').slice(0, 10)
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

// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { ensureUniqueNamespacedTools } from './mcpManagerPolicies'
import type { McpNamespacedTool } from '../../src/mcp/types'

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Builds a tool the way the manager does, before uniqueness resolution. */
function tool(serverId: string, serverName: string, toolName: string): McpNamespacedTool {
  const serverSlug = slug(serverName)
  const toolSlug = slug(toolName)
  return {
    serverId,
    serverName,
    serverSlug,
    toolName,
    toolSlug,
    namespacedName: `mcp__${serverSlug}__${toolSlug}`,
    manifest: { name: toolName, inputSchema: { type: 'object' } },
  } as McpNamespacedTool
}

function names(tools: McpNamespacedTool[]): string[] {
  return tools.map((entry) => entry.namespacedName)
}

/** Round-trips resolved names back to their originating (serverId, toolName). */
function dispatchTable(tools: McpNamespacedTool[]): Map<string, string> {
  const table = new Map<string, string>()
  for (const entry of tools) {
    table.set(entry.namespacedName, `${entry.serverId}::${entry.toolName}`)
  }
  return table
}

describe('ensureUniqueNamespacedTools', () => {
  it('leaves non-colliding tools untouched', () => {
    const input = [tool('srv-a', 'Alpha', 'read_file'), tool('srv-b', 'Beta', 'write_file')]
    expect(names(ensureUniqueNamespacedTools(input))).toEqual([
      'mcp__alpha__read_file',
      'mcp__beta__write_file',
    ])
  })

  it('resolves intra-server punctuation collisions to distinct reachable names', () => {
    // `do-thing`, `do.thing` and `do thing` all slug to `do_thing` on the same
    // server. The old resolver derived every suffix from the shared server id,
    // so the third tool re-collided with the second and became unreachable.
    const input = [
      tool('srv-a', 'Alpha', 'do-thing'),
      tool('srv-a', 'Alpha', 'do.thing'),
      tool('srv-a', 'Alpha', 'do thing'),
    ]
    const resolved = ensureUniqueNamespacedTools(input)

    expect(resolved).toHaveLength(3)
    expect(new Set(names(resolved)).size).toBe(3)

    const table = dispatchTable(resolved)
    expect(table.size).toBe(3)
    expect([...table.values()].sort()).toEqual([
      'srv-a::do thing',
      'srv-a::do-thing',
      'srv-a::do.thing',
    ])
  })

  it('resolves inter-server collisions when server ids slug to the same prefix', () => {
    // All three ids truncate to the same 12 collision-safe characters, so the
    // old suffix was identical and the second and third resolved to one name -
    // meaning dispatch could reach the wrong server's tool.
    const input = [
      tool('shared-server-id-one', 'Shared', 'run'),
      tool('shared-server-id-two', 'Shared', 'run'),
      tool('shared-server-id-three', 'Shared', 'run'),
    ]
    const resolved = ensureUniqueNamespacedTools(input)

    expect(resolved).toHaveLength(3)
    expect(new Set(names(resolved)).size).toBe(3)
    expect([...dispatchTable(resolved).values()].sort()).toEqual([
      'shared-server-id-one::run',
      'shared-server-id-three::run',
      'shared-server-id-two::run',
    ])
  })

  it('keeps the first claimant on its original name for stability', () => {
    const input = [
      tool('shared-server-id-one', 'Shared', 'run'),
      tool('shared-server-id-two', 'Shared', 'run'),
    ]
    const resolved = ensureUniqueNamespacedTools(input)

    expect(resolved[0].namespacedName).toBe('mcp__shared__run')
    expect(resolved[0].serverId).toBe('shared-server-id-one')
  })

  it('produces stable names across repeated resolutions', () => {
    const build = () => [
      tool('shared-server-id-one', 'Shared', 'run'),
      tool('shared-server-id-two', 'Shared', 'run'),
      tool('srv-a', 'Alpha', 'do-thing'),
      tool('srv-a', 'Alpha', 'do.thing'),
    ]

    expect(names(ensureUniqueNamespacedTools(build()))).toEqual(
      names(ensureUniqueNamespacedTools(build()))
    )
  })

  it('keeps every name unique across a large adversarial set', () => {
    const input: McpNamespacedTool[] = []
    for (let server = 0; server < 8; server += 1) {
      for (const toolName of ['a-b', 'a.b', 'a b', 'a_b', 'a/b']) {
        // Every server name slugs to `same`, every tool name slugs to `a_b`.
        input.push(tool(`server-identifier-${server}`, 'Same', toolName))
      }
    }

    const resolved = ensureUniqueNamespacedTools(input)
    const resolvedNames = names(resolved)

    expect(new Set(resolvedNames).size).toBe(resolvedNames.length)
    // Every surviving name maps back to exactly one original identity.
    expect(dispatchTable(resolved).size).toBe(resolved.length)
    expect(resolved).toHaveLength(input.length)
  })

  it('drops a genuinely duplicated identity rather than aliasing it', () => {
    const duplicate = tool('srv-a', 'Alpha', 'run')
    const resolved = ensureUniqueNamespacedTools([duplicate, { ...duplicate }])

    // Same serverId and toolName means the same tool; exposing it twice under
    // two names would be misleading, and reusing one name would be ambiguous.
    expect(resolved).toHaveLength(1)
    expect(resolved[0].namespacedName).toBe('mcp__alpha__run')
  })

  it('keeps serverSlug consistent with the resolved namespaced name', () => {
    const resolved = ensureUniqueNamespacedTools([
      tool('shared-server-id-one', 'Shared', 'run'),
      tool('shared-server-id-two', 'Shared', 'run'),
    ])

    for (const entry of resolved) {
      expect(entry.namespacedName).toBe(`mcp__${entry.serverSlug}__${entry.toolSlug}`)
    }
  })
})

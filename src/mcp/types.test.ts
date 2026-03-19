import { describe, expect, it } from 'vitest'

import {
  buildMcpNamespacedToolName,
  createMcpNamespacedToolIdentity,
  parseMcpNamespacedToolName,
} from './types'

describe('MCP type helpers', () => {
  it('builds a namespaced MCP tool name', () => {
    expect(buildMcpNamespacedToolName('Filesystem Server', 'Read File')).toBe(
      'mcp__filesystem_server__read_file'
    )
  })

  it('creates reverse lookup metadata for a namespaced tool', () => {
    expect(createMcpNamespacedToolIdentity('server-1', 'GitHub', 'Create Issue')).toEqual({
      namespacedName: 'mcp__github__create_issue',
      serverId: 'server-1',
      serverName: 'GitHub',
      serverSlug: 'github',
      toolName: 'Create Issue',
      toolSlug: 'create_issue',
    })
  })

  it('parses a valid namespaced tool name', () => {
    expect(parseMcpNamespacedToolName('mcp__postgres__run_query')).toEqual({
      serverSlug: 'postgres',
      toolSlug: 'run_query',
    })
  })

  it('rejects non-MCP tool names', () => {
    expect(parseMcpNamespacedToolName('web_search')).toBeNull()
  })
})

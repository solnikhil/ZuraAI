import { describe, expect, it } from 'vitest'

import {
  draftServerToInputPayload,
  draftServersToMcpJsonText,
  parseMcpJsonDraftServers,
} from './draft'

describe('MCP draft import helpers', () => {
  it('imports common mcp.json stdio servers with secrets preserved for secure storage', () => {
    const result = parseMcpJsonDraftServers(
      JSON.stringify({
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:\\Projects'],
            env: {
              GITHUB_TOKEN: 'secret-token',
            },
          },
        },
      })
    )

    expect(result.errors).toEqual([])
    expect(result.servers).toHaveLength(1)
    expect(result.servers[0]).toEqual(
      expect.objectContaining({
        name: 'filesystem',
        enabled: true,
        trustState: 'untrusted',
        transport: 'stdio',
        command: 'npx',
        argsText: '-y\n@modelcontextprotocol/server-filesystem\nC:\\Projects',
        requireApproval: true,
      })
    )

    const payload = draftServerToInputPayload(result.servers[0]!)
    expect(payload.env).toEqual([
      expect.objectContaining({
        name: 'GITHUB_TOKEN',
        valueSource: 'secret',
        secretValue: 'secret-token',
        secretStorageKind: 'env',
      }),
    ])
  })

  it('imports remote server headers and splits Authorization into auth token', () => {
    const result = parseMcpJsonDraftServers(
      JSON.stringify({
        mcpServers: {
          docs: {
            transport: 'sse',
            url: 'https://example.com/mcp',
            headers: {
              Authorization: 'Bearer remote-secret',
              'X-Team': 'zura',
            },
          },
        },
      })
    )

    expect(result.errors).toEqual([])
    const server = result.servers[0]!
    expect(server.transport).toBe('sse')
    expect(server.url).toBe('https://example.com/mcp')
    expect(server.authToken).toEqual(
      expect.objectContaining({
        name: 'Authorization',
        valueSource: 'secret',
        secretValue: 'Bearer remote-secret',
        secretStorageKind: 'token',
      })
    )
    expect(server.headers).toEqual([
      expect.objectContaining({
        name: 'X-Team',
        secretValue: 'zura',
      }),
    ])
  })

  it('deduplicates imported names against existing draft names', () => {
    const result = parseMcpJsonDraftServers(
      JSON.stringify({
        mcpServers: {
          filesystem: {
            command: 'npx',
          },
        },
      }),
      { existingNames: ['filesystem'] }
    )

    expect(result.servers[0]?.name).toBe('filesystem 2')
  })

  it('honors disabled flags and nested config values from agent configs', () => {
    const result = parseMcpJsonDraftServers(
      JSON.stringify({
        mcpServers: {
          github: {
            command: 'npx',
            args: ['@modelcontextprotocol/server-github'],
            disabled: true,
            env: {
              GITHUB_TOKEN: {
                value: 'nested-secret',
              },
            },
          },
        },
      })
    )

    const server = result.servers[0]!
    expect(server.enabled).toBe(false)
    expect(server.env[0]).toEqual(
      expect.objectContaining({
        name: 'GITHUB_TOKEN',
        secretValue: 'nested-secret',
      })
    )
  })

  it('serializes draft servers into editable mcp.json without raw stored secrets', () => {
    const imported = parseMcpJsonDraftServers(
      JSON.stringify({
        mcpServers: {
          github: {
            command: 'npx',
            args: ['@modelcontextprotocol/server-github'],
            env: {
              GITHUB_TOKEN: {
                valueSource: 'secret',
                secretStored: true,
                secretKey: 'mcp.server.github.env.GITHUB_TOKEN',
              },
            },
          },
        },
      })
    )

    const json = JSON.parse(draftServersToMcpJsonText(imported.servers))
    expect(json.mcpServers.github.env.GITHUB_TOKEN).toEqual({
      valueSource: 'secret',
      secretStored: true,
      secretKey: 'mcp.server.github.env.GITHUB_TOKEN',
    })
  })

  it('reports invalid JSON and missing mcpServers clearly', () => {
    expect(parseMcpJsonDraftServers('{').errors).toEqual(['mcp.json is invalid.'])
    expect(parseMcpJsonDraftServers('{}').errors).toEqual([
      'No MCP servers found. Expected a top-level "mcpServers" object.',
    ])
  })
})

import { describe, expect, it } from 'vitest'

import {
  isCatalogueEntryAdded,
  loadMcpCatalogue,
  normalizeMcpCatalogueEntries,
} from './catalogue'
import type { McpDraftServer } from './draft'

describe('MCP catalogue normalization', () => {
  it('loads the bundled catalogue without network access', async () => {
    const entries = await loadMcpCatalogue()

    expect(entries.length).toBeGreaterThan(0)
    expect(entries.some((entry) => entry.installKind === 'npm')).toBe(true)
  })

  it('maps npm, pypi, remote, unsupported, and secret-required bundled entries', () => {
    const entries = normalizeMcpCatalogueEntries([
      catalogueEntry({
        name: 'io.example/npm',
        title: 'NPM Server',
        version: '1.0.0',
        install: { type: 'npm', identifier: '@example/mcp' },
      }),
      catalogueEntry({
        name: 'io.example/pypi',
        title: 'PyPI Server',
        install: { type: 'pypi', identifier: 'example-mcp' },
      }),
      catalogueEntry({
        name: 'io.example/sse',
        title: 'SSE Server',
        install: { type: 'sse', url: 'https://example.com/sse' },
        setup: [
          {
            name: 'Authorization',
            description: 'Bearer token',
            secret: true,
            required: true,
            target: 'authToken',
          },
        ],
      }),
      catalogueEntry({
        name: 'io.example/websocket',
        title: 'WebSocket Server',
        install: { type: 'websocket', url: 'wss://example.com/mcp' },
      }),
      catalogueEntry({
        name: 'io.example/github',
        title: 'GitHub Server',
        install: { type: 'npm', identifier: '@example/github-mcp' },
        setup: [
          {
            name: 'GITHUB_TOKEN',
            description: 'GitHub token',
            secret: true,
            required: true,
            target: 'env',
          },
        ],
      }),
      catalogueEntry({
        name: 'io.example/http',
        title: 'HTTP Server',
        install: { type: 'streamable-http', url: 'https://example.com/mcp' },
      }),
    ])

    const npmEntry = entries.find((entry) => entry.name === 'io.example/npm')
    expect(npmEntry).toMatchObject({
      installKind: 'npm',
      supported: true,
      sourceLabel: 'npm package',
    })
    expect(npmEntry?.draft).toMatchObject({
      enabled: false,
      trustState: 'untrusted',
      transport: 'stdio',
      command: 'npx',
      argsText: '-y\n@example/mcp',
      requireApproval: true,
      autoConnect: false,
    })

    const pypiEntry = entries.find((entry) => entry.name === 'io.example/pypi')
    expect(pypiEntry?.draft).toMatchObject({
      transport: 'stdio',
      command: 'uvx',
      argsText: 'example-mcp',
    })

    const sseEntry = entries.find((entry) => entry.name === 'io.example/sse')
    expect(sseEntry).toMatchObject({
      installKind: 'sse',
      supported: true,
      secretRequirements: ['Authorization: Bearer token'],
    })
    expect(sseEntry?.draft).toMatchObject({
      transport: 'sse',
      url: 'https://example.com/sse',
      authToken: expect.objectContaining({
        name: 'Authorization',
        valueSource: 'secret',
        secretValue: '',
        secretStored: false,
      }),
    })

    const websocketEntry = entries.find((entry) => entry.name === 'io.example/websocket')
    expect(websocketEntry?.draft).toMatchObject({
      transport: 'websocket',
      url: 'wss://example.com/mcp',
    })

    const secretEnvEntry = entries.find((entry) => entry.name === 'io.example/github')
    expect(secretEnvEntry?.draft?.env).toEqual([
      expect.objectContaining({
        name: 'GITHUB_TOKEN',
        valueSource: 'secret',
        secretValue: '',
        secretStored: false,
      }),
    ])

    const unsupportedEntry = entries.find((entry) => entry.name === 'io.example/http')
    expect(unsupportedEntry).toMatchObject({
      installKind: 'unsupported',
      supported: false,
      sourceLabel: 'Streamable HTTP remote',
    })
    expect(unsupportedEntry?.draft).toBeUndefined()
  })

  it('detects already configured catalogue entries from package fingerprints', () => {
    const [entry] = normalizeMcpCatalogueEntries([
      catalogueEntry({
        name: 'io.example/npm',
        install: { type: 'npm', identifier: '@example/mcp' },
      }),
    ])
    const draft = {
      name: 'Different display name',
      command: 'npx',
      argsText: '-y\n@example/mcp',
      url: '',
    } as McpDraftServer

    expect(isCatalogueEntryAdded(entry, [draft])).toBe(true)
  })
})

function catalogueEntry(entry: Record<string, unknown>) {
  return {
    description: 'Demo entry',
    version: '1.0.0',
    publisher: 'Example',
    ...entry,
  }
}

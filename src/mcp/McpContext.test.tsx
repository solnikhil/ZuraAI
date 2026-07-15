import React from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { McpProvider, useMcp } from './McpContext'
import { createDraftConfigValue } from './draft'

let stateListener: ((snapshot: any) => void) | null = null
const windowWithMcp = window as Window & typeof globalThis & { mcp: any }

describe('McpContext', () => {
  beforeEach(() => {
    stateListener = null
    windowWithMcp.mcp = {
      listServers: vi.fn(async () => []),
      addServer: vi.fn(async (serverConfig: unknown) => serverConfig as any),
      updateServer: vi.fn(async (_serverId: string, updates: unknown) => updates as any),
      removeServer: vi.fn(async () => true),
      connectServer: vi.fn(async (serverId: string) => ({
        serverId,
        status: 'connected',
        tools: [],
        capabilities: { tools: true, resources: false, prompts: false },
        lastConnectionError: null,
        lastConnectionTime: null,
      })),
      disconnectServer: vi.fn(async (serverId: string) => ({
        serverId,
        status: 'disconnected',
        tools: [],
        capabilities: { tools: false, resources: false, prompts: false },
        lastConnectionError: null,
        lastConnectionTime: null,
      })),
      getState: vi.fn(async () => createSnapshot()),
      openConfigFile: vi.fn(async () => ({ ok: true, path: '/tmp/mcp-servers.json' })),
      listTools: vi.fn(async () => []),
      executeTool: vi.fn(async () => ({ success: true, metadata: { origin: 'mcp' } })),
      resolveApproval: vi.fn(async () => ({
        requestId: 'approval-1',
        approved: true,
        resolvedAt: Date.now(),
        outcome: 'approved',
      })),
      onStateChange: vi.fn((callback: (snapshot: unknown) => void) => {
        stateListener = callback as (snapshot: any) => void
        return () => {
          stateListener = null
        }
      }),
    }
  })

  it('hydrates snapshot state from the preload bridge and reacts to broadcasts', async () => {
    render(
      <McpProvider>
        <Probe />
      </McpProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('server-count').textContent).toBe('1')
      expect(screen.getByTestId('connected-count').textContent).toBe('1')
      expect(screen.getByTestId('tool-count').textContent).toBe('1')
    })

    act(() => {
      stateListener?.(
        createSnapshot({
          runtimeStates: [
            {
              serverId: 'server-1',
              status: 'error',
              error: 'boom',
              tools: [],
              capabilities: { tools: false, resources: false, prompts: false },
              lastConnectionError: 'boom',
              lastConnectionTime: null,
            },
          ],
          tools: [],
        })
      )
    })

    expect(screen.getByTestId('connected-count').textContent).toBe('0')
    expect(screen.getByTestId('tool-count').textContent).toBe('0')
  })

  it('automatically persists valid draft changes through the MCP bridge', async () => {
    render(
      <McpProvider>
        <Probe />
      </McpProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('dirty-flag').textContent).toBe('clean')
    })

    fireEvent.click(screen.getByRole('button', { name: 'add-draft' }))

    expect(screen.getByTestId('dirty-flag').textContent).toBe('dirty')
    expect(screen.getByTestId('draft-count').textContent).toBe('2')

    await waitFor(() => {
      expect(windowWithMcp.mcp.addServer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Filesystem',
          transport: 'stdio',
          command: 'npx',
        })
      )
    })

    expect(windowWithMcp.mcp.getState).toHaveBeenCalledTimes(3)
  })

  it('blocks saving drafts with required secrets that have not been filled', async () => {
    render(
      <McpProvider>
        <Probe />
      </McpProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('dirty-flag').textContent).toBe('clean')
    })

    fireEvent.click(screen.getByRole('button', { name: 'add-secret-draft' }))
    await waitFor(() => {
      expect(screen.getByTestId('save-error').textContent).toContain(
        'Secret Server: Auth token needs a secret value or a stored secret.'
      )
    })
    expect(windowWithMcp.mcp.addServer).not.toHaveBeenCalled()
  })

  it('adds a valid server immediately through the MCP bridge', async () => {
    render(
      <McpProvider>
        <Probe />
      </McpProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('dirty-flag').textContent).toBe('clean')
    })

    fireEvent.click(screen.getByRole('button', { name: 'add-server-now' }))

    await waitFor(() => {
      expect(windowWithMcp.mcp.addServer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Immediate Server',
          transport: 'stdio',
          command: 'npx',
        })
      )
    })
    expect(windowWithMcp.mcp.getState).toHaveBeenCalledTimes(2)
  })
})

function Probe(): React.ReactElement {
  const {
    addServer,
    connectServer,
    createDraftServer,
    draftServers,
    error,
    hasDraftChanges,
    pendingApprovals,
    runtimeStates,
    tools,
    upsertDraftServer,
  } = useMcp()
  return (
    <div>
      <div data-testid="server-count">{draftServers.length}</div>
      <div data-testid="draft-count">{draftServers.length}</div>
      <div data-testid="connected-count">
        {runtimeStates.filter((state) => state.status === 'connected').length}
      </div>
      <div data-testid="tool-count">{tools.length}</div>
      <div data-testid="approval-count">{pendingApprovals.length}</div>
      <div data-testid="dirty-flag">{hasDraftChanges ? 'dirty' : 'clean'}</div>
      <div data-testid="save-error">{error}</div>
      <button
        type="button"
        aria-label="add-server-now"
        onClick={() => {
          const nextServer = createDraftServer()
          void addServer({
            ...nextServer,
            name: 'Immediate Server',
            transport: 'stdio',
            command: 'npx',
            argsText: '@example/mcp',
            enabled: false,
          })
        }}
      >
        add-server-now
      </button>
      <button
        type="button"
        aria-label="add-draft"
        onClick={() => {
          const nextServer = createDraftServer()
          upsertDraftServer({
            ...nextServer,
            name: 'Filesystem',
            transport: 'stdio',
            command: 'npx',
            argsText: '@modelcontextprotocol/server-filesystem',
            enabled: true,
          })
        }}
      >
        add-draft
      </button>
      <button
        type="button"
        aria-label="add-secret-draft"
        onClick={() => {
          const nextServer = createDraftServer()
          upsertDraftServer({
            ...nextServer,
            name: 'Secret Server',
            transport: 'sse',
            url: 'https://example.com/sse',
            authToken: createDraftConfigValue('token', {
              name: 'Authorization',
              valueSource: 'secret',
              secretValue: '',
              secretStored: false,
            }),
          })
        }}
      >
        add-secret-draft
      </button>
      <button type="button" aria-label="connect" onClick={() => void connectServer('server-1')}>
        connect
      </button>
    </div>
  )
}

function createSnapshot(overrides: Partial<any> = {}) {
  return {
    servers: [
      {
        id: 'server-1',
        name: 'Reference Server',
        enabled: true,
        trustState: 'trusted',
        transport: 'stdio',
        command: 'node',
        args: [],
        cwd: '/tmp',
        env: [],
        headers: [],
        autoConnect: false,
        startupTimeoutMs: 500,
        toolTimeoutMs: 500,
        reconnectAttempts: 0,
        reconnectDelayMs: 1000,
        requireApproval: true,
        lastKnownTools: [{ name: 'read_file', inputSchema: { type: 'object' } }],
        lastConnectionError: null,
        lastConnectionTime: null,
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
      },
    ],
    runtimeStates: [
      {
        serverId: 'server-1',
        status: 'connected',
        tools: [{ name: 'read_file', inputSchema: { type: 'object' } }],
        capabilities: { tools: true, resources: false, prompts: false },
        lastConnectionError: null,
        lastConnectionTime: '2026-03-20T00:00:00.000Z',
      },
    ],
    tools: [{ namespacedName: 'mcp__reference_server__read_file' }],
    pendingApprovals: [],
    ...overrides,
  }
}

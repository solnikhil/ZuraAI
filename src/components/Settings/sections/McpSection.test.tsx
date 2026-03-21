import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { McpSection } from './McpSection'

const mockShowToast = vi.fn()
const mockUseMcp = vi.fn()

vi.mock('@/components/shared', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('@/mcp/McpContext', () => ({
  useMcp: () => mockUseMcp(),
}))

describe('McpSection', () => {
  beforeEach(() => {
    mockShowToast.mockReset()
    mockUseMcp.mockReset()
  })

  it('renders configured servers with connection state and discovered tools', () => {
    mockUseMcp.mockReturnValue(createMcpContextValue())

    render(<McpSection />)

    expect(screen.getByRole('heading', { name: 'MCP Servers' })).toBeTruthy()
    expect(screen.getByText('Filesystem')).toBeTruthy()
    expect(screen.getByText('Connected')).toBeTruthy()
    expect(screen.getByText('2 tools')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Disconnect' }).hasAttribute('disabled')).toBe(false)
  })

  it('opens the add dialog and applies a valid draft server', () => {
    const upsertDraftServer = vi.fn()
    const createDraftServer = vi.fn(() => ({
      id: 'draft-1',
      name: '',
      enabled: false,
      trustState: 'untrusted',
      transport: 'stdio',
      command: '',
      argsText: '',
      cwd: '',
      url: '',
      env: [],
      headers: [],
      authToken: null,
      autoConnect: false,
      startupTimeoutMs: '',
      toolTimeoutMs: '',
      reconnectAttempts: '',
      reconnectDelayMs: '',
      requireApproval: true,
    }))

    mockUseMcp.mockReturnValue(
      createMcpContextValue({
        draftServers: [],
        servers: [],
        runtimeStates: [],
        tools: [],
        createDraftServer,
        upsertDraftServer,
      })
    )

    render(<McpSection />)

    fireEvent.click(screen.getByRole('button', { name: /add server/i }))
    fireEvent.change(screen.getByLabelText('Server name'), { target: { value: 'Filesystem' } })
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'npx' } })
    fireEvent.change(screen.getByLabelText('Arguments'), { target: { value: '@modelcontextprotocol/server-filesystem' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply Draft' }))

    expect(upsertDraftServer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Filesystem',
        transport: 'stdio',
        command: 'npx',
      })
    )
  })
})

function createMcpContextValue(overrides: Record<string, unknown> = {}) {
  const server = {
    id: 'server-1',
    name: 'Filesystem',
    enabled: true,
    trustState: 'trusted',
    transport: 'stdio',
    command: 'npx',
    argsText: '@modelcontextprotocol/server-filesystem',
    cwd: '',
    url: '',
    env: [],
    headers: [],
    authToken: null,
    autoConnect: false,
    startupTimeoutMs: '500',
    toolTimeoutMs: '500',
    reconnectAttempts: '',
    reconnectDelayMs: '',
    requireApproval: true,
  }

  return {
    isSupported: true,
    isLoading: false,
    isRefreshing: false,
    error: null,
    servers: [
      {
        ...server,
        args: ['@modelcontextprotocol/server-filesystem'],
        lastKnownTools: [
          { name: 'read_file', inputSchema: { type: 'object' } },
          { name: 'write_file', inputSchema: { type: 'object' } },
        ],
        lastKnownResources: [{ uri: 'file:///tmp/demo.txt', title: 'Demo File' }],
        lastKnownPrompts: [{ name: 'summarize_demo', title: 'Summarize Demo' }],
        lastConnectionError: null,
        lastConnectionTime: '2026-03-20T00:00:00.000Z',
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
      },
    ],
    runtimeStates: [
      {
        serverId: 'server-1',
        status: 'connected',
        tools: [
          { name: 'read_file', inputSchema: { type: 'object' } },
          { name: 'write_file', inputSchema: { type: 'object' } },
        ],
        resources: [{ uri: 'file:///tmp/demo.txt', title: 'Demo File' }],
        prompts: [{ name: 'summarize_demo', title: 'Summarize Demo' }],
        capabilities: { tools: true, resources: false, prompts: false },
        lastConnectionError: null,
        lastConnectionTime: '2026-03-20T00:00:00.000Z',
      },
    ],
    tools: [{ namespacedName: 'mcp__filesystem__read_file' }],
    resources: [{ serverId: 'server-1', serverName: 'Filesystem', manifest: { uri: 'file:///tmp/demo.txt', title: 'Demo File' }, exposure: { userVisible: true, modelVisible: false, requiresExplicitUserAction: true } }],
    prompts: [{ serverId: 'server-1', serverName: 'Filesystem', manifest: { name: 'summarize_demo', title: 'Summarize Demo' }, exposure: { userVisible: true, modelVisible: false, requiresExplicitUserAction: true } }],
    pendingApprovals: [],
    draftServers: [server],
    hasDraftChanges: false,
    createDraftServer: vi.fn(() => server),
    upsertDraftServer: vi.fn(),
    removeDraftServer: vi.fn(),
    discardDraft: vi.fn(),
    saveDraft: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
    connectServer: vi.fn(async () => undefined),
    disconnectServer: vi.fn(async () => undefined),
    resolveApproval: vi.fn(async () => undefined),
    getRuntimeState: vi.fn(() => ({
      serverId: 'server-1',
      status: 'connected',
      tools: [
        { name: 'read_file', inputSchema: { type: 'object' } },
        { name: 'write_file', inputSchema: { type: 'object' } },
      ],
      resources: [{ uri: 'file:///tmp/demo.txt', title: 'Demo File' }],
      prompts: [{ name: 'summarize_demo', title: 'Summarize Demo' }],
      capabilities: { tools: true, resources: false, prompts: false },
      lastConnectionError: null,
      lastConnectionTime: '2026-03-20T00:00:00.000Z',
    })),
    ...overrides,
  }
}

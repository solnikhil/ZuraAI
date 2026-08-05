import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { McpSection } from './McpSection'

const mockShowToast = vi.fn()
const mockUseMcp = vi.fn()
const mockFetchMcpCatalogue = vi.fn()

vi.mock('@/components/shared', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('@/mcp/catalogue', () => ({
  fetchMcpCatalogue: (...args: unknown[]) => mockFetchMcpCatalogue(...args),
  isCatalogueEntryAdded: () => false,
}))

vi.mock('@/mcp/McpContext', () => ({
  useMcp: () => mockUseMcp(),
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: React.ReactNode
    disabled?: boolean
    onSelect?: () => void
  }) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <div />,
}))

describe('McpSection', () => {
  beforeEach(() => {
    mockShowToast.mockReset()
    mockUseMcp.mockReset()
    mockFetchMcpCatalogue.mockReset()
    mockFetchMcpCatalogue.mockResolvedValue([
      {
        id: 'npm-entry',
        name: 'io.example/npm',
        title: 'NPM Server',
        description: 'Installable npm MCP',
        version: '1.0.0',
        publisher: 'Example',
        sourceLabel: 'npm package',
        installKind: 'npm',
        supported: true,
        draft: {
          id: 'draft-npm',
          name: 'NPM Server',
          enabled: true,
          trustState: 'untrusted',
          transport: 'stdio',
          command: 'npx',
          argsText: '-y\n@example/mcp',
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
          toolAllowlistText: '',
          toolBlocklistText: '',
          auth: { mode: 'none', state: 'none' },
        },
        secretRequirements: [],
        fingerprints: ['npm:@example/mcp'],
        isLatest: true,
      },
    ])
  })

  it('renders configured servers with connection state and discovered tools', () => {
    mockUseMcp.mockReturnValue(createMcpContextValue())

    render(<McpSection />)

    expect(screen.getByRole('heading', { name: 'MCP Servers' })).toBeTruthy()
    expect(screen.getByText('Filesystem')).toBeTruthy()
    expect(screen.getByText('Connected')).toBeTruthy()
    expect(screen.getByText('2', { selector: '.mcp-server-stat-active' })).toBeTruthy()

    expect(screen.getByRole('button', { name: /edit mcp\.json/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /add server/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'More MCP actions' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open actions for Filesystem' })).toBeTruthy()
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
      toolBlocklistText: '',
      toolAllowlistText: '',
      auth: { mode: 'none', state: 'none' },
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

    fireEvent.click(screen.getByRole('menuitem', { name: /add manually/i }))
    fireEvent.change(screen.getByPlaceholderText('Filesystem'), { target: { value: 'Filesystem' } })
    fireEvent.change(screen.getByPlaceholderText('npx'), { target: { value: 'npx' } })
    const argsTextarea = screen.getByPlaceholderText(/-y/)
    fireEvent.change(argsTextarea, { target: { value: '@modelcontextprotocol/server-filesystem' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(upsertDraftServer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Filesystem',
        transport: 'stdio',
        command: 'npx',
      })
    )
  })

  it('applies edited mcp.json servers as replacement drafts', () => {
    const upsertDraftServer = vi.fn()
    const removeDraftServer = vi.fn()

    mockUseMcp.mockReturnValue(
      createMcpContextValue({
        removeDraftServer,
        upsertDraftServer,
      })
    )

    render(<McpSection />)

    fireEvent.click(screen.getByRole('button', { name: /edit mcp\.json/i }))
    fireEvent.change(screen.getByPlaceholderText(/"mcpServers"/), {
      target: {
        value: JSON.stringify({
          mcpServers: {
            filesystem: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:\\Projects'],
              env: {
                GITHUB_TOKEN: 'secret-token',
              },
            },
          },
        }),
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply JSON' }))

    expect(removeDraftServer).toHaveBeenCalledWith('server-1')
    expect(upsertDraftServer).toHaveBeenCalledWith(
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
    expect(mockShowToast).toHaveBeenCalledWith('Updated 1 MCP server from mcp.json.', 'success')
  })

  it('opens the local MCP config file from the JSON editor', () => {
    const openConfigFile = vi.fn(async () => ({
      ok: true,
      path: 'C:\\Users\\Nikhil\\AppData\\Roaming\\ZuraAI\\mcp-servers.json',
    }))

    mockUseMcp.mockReturnValue(
      createMcpContextValue({
        openConfigFile,
      })
    )

    render(<McpSection />)

    fireEvent.click(screen.getByRole('button', { name: /edit mcp\.json/i }))
    fireEvent.click(screen.getByRole('button', { name: /open local file/i }))

    expect(openConfigFile).toHaveBeenCalled()
  })

  it('tells the user deletion applies immediately and removes the server on confirm', () => {
    const removeDraftServer = vi.fn()
    mockUseMcp.mockReturnValue(createMcpContextValue({ removeDraftServer }))

    render(<McpSection />)

    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }))

    // The MCP draft autosaves 250ms after confirmation, so the dialog must not
    // imply the deletion is staged behind a Save action.
    const description = screen.getByText(/removes the server from your configuration/i)
    expect(description.textContent).toMatch(/immediately/i)
    expect(description.textContent).toMatch(/cannot be undone/i)
    expect(description.textContent).not.toMatch(/save your changes to apply/i)
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /delete now/i }))
    expect(removeDraftServer).toHaveBeenCalledWith('server-1')
  })

  it('announces autosave progress and completion to assistive technology', () => {
    mockUseMcp.mockReturnValue(createMcpContextValue({ hasDraftChanges: true }))
    const { rerender } = render(<McpSection />)

    const applying = screen.getByText('Applying MCP changes...')
    expect(applying.closest('[role="status"]')).not.toBeNull()

    mockUseMcp.mockReturnValue(createMcpContextValue({ hasDraftChanges: false }))
    rerender(<McpSection />)

    expect(screen.getByText('MCP configuration changes applied.')).toBeTruthy()
  })

  it('announces autosave failures as an alert instead of a success message', () => {
    mockUseMcp.mockReturnValue(createMcpContextValue({ hasDraftChanges: true }))
    const { rerender } = render(<McpSection />)

    mockUseMcp.mockReturnValue(
      createMcpContextValue({ hasDraftChanges: false, error: 'Could not write mcp-servers.json' })
    )
    rerender(<McpSection />)

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Could not write mcp-servers.json')
    expect(screen.queryByText('MCP configuration changes applied.')).toBeNull()
  })

  it('opens Browse Library in catalogue mode and adds selected servers immediately', async () => {
    const addServer = vi.fn(async () => undefined)
    mockUseMcp.mockReturnValue(createMcpContextValue({ addServer }))

    render(<McpSection />)

    fireEvent.click(screen.getByRole('button', { name: /browse library/i }))

    expect(await screen.findByLabelText(/search mcp catalogue/i)).toBeTruthy()
    expect(mockFetchMcpCatalogue).toHaveBeenCalled()
    expect(await screen.findByText(/npm server/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    expect(addServer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'NPM Server',
        enabled: true,
        trustState: 'untrusted',
        requireApproval: true,
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
    toolBlocklistText: '',
    toolAllowlistText: '',
    auth: { mode: 'none', state: 'none' },
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
    resources: [
      {
        serverId: 'server-1',
        serverName: 'Filesystem',
        manifest: { uri: 'file:///tmp/demo.txt', title: 'Demo File' },
        exposure: { userVisible: true, modelVisible: false, requiresExplicitUserAction: true },
      },
    ],
    prompts: [
      {
        serverId: 'server-1',
        serverName: 'Filesystem',
        manifest: { name: 'summarize_demo', title: 'Summarize Demo' },
        exposure: { userVisible: true, modelVisible: false, requiresExplicitUserAction: true },
      },
    ],
    pendingApprovals: [],
    authStatuses: [
      {
        serverId: 'server-1',
        mode: 'none',
        state: 'none',
        label: 'No auth',
        requiresSignIn: false,
        lastError: null,
      },
    ],
    draftServers: [server],
    hasDraftChanges: false,
    createDraftServer: vi.fn(() => server),
    addServer: vi.fn(async () => undefined),
    upsertDraftServer: vi.fn(),
    removeDraftServer: vi.fn(),
    refresh: vi.fn(async () => undefined),
    openConfigFile: vi.fn(async () => ({ ok: true, path: 'mcp-servers.json' })),
    connectServer: vi.fn(async () => undefined),
    disconnectServer: vi.fn(async () => undefined),
    startOAuth: vi.fn(async () => undefined),
    clearOAuth: vi.fn(async () => undefined),
    getAuthStatus: vi.fn(() => ({
      serverId: 'server-1',
      mode: 'none',
      state: 'none',
      label: 'No auth',
      requiresSignIn: false,
      lastError: null,
    })),
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

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import McpLibraryDialog from './McpLibraryDialog'

const mocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  readResource: vi.fn(),
  getPrompt: vi.fn(),
  upsertDraftServer: vi.fn(),
  fetchMcpCatalogue: vi.fn(),
  isCatalogueEntryAdded: vi.fn(),
}))

vi.mock('@/components/shared', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}))

vi.mock('@/mcp/catalogue', () => ({
  fetchMcpCatalogue: (...args: unknown[]) => mocks.fetchMcpCatalogue(...args),
  isCatalogueEntryAdded: (...args: unknown[]) => mocks.isCatalogueEntryAdded(...args),
}))

vi.mock('@/mcp/McpContext', () => ({
  useMcp: () => ({
    draftServers: [],
    resources: [
      {
        serverId: 'server-1',
        serverName: 'Filesystem',
        manifest: {
          uri: 'file:///tmp/demo.txt',
          title: 'Demo File',
        },
        exposure: {
          userVisible: true,
          modelVisible: false,
          requiresExplicitUserAction: true,
        },
      },
    ],
    prompts: [
      {
        serverId: 'server-1',
        serverName: 'Filesystem',
        manifest: {
          name: 'summarize_demo',
          title: 'Summarize Demo',
          arguments: [{ name: 'topic', required: true }],
        },
        exposure: {
          userVisible: true,
          modelVisible: false,
          requiresExplicitUserAction: true,
        },
      },
    ],
    readResource: mocks.readResource,
    getPrompt: mocks.getPrompt,
    upsertDraftServer: mocks.upsertDraftServer,
  }),
}))

describe('McpLibraryDialog', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.showToast.mockClear()
    mocks.readResource.mockClear()
    mocks.getPrompt.mockClear()
    mocks.readResource.mockResolvedValue({
      contents: [{ uri: 'file:///tmp/demo.txt', text: 'Demo resource body' }],
    })
    mocks.getPrompt.mockResolvedValue({
      description: 'Prompt preview',
      messages: [{ role: 'user', content: 'Prompt body' }],
    })
    mocks.upsertDraftServer.mockReset()
    mocks.fetchMcpCatalogue.mockReset()
    mocks.fetchMcpCatalogue.mockResolvedValue([
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
          enabled: false,
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
        },
        secretRequirements: [],
        fingerprints: ['npm:@example/mcp'],
        isLatest: true,
      },
      {
        id: 'unsupported-entry',
        name: 'io.example/http',
        title: 'HTTP Server',
        description: 'Unsupported transport',
        sourceLabel: 'Streamable HTTP remote',
        installKind: 'unsupported',
        supported: false,
        unsupportedReason: 'ZuraAI does not support streamable-http MCP transport yet.',
        secretRequirements: ['Authorization: Bearer token'],
        fingerprints: ['name:io.example/http'],
        isLatest: true,
      },
    ])
    mocks.isCatalogueEntryAdded.mockReset()
    mocks.isCatalogueEntryAdded.mockReturnValue(false)
  })

  it('reads a resource and inserts it into the composer draft', async () => {
    const onInsertText = vi.fn()

    render(
      <McpLibraryDialog open={true} onOpenChange={vi.fn()} onInsertText={onInsertText} />
    )

    fireEvent.click(screen.getByRole('button', { name: /demo file/i }))

    await waitFor(() => {
      expect(mocks.readResource).toHaveBeenCalledWith('server-1', 'file:///tmp/demo.txt')
    })

    fireEvent.click(screen.getByRole('button', { name: /insert into composer/i }))

    expect(onInsertText).toHaveBeenCalledWith(expect.stringContaining('Demo resource body'))
  })

  it('renders prompts and inserts the expanded prompt into the composer draft', async () => {
    const onInsertText = vi.fn()

    render(
      <McpLibraryDialog
        open={true}
        onOpenChange={vi.fn()}
        initialMode="prompts"
        onInsertText={onInsertText}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /summarize demo/i }))
    fireEvent.change(screen.getByPlaceholderText('topic'), { target: { value: 'release notes' } })
    fireEvent.click(screen.getByRole('button', { name: /preview prompt/i }))

    await waitFor(() => {
      expect(mocks.getPrompt).toHaveBeenCalledWith('server-1', 'summarize_demo', { topic: 'release notes' })
    })

    fireEvent.click(screen.getByRole('button', { name: /insert into composer/i }))

    expect(onInsertText).toHaveBeenCalledWith(expect.stringContaining('Prompt body'))
  })

  it('resets preview state when the dialog is reopened', async () => {
    const { rerender } = render(
      <McpLibraryDialog open={true} onOpenChange={vi.fn()} onInsertText={vi.fn()} />
    )

    fireEvent.click(screen.getByRole('button', { name: /demo file/i }))

    await waitFor(() => {
      expect(mocks.readResource).toHaveBeenCalledWith('server-1', 'file:///tmp/demo.txt')
    })

    expect(screen.getByRole('button', { name: /insert into composer/i })).toBeInTheDocument()

    rerender(<McpLibraryDialog open={false} onOpenChange={vi.fn()} onInsertText={vi.fn()} />)
    rerender(<McpLibraryDialog open={true} onOpenChange={vi.fn()} onInsertText={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /insert into composer/i })).not.toBeInTheDocument()
    expect(screen.getByText('Select a resource to preview its contents.')).toBeInTheDocument()
  })

  it('loads catalogue entries and adds compatible servers as drafts', async () => {
    render(
      <McpLibraryDialog open={true} onOpenChange={vi.fn()} initialMode="catalogue" />
    )

    await waitFor(() => {
      expect(mocks.fetchMcpCatalogue).toHaveBeenCalled()
    })

    expect(await screen.findByText(/npm server/i)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /add draft/i })[0])

    expect(mocks.upsertDraftServer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'NPM Server',
        enabled: false,
        trustState: 'untrusted',
        requireApproval: true,
      })
    )
    expect(mocks.showToast).toHaveBeenCalledWith(
      'Added NPM Server as a draft. Review and save to install.',
      'success'
    )
  })

  it('shows unsupported bundled entries without allowing installation', async () => {
    render(
      <McpLibraryDialog open={true} onOpenChange={vi.fn()} initialMode="catalogue" />
    )

    fireEvent.change(await screen.findByLabelText(/search mcp catalogue/i), {
      target: { value: 'HTTP' },
    })
    expect(await screen.findByText(/http server/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText(/^details$/i))

    expect(screen.getByText(/does not support streamable-http/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add draft/i })).toBeDisabled()
  })

  it('marks already configured catalogue entries as added', async () => {
    mocks.isCatalogueEntryAdded.mockReturnValue(true)

    render(
      <McpLibraryDialog open={true} onOpenChange={vi.fn()} initialMode="catalogue" />
    )

    await screen.findByText(/npm server/i)

    expect(screen.getAllByRole('button', { name: /^added$/i }).every((button) => button.hasAttribute('disabled'))).toBe(true)
  })
})

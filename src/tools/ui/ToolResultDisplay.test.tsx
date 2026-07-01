import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ToolResultDisplay from './ToolResultDisplay'

const mockUseOptionalMcp = vi.fn()

vi.mock('../../mcp/McpContext', () => ({
  useOptionalMcp: () => mockUseOptionalMcp(),
}))

describe('ToolResultDisplay', () => {
  beforeEach(() => {
    mockUseOptionalMcp.mockReset()
  })

  it('renders MCP audit metadata and formatted output for generic tool results', () => {
    render(
      <ToolResultDisplay
        toolName="mcp__filesystem__read_file"
        result={{ text: 'Hello from MCP' }}
        toolArguments={{ path: '/tmp/demo.txt' }}
        executionTime={42}
        metadata={{
          origin: 'mcp',
          serverId: 'filesystem',
          serverName: 'Filesystem',
          namespacedToolName: 'mcp__filesystem__read_file',
          originalToolName: 'read_file',
          trusted: true,
          approvalState: 'approved',
          durationMs: 42,
          outcome: 'success',
        }}
      />
    )

    expect(screen.getByText('Read File')).toBeInTheDocument()
    expect(screen.getByText('Filesystem MCP')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Read File'))

    expect(screen.getByText('Hello from MCP')).toBeInTheDocument()
    expect(screen.getByText('Details')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Details'))

    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Trusted').length).toBeGreaterThan(0)
    expect(screen.getByText('Server')).toBeInTheDocument()
    expect(screen.getByText('Filesystem')).toBeInTheDocument()
    expect(screen.getByText('Input')).toBeInTheDocument()
  })

  it('distinguishes approval rejection from execution failure', () => {
    render(
      <ToolResultDisplay
        toolName="mcp__github__create_issue"
        result={undefined}
        error="Approval rejected by user"
        metadata={{
          origin: 'mcp',
          serverId: 'github',
          serverName: 'GitHub',
          namespacedToolName: 'mcp__github__create_issue',
          originalToolName: 'create_issue',
          trusted: true,
          approvalState: 'rejected',
          durationMs: 5,
          outcome: 'rejected',
        }}
      />
    )

    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('Create Issue'))
    fireEvent.click(screen.getByText('Details'))
    expect(
      screen.getByText('The tool run was blocked by the current approval policy.')
    ).toBeInTheDocument()
  })

  it('surfaces disconnect errors distinctly from generic failures', () => {
    render(
      <ToolResultDisplay
        toolName="mcp__filesystem__read_file"
        result={undefined}
        error="MCP transport disconnected before response was received"
        metadata={{
          origin: 'mcp',
          serverId: 'filesystem',
          serverName: 'Filesystem',
          namespacedToolName: 'mcp__filesystem__read_file',
          originalToolName: 'read_file',
          trusted: true,
          approvalState: 'approved',
          durationMs: 25,
          outcome: 'cancelled',
        }}
      />
    )

    expect(screen.getByText('Disconnected')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Read File'))
    fireEvent.click(screen.getByText('Details'))
    expect(
      screen.getByText('The MCP server disconnected before the tool could finish.')
    ).toBeInTheDocument()
  })

  it('renders structured output as list items when available', () => {
    render(
      <ToolResultDisplay
        toolName="mcp__filesystem__list_directory"
        result={{
          files: [
            { name: 'readme.md', description: 'Documentation file' },
            { name: 'package.json', description: 'NPM configuration' },
          ],
        }}
        metadata={{
          origin: 'mcp',
          serverId: 'filesystem',
          serverName: 'Filesystem',
          namespacedToolName: 'mcp__filesystem__list_directory',
          originalToolName: 'list_directory',
          trusted: true,
          approvalState: 'approved',
          durationMs: 15,
          outcome: 'success',
        }}
      />
    )

    expect(screen.getByText('List Directory')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()

    fireEvent.click(screen.getByText('List Directory'))

    expect(screen.getByText('readme.md')).toBeInTheDocument()
    expect(screen.getByText('Documentation file')).toBeInTheDocument()
    expect(screen.getByText('package.json')).toBeInTheDocument()
    expect(screen.getByText('NPM configuration')).toBeInTheDocument()
  })

  it('renders an MCP add review and approves add/connect', async () => {
    const approvePendingAddRequest = vi.fn(async () => ({
      requestId: 'request-1',
      status: 'connected',
      requiredSecrets: [],
      server: {
        id: 'server-1',
        name: 'Gmail',
      },
    }))
    const cancelPendingAddRequest = vi.fn()
    mockUseOptionalMcp.mockReturnValue({
      approvePendingAddRequest,
      cancelPendingAddRequest,
    })

    render(
      <ToolResultDisplay
        toolName="mcp_request_add"
        result={{
          requestId: 'request-1',
          status: 'pending',
          mode: 'catalogue',
          serverName: 'Gmail',
          sourceLabel: 'npm package',
          reason: 'User asked to add Gmail MCP.',
          transport: 'stdio',
          command: 'npx',
          args: ['-y', 'gmail-workspace-mcp-server'],
          requiredSecrets: ['GMAIL_OAUTH_CLIENT_ID'],
          authMode: 'envSecret',
          riskNotes: ['Tools remain untrusted until reviewed.'],
          canAdd: true,
        }}
      />
    )

    expect(screen.getByText('Add MCP: Gmail')).toBeInTheDocument()
    expect(screen.getByText('Untrusted after connect')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /add and connect/i }))

    expect(await screen.findByText(/Connected\. Review and trust/i)).toBeInTheDocument()
    expect(approvePendingAddRequest).toHaveBeenCalledWith('request-1')
  })
})

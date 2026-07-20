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

  it('renders nothing for generic agent tools', () => {
    const { container } = render(
      <ToolResultDisplay
        toolName="window_list"
        result={{ windows: [] }}
        metadata={{ origin: 'builtin-main' }}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders artifact create/update summaries', () => {
    render(
      <ToolResultDisplay
        toolName="artifact_create"
        result={{ title: 'Demo chart', kind: 'html', versionId: 'abcdef12-3456' }}
      />
    )

    expect(screen.getByText('Artifact created')).toBeInTheDocument()
    expect(screen.getByText(/Demo chart · html · abcdef12/)).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
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

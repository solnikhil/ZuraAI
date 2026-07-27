import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AgentTrustedActionsCard } from './AgentTrustedActionsCard'

const action = {
  id: '00000000-0000-4000-8000-000000000001',
  toolName: 'system_shell',
  riskClass: 'high' as const,
  createdAt: Date.UTC(2026, 0, 1),
  lastUsedAt: Date.UTC(2026, 0, 2),
}

describe('AgentTrustedActionsCard', () => {
  beforeEach(() => {
    window.agentApproval = {
      requestApproval: vi.fn(),
      getAutonomousMode: vi.fn(async () => ({ enabled: false })),
      setAutonomousMode: vi.fn(async (enabled: boolean) => ({ enabled })),
      listTrustedActions: vi.fn(async () => [action]),
      revokeTrustedAction: vi.fn(async () => true),
      revokeAllTrustedActions: vi.fn(async () => 1),
    }
  })

  it('renders only sanitized metadata and revokes an individual grant', async () => {
    render(<AgentTrustedActionsCard />)

    expect(await screen.findByText('system_shell')).toBeInTheDocument()
    expect(screen.getByText(/High risk/)).toBeInTheDocument()
    expect(screen.queryByText(/command|argument value|secret/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Revoke trusted action for system_shell' }))
    await waitFor(() =>
      expect(window.agentApproval?.revokeTrustedAction).toHaveBeenCalledWith(action.id)
    )
    expect(screen.getByText('No trusted exact-repeat actions.')).toBeInTheDocument()
  })

  it('revokes every grant through the narrow main bridge', async () => {
    render(<AgentTrustedActionsCard />)
    const revokeAll = await screen.findByRole('button', {
      name: 'Revoke all trusted actions',
    })
    fireEvent.click(revokeAll)

    await waitFor(() =>
      expect(window.agentApproval?.revokeAllTrustedActions).toHaveBeenCalledOnce()
    )
    expect(screen.getByText('No trusted exact-repeat actions.')).toBeInTheDocument()
  })

  it('surfaces main storage failures without inventing empty state', async () => {
    vi.mocked(window.agentApproval!.listTrustedActions).mockRejectedValueOnce(
      new Error('Secure storage unavailable')
    )
    render(<AgentTrustedActionsCard />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Secure storage unavailable')
    expect(screen.queryByText('No trusted exact-repeat actions.')).not.toBeInTheDocument()
  })

  it('prevents duplicate revoke mutations while one is in flight', async () => {
    let resolveRevoke: ((value: boolean) => void) | undefined
    vi.mocked(window.agentApproval!.revokeTrustedAction).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRevoke = resolve
        })
    )
    render(<AgentTrustedActionsCard />)

    const revoke = await screen.findByRole('button', {
      name: 'Revoke trusted action for system_shell',
    })
    fireEvent.click(revoke)

    expect(revoke).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Revoke all trusted actions' })).toBeDisabled()
    fireEvent.click(revoke)
    expect(window.agentApproval?.revokeTrustedAction).toHaveBeenCalledOnce()

    resolveRevoke?.(true)
    expect(await screen.findByText('No trusted exact-repeat actions.')).toBeInTheDocument()
  })
})

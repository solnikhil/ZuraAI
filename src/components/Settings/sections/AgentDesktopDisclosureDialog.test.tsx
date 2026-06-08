import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

import { AgentDesktopDisclosureDialog } from './AgentDesktopDisclosureDialog'

/**
 * Task 20.3 — disclosure content + gating contract for the "not a sandbox"
 * disclosure dialog.
 *
 * _Requirements: 12.1, 12.2_
 */
describe('AgentDesktopDisclosureDialog', () => {
  it('states the not-a-sandbox / shared-resource facts when open (Req 12.1)', () => {
    render(<AgentDesktopDisclosureDialog open onAcknowledge={vi.fn()} onCancel={vi.fn()} />)

    // It is explicitly framed as not a sandbox / not an isolation boundary.
    expect(screen.getByText(/not a sandbox/i)).toBeInTheDocument()
    expect(screen.getByText(/not an isolation boundary/i)).toBeInTheDocument()

    // Every shared resource the requirement names must be disclosed.
    expect(screen.getByText('Filesystem')).toBeInTheDocument()
    expect(screen.getByText('Registry')).toBeInTheDocument()
    expect(screen.getByText('Clipboard')).toBeInTheDocument()
    expect(screen.getByText('Network')).toBeInTheDocument()
    expect(screen.getByText('Input session')).toBeInTheDocument()
  })

  it('fires onAcknowledge exactly once and never onCancel when acknowledged (Req 12.2)', () => {
    const onAcknowledge = vi.fn()
    const onCancel = vi.fn()
    render(<AgentDesktopDisclosureDialog open onAcknowledge={onAcknowledge} onCancel={onCancel} />)

    fireEvent.click(
      screen.getByRole('button', { name: /i understand, enable separate desktop control/i })
    )

    expect(onAcknowledge).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('fires onCancel exactly once and never onAcknowledge when declined (Req 12.2)', () => {
    const onAcknowledge = vi.fn()
    const onCancel = vi.fn()
    render(<AgentDesktopDisclosureDialog open onAcknowledge={onAcknowledge} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onAcknowledge).not.toHaveBeenCalled()
  })

  it('renders no disclosure content (and cannot acknowledge) while closed', () => {
    render(<AgentDesktopDisclosureDialog open={false} onAcknowledge={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.queryByText(/not a sandbox/i)).toBeNull()
    expect(
      screen.queryByRole('button', { name: /i understand, enable separate desktop control/i })
    ).toBeNull()
  })
})

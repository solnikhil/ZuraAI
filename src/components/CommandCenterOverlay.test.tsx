import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CommandCenterOverlay from './CommandCenterOverlay'

describe('CommandCenterOverlay', () => {
  beforeEach(() => {
    Object.assign(window, {
      commandCenter: {
        getContext: vi.fn(async () => ({
          success: true,
          data: { title: 'Notes', processName: 'notepad' },
        })),
        listActions: vi.fn(async () => [
          { id: 'snap-left', label: 'Snap left', kind: 'window' },
          { id: 'toggle-mute', label: 'Toggle mute', kind: 'audio' },
          { id: 'system-status', label: 'System status', kind: 'system' },
          { id: 'settings-network', label: 'Network settings', kind: 'settings', aliases: ['wifi'] },
        ]),
        executeAction: vi.fn(async () => ({
          success: true,
          data: { action: 'ok' },
        })),
        submitCommand: vi.fn(async () => ({ accepted: true })),
        hide: vi.fn(async () => true),
        onShown: vi.fn(() => vi.fn()),
      },
    })
  })

  it('dispatches quick actions from Alt+number shortcuts', async () => {
    render(<CommandCenterOverlay />)

    const input = screen.getByRole('textbox', { name: /command/i })
    await screen.findByText('Snap left')

    fireEvent.keyDown(input, { key: '2', altKey: true })

    await waitFor(() => {
      expect(window.commandCenter.executeAction).toHaveBeenCalledWith('toggle-mute')
    })
    expect(screen.getByText('Alt+1')).toBeInTheDocument()
    expect(screen.getByText('Alt+2')).toBeInTheDocument()
    expect(screen.getByText('Window')).toBeInTheDocument()
    expect(screen.getByText('Audio')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
  })

  it('filters quick actions from the command input without blocking submit', async () => {
    render(<CommandCenterOverlay />)

    const input = screen.getByRole('textbox', { name: /command/i })
    await screen.findByText('Snap left')

    fireEvent.change(input, { target: { value: 'mute' } })

    expect(screen.getByText('Toggle mute')).toBeInTheDocument()
    expect(screen.queryByText('Snap left')).not.toBeInTheDocument()

    fireEvent.keyDown(input, { key: '1', altKey: true })
    await waitFor(() => {
      expect(window.commandCenter.executeAction).toHaveBeenCalledWith('toggle-mute')
    })

    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(window.commandCenter.submitCommand).toHaveBeenCalledWith('mute')
    })

    fireEvent.change(input, { target: { value: 'wifi' } })
    expect(screen.getByText('Network settings')).toBeInTheDocument()
    expect(screen.queryByText('Toggle mute')).not.toBeInTheDocument()
  })
})

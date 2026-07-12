import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CommandCenterStore from './CommandCenterStore'
import type { ZuraExtensionSummary } from '@/extensions/types'

const extension: ZuraExtensionSummary = {
  manifest: {
    schemaVersion: 1, id: 'com.example.safe', name: 'Safe Extension', publisher: '@example', version: '1.0.0', description: 'A safe extension.', icon: 'assets/icon.svg', platforms: ['windows'], categories: ['Productivity'], commands: [{ id: 'home', title: 'Safe Home', mode: 'view', entry: 'ui/home.json', keywords: ['safe'] }], permissions: ['storage.local'], privacy: { dataLeavesDevice: false },
  },
  trust: 'reviewed', installed: false, enabled: false, updateAvailable: false, source: 'bundled', validationErrors: [],
}

describe('CommandCenterStore', () => {
  beforeEach(() => {
    Object.assign(window, {
      appInfo: { get: vi.fn(async () => ({ isPackaged: true })) },
      extensions: {
        list: vi.fn(async () => [extension]),
        prepareMutation: vi.fn(async () => ({ confirmationId: 'confirm-1', action: 'install', extension, addedPermissions: ['storage.local'], expiresAt: Date.now() + 60_000 })),
        applyMutation: vi.fn(async () => [{ ...extension, installed: true, enabled: true }]),
        setEnabled: vi.fn(), importDevelopment: vi.fn(), removeDevelopment: vi.fn(), getView: vi.fn(), executeAction: vi.fn(), executeNoView: vi.fn(), getStorage: vi.fn(), requestNetwork: vi.fn(), pickFile: vi.fn(), readFileHandle: vi.fn(), onChanged: vi.fn(() => vi.fn()),
      },
    })
  })

  it('requires a separate user confirmation before installation', async () => {
    render(<CommandCenterStore query="" onOpenExtension={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }))
    expect(window.extensions.prepareMutation).toHaveBeenCalledWith('com.example.safe', 'install')
    expect(window.extensions.applyMutation).not.toHaveBeenCalled()
    expect(await screen.findByRole('region', { name: 'Confirm extension change' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Install' }))
    await waitFor(() => expect(window.extensions.applyMutation).toHaveBeenCalledWith('confirm-1'))
  })

  it('shows publisher, trust, privacy, commands, and permissions', async () => {
    render(<CommandCenterStore query="" onOpenExtension={vi.fn()} />)
    expect(await screen.findByText('@example')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Safe Extension/i }))
    expect(screen.getByText('Data stays on this device')).toBeInTheDocument()
    expect(screen.getByText('Safe Home (view)')).toBeInTheDocument()
    expect(screen.getByText('Store extension data locally')).toBeInTheDocument()
  })

  it('requires renewed confirmation for an available update', async () => {
    const installed = { ...extension, installed: true, enabled: true, installedVersion: '0.9.0', updateAvailable: true }
    vi.mocked(window.extensions.list).mockResolvedValueOnce([installed])
    vi.mocked(window.extensions.prepareMutation).mockResolvedValueOnce({ confirmationId: 'update-1', action: 'update', extension: installed, addedPermissions: ['storage.local'], expiresAt: Date.now() + 60_000 })
    render(<CommandCenterStore query="" onOpenExtension={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Update' }))
    expect(window.extensions.prepareMutation).toHaveBeenCalledWith('com.example.safe', 'update')
    expect(await screen.findByRole('button', { name: 'Confirm Update' })).toBeInTheDocument()
  })
})

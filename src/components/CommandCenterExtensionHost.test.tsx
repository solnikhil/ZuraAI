import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CommandCenterExtensionHost from './CommandCenterExtensionHost'

const home = { id: 'home', kind: 'list' as const, title: 'Examples', sections: [{ id: 'main', items: [{ id: 'form-item', title: 'Open Form', actions: [{ id: 'open-form', title: 'Open Form', kind: 'navigate' as const, viewId: 'form' }] }] }] }
const form = { id: 'form', kind: 'form' as const, title: 'Greeting', fields: [{ id: 'greeting', type: 'text' as const, title: 'Greeting', required: true, maxLength: 120 }], actions: [{ id: 'save', title: 'Save', kind: 'storage.set' as const, key: 'greeting', valueFromField: 'greeting', nextViewId: 'saved' }] }
const saved = { id: 'saved', kind: 'detail' as const, title: 'Saved', markdown: '# Saved' }

describe('CommandCenterExtensionHost', () => {
  beforeEach(() => {
    Object.assign(window, { extensions: {
      getView: vi.fn(async (_extensionId: string, _commandId: string, viewId?: string) => viewId === 'home' || !viewId ? home : form),
      executeAction: vi.fn(async (_extensionId: string, _commandId: string, _viewId: string, actionId: string) => actionId === 'open-form' ? { ok: true, view: form } : { ok: true, view: saved, storageChanged: true }),
    } })
  })

  it('renders trusted list and form primitives and sends only bounded identifiers and values', async () => {
    render(<CommandCenterExtensionHost extensionId="com.example.safe" commandId="home" />)
    fireEvent.click(await screen.findByRole('button', { name: /Open Form/i }))
    expect(await screen.findByRole('region', { name: 'Greeting' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Greeting' }), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(window.extensions.executeAction).toHaveBeenLastCalledWith('com.example.safe', 'home', 'form', 'save', { greeting: 'Hello' }))
    expect(await screen.findByRole('heading', { name: 'Saved' })).toBeInTheDocument()
  })

  it('uses Escape to navigate back within the extension before leaving Command Center', async () => {
    render(<CommandCenterExtensionHost extensionId="com.example.safe" commandId="home" />)
    fireEvent.click(await screen.findByRole('button', { name: /Open Form/i }))
    const region = await screen.findByRole('region', { name: 'Greeting' })
    fireEvent.keyDown(region, { key: 'Escape' })
    await waitFor(() => expect(window.extensions.getView).toHaveBeenLastCalledWith('com.example.safe', 'home', 'home'))
  })
})

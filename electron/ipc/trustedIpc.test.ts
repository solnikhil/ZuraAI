import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const { fromWebContents, handle, removeHandler } = vi.hoisted(() => ({
  fromWebContents: vi.fn(),
  handle: vi.fn(),
  removeHandler: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents },
  ipcMain: { handle, removeHandler },
}))

import { isTrustedIpcSender, trustedIpcMain } from './trustedIpc'

function createEvent(url: string, options: { subframe?: boolean; destroyed?: boolean } = {}) {
  const mainFrame = { url }
  const sender = {
    mainFrame,
    isDestroyed: () => options.destroyed === true,
  }
  const senderFrame = options.subframe ? { url } : mainFrame
  const window = { isDestroyed: () => false }
  fromWebContents.mockReturnValue(window)

  return {
    event: { sender, senderFrame } as unknown as Electron.IpcMainInvokeEvent,
    sender: sender as unknown as Electron.WebContents,
    window: window as unknown as Electron.BrowserWindow,
  }
}

describe('trusted IPC sender validation', () => {
  it('accepts only the exact development origin', () => {
    const allowed = createEvent('http://localhost:5173/#/dashboard')
    expect(
      isTrustedIpcSender(allowed.event, {
        devServerUrl: 'http://localhost:5173',
        resolveWindow: () => allowed.window,
      })
    ).toBe(true)

    const lookalike = createEvent('http://localhost:5173@evil.example/#/dashboard')
    expect(
      isTrustedIpcSender(lookalike.event, {
        devServerUrl: 'http://localhost:5173',
        resolveWindow: () => lookalike.window,
      })
    ).toBe(false)
  })

  it('accepts only the exact packaged renderer entry file', () => {
    const rendererEntryPath = path.resolve('dist/index.html')
    const allowed = createEvent(`${pathToFileURL(rendererEntryPath).href}#/dashboard`)
    expect(
      isTrustedIpcSender(allowed.event, {
        rendererEntryPath,
        resolveWindow: () => allowed.window,
      })
    ).toBe(true)

    const otherFile = createEvent(pathToFileURL(path.resolve('dist/other.html')).href)
    expect(
      isTrustedIpcSender(otherFile.event, {
        rendererEntryPath,
        resolveWindow: () => otherFile.window,
      })
    ).toBe(false)
  })

  it('rejects subframes, destroyed senders, and unknown windows', () => {
    const rendererEntryPath = path.resolve('dist/index.html')
    const url = pathToFileURL(rendererEntryPath).href
    const subframe = createEvent(url, { subframe: true })
    const destroyed = createEvent(url, { destroyed: true })
    const unknown = createEvent(url)

    expect(
      isTrustedIpcSender(subframe.event, {
        rendererEntryPath,
        resolveWindow: () => subframe.window,
      })
    ).toBe(false)
    expect(
      isTrustedIpcSender(destroyed.event, {
        rendererEntryPath,
        resolveWindow: () => destroyed.window,
      })
    ).toBe(false)
    expect(
      isTrustedIpcSender(unknown.event, { rendererEntryPath, resolveWindow: () => null })
    ).toBe(false)
  })

  it('guards registered handlers before invoking application code', async () => {
    handle.mockClear()
    const listener = vi.fn(() => 'ok')
    trustedIpcMain.handle('test:trusted', listener)
    const wrapped = handle.mock.calls[0]?.[1]
    const untrusted = createEvent('https://evil.example')

    expect(() => wrapped(untrusted.event, 'payload')).toThrow(
      'Blocked IPC request from an untrusted renderer.'
    )
    expect(listener).not.toHaveBeenCalled()
  })
})

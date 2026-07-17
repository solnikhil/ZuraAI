import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>()
  const webHandlers = new Map<string, (...args: unknown[]) => void>()
  const window = {
    isDestroyed: vi.fn(() => false),
    setBounds: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    showInactive: vi.fn(),
    moveAbove: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
    removeMenu: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    on: vi.fn((name: string, handler: (...args: unknown[]) => void) => handlers.set(name, handler)),
    webContents: {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn((name: string, handler: (...args: unknown[]) => void) =>
        webHandlers.set(name, handler)
      ),
    },
  }
  const BrowserWindow = vi.fn(function BrowserWindowMock() {
    return window
  })
  return { handlers, webHandlers, window, BrowserWindow }
})

vi.mock('electron', () => ({ BrowserWindow: mocks.BrowserWindow }))

import { TargetGuardOverlay } from './guardOverlay'
import type { BackgroundWindowSnapshot } from './types'

const snapshot: BackgroundWindowSnapshot = {
  hwnd: 42,
  processId: 100,
  processStartTimeMs: 123_000,
  title: '<Notepad>',
  bounds: { x: 10, y: 20, width: 800, height: 600 },
  visible: true,
  minimized: false,
}

describe('TargetGuardOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.webHandlers.clear()
    mocks.window.isDestroyed.mockReturnValue(false)
    mocks.window.loadURL.mockResolvedValue(undefined)
  })

  it('creates an input-intercepting sandbox window without global always-on-top', () => {
    const overlay = new TargetGuardOverlay()
    expect(overlay.show(snapshot, { onAction: vi.fn(), onPlacementFailed: vi.fn() })).toBe(true)
    expect(mocks.BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        frame: false,
        transparent: true,
        focusable: false,
        skipTaskbar: true,
        webPreferences: expect.objectContaining({
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          devTools: false,
        }),
      })
    )
    expect(mocks.BrowserWindow.mock.calls[0]?.[0]).not.toHaveProperty('alwaysOnTop')
    expect(mocks.window.setIgnoreMouseEvents).toHaveBeenCalledWith(false)
    expect(mocks.window.moveAbove).toHaveBeenCalledWith('window:42:0')
  })

  it('embeds only escaped target text and accepts only its unguessable action URL', async () => {
    const onAction = vi.fn()
    const overlay = new TargetGuardOverlay()
    overlay.show(snapshot, { onAction, onPlacementFailed: vi.fn() })
    const loaded = String(mocks.window.loadURL.mock.calls[0]?.[0])
    const html = decodeURIComponent(loaded.slice(loaded.indexOf(',') + 1))
    expect(html).toContain('&lt;Notepad&gt;')
    expect(html).not.toContain('<Notepad>')
    const actionUrl = html.match(/href="(zura-window-guard:\/\/continue\?token=[^"]+)"/)?.[1]
    expect(actionUrl).toBeTruthy()
    const event = { preventDefault: vi.fn() }
    mocks.webHandlers.get('will-navigate')?.(event, 'https://attacker.invalid')
    expect(event.preventDefault).toHaveBeenCalled()
    expect(onAction).not.toHaveBeenCalled()
    mocks.webHandlers.get('will-navigate')?.(event, actionUrl)
    expect(onAction).toHaveBeenCalledWith('continue')
  })

  it('hides and reports failure rather than becoming a free-floating overlay', () => {
    mocks.window.moveAbove.mockImplementationOnce(() => {
      throw new Error('unsupported')
    })
    const onPlacementFailed = vi.fn()
    const overlay = new TargetGuardOverlay()
    expect(overlay.show(snapshot, { onAction: vi.fn(), onPlacementFailed })).toBe(false)
    expect(mocks.window.hide).toHaveBeenCalled()
    expect(onPlacementFailed).toHaveBeenCalledOnce()
  })
})

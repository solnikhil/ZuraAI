// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const systemHandlerMocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const inspectElement = vi.fn()
  const send = vi.fn()
  const popup = vi.fn()
  const showMessageBox = vi.fn()
  const buildFromTemplate = vi.fn((template: unknown[]) => ({
    popup: (options: unknown) => {
      popup(options)
      return template
    },
  }))
  const fromWebContents = vi.fn(() => ({
    isDestroyed: () => false,
    webContents: {
      send,
      inspectElement,
    },
  }))

  return {
    handlers,
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel)
    }),
    clipboardReadText: vi.fn(() => 'clipboard-text'),
    clipboardWriteText: vi.fn(),
    shellOpenExternal: vi.fn(),
    showMessageBox,
    popup,
    buildFromTemplate,
    fromWebContents,
    send,
    inspectElement,
  }
})

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
  ipcMain: {
    handle: systemHandlerMocks.handle,
    removeHandler: systemHandlerMocks.removeHandler,
  },
  BrowserWindow: {
    fromWebContents: systemHandlerMocks.fromWebContents,
  },
  Menu: {
    buildFromTemplate: systemHandlerMocks.buildFromTemplate,
  },
  clipboard: {
    readText: systemHandlerMocks.clipboardReadText,
    writeText: systemHandlerMocks.clipboardWriteText,
  },
  shell: {
    openExternal: systemHandlerMocks.shellOpenExternal,
  },
  dialog: {
    showMessageBox: systemHandlerMocks.showMessageBox,
  },
}))

vi.mock('../runtimeInfo', () => ({
  getAppRuntimeInfo: vi.fn(() => ({ appName: 'ZuraAI' })),
}))

vi.mock('../windows', () => ({
  showAboutWindow: vi.fn(),
}))

describe('registerSystemHandlers context menu', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.resetModules()
    systemHandlerMocks.handlers.clear()
    systemHandlerMocks.handle.mockClear()
    systemHandlerMocks.removeHandler.mockClear()
    systemHandlerMocks.clipboardReadText.mockClear()
    systemHandlerMocks.clipboardWriteText.mockClear()
    systemHandlerMocks.shellOpenExternal.mockClear()
    systemHandlerMocks.showMessageBox.mockReset()
    systemHandlerMocks.popup.mockClear()
    systemHandlerMocks.buildFromTemplate.mockClear()
    systemHandlerMocks.fromWebContents.mockClear()
    systemHandlerMocks.send.mockClear()
    systemHandlerMocks.inspectElement.mockClear()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('ignores invalid native context-menu payloads', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    const { registerSystemHandlers } = await import('./systemHandlers')
    registerSystemHandlers()

    const handler = systemHandlerMocks.handlers.get('context-menu:show')
    await handler?.({ sender: {} }, { hasSelection: 'yes' })

    expect(systemHandlerMocks.buildFromTemplate).not.toHaveBeenCalled()
  })

  it('builds a native macOS context menu and routes actions narrowly', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    const { registerSystemHandlers } = await import('./systemHandlers')
    registerSystemHandlers()

    const handler = systemHandlerMocks.handlers.get('context-menu:show')
    expect(handler).toBeTypeOf('function')

    await handler?.(
      { sender: {} },
      {
        hasSelection: true,
        isEditable: true,
        isContentEditable: false,
        hasLink: true,
        linkUrl: 'https://example.com/docs',
        mouseX: 12.4,
        mouseY: 24.6,
        isDev: true,
      }
    )

    const template = systemHandlerMocks.buildFromTemplate.mock.calls[0]?.[0] as Array<{
      label?: string
      click?: () => void
    }>

    expect(template.map((item) => item.label).filter(Boolean)).toEqual([
      'Open Link in Browser',
      'Copy Link Address',
      'Undo',
      'Redo',
      'Cut',
      'Copy',
      'Paste',
      'Select All',
      'Inspect Element',
    ])
    expect(systemHandlerMocks.popup).toHaveBeenCalledTimes(1)

    template.find((item) => item.label === 'Open Link in Browser')?.click?.()
    expect(systemHandlerMocks.shellOpenExternal).toHaveBeenCalledWith('https://example.com/docs')

    template.find((item) => item.label === 'Copy Link Address')?.click?.()
    expect(systemHandlerMocks.clipboardWriteText).toHaveBeenCalledWith('https://example.com/docs')

    template.find((item) => item.label === 'Copy')?.click?.()
    expect(systemHandlerMocks.send).toHaveBeenCalledWith('context-menu:action', 'copy')

    template.find((item) => item.label === 'Inspect Element')?.click?.()
    expect(systemHandlerMocks.inspectElement).toHaveBeenCalledWith(12, 25)
  })

  it('shows a native macOS delete confirmation and returns the user choice', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    systemHandlerMocks.showMessageBox.mockResolvedValueOnce({ response: 0 })

    const { registerSystemHandlers } = await import('./systemHandlers')
    registerSystemHandlers()

    const handler = systemHandlerMocks.handlers.get('native-dialog:confirm-delete-chat')
    await expect(handler?.({ sender: {} })).resolves.toBe(true)

    expect(systemHandlerMocks.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ isDestroyed: expect.any(Function) }),
      expect.objectContaining({
        type: 'none',
        buttons: ['Delete', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        destructiveId: 0,
        message: 'Delete chat?',
      })
    )
  })

  it('does not show native delete confirmation off macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })

    const { registerSystemHandlers } = await import('./systemHandlers')
    registerSystemHandlers()

    const handler = systemHandlerMocks.handlers.get('native-dialog:confirm-delete-chat')
    await expect(handler?.({ sender: {} })).resolves.toBe(false)
    expect(systemHandlerMocks.showMessageBox).not.toHaveBeenCalled()
  })
})

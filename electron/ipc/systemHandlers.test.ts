// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const systemHandlerMocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const inspectElement = vi.fn()
  const send = vi.fn()
  const reload = vi.fn()
  const toggleDevTools = vi.fn()
  const setZoomLevel = vi.fn()
  const getZoomLevel = vi.fn(() => 1)
  const minimize = vi.fn()
  const maximize = vi.fn()
  const unmaximize = vi.fn()
  const close = vi.fn()
  const setFullScreen = vi.fn()
  const isFullScreen = vi.fn(() => false)
  const isMaximized = vi.fn(() => false)
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
    isMaximized,
    isFullScreen,
    minimize,
    maximize,
    unmaximize,
    close,
    setFullScreen,
    on: vi.fn(),
    webContents: {
      send,
      inspectElement,
    },
  }))
  let isPackaged = false

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
    reload,
    toggleDevTools,
    setZoomLevel,
    getZoomLevel,
    minimize,
    maximize,
    unmaximize,
    close,
    setFullScreen,
    isFullScreen,
    isMaximized,
    inspectElement,
    get isPackaged() {
      return isPackaged
    },
    setIsPackaged(value: boolean) {
      isPackaged = value
    },
  }
})

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return systemHandlerMocks.isPackaged
    },
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
    systemHandlerMocks.reload.mockClear()
    systemHandlerMocks.toggleDevTools.mockClear()
    systemHandlerMocks.setZoomLevel.mockClear()
    systemHandlerMocks.getZoomLevel.mockClear()
    systemHandlerMocks.minimize.mockClear()
    systemHandlerMocks.maximize.mockClear()
    systemHandlerMocks.unmaximize.mockClear()
    systemHandlerMocks.close.mockClear()
    systemHandlerMocks.setFullScreen.mockClear()
    systemHandlerMocks.isFullScreen.mockReset()
    systemHandlerMocks.isFullScreen.mockReturnValue(false)
    systemHandlerMocks.isMaximized.mockReset()
    systemHandlerMocks.isMaximized.mockReturnValue(false)
    systemHandlerMocks.setIsPackaged(false)
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

  it('rejects unknown app-menu commands', async () => {
    const { registerSystemHandlers } = await import('./systemHandlers')
    registerSystemHandlers()

    const handler = systemHandlerMocks.handlers.get('app-menu:command')
    await expect(handler?.({ sender: createSender() }, 'not-a-command')).resolves.toBe(false)

    expect(systemHandlerMocks.send).not.toHaveBeenCalled()
    expect(systemHandlerMocks.reload).not.toHaveBeenCalled()
  })

  it('executes only fixed app-menu commands', async () => {
    const { registerSystemHandlers } = await import('./systemHandlers')
    registerSystemHandlers()

    const handler = systemHandlerMocks.handlers.get('app-menu:command')
    const sender = createSender()

    await expect(handler?.({ sender }, 'new-chat')).resolves.toBe(true)
    expect(sender.send).toHaveBeenCalledWith('app:new-chat')

    await expect(handler?.({ sender }, 'open-settings')).resolves.toBe(true)
    expect(sender.send).toHaveBeenCalledWith('settings:navigate', 'providers')

    await expect(handler?.({ sender }, 'reload')).resolves.toBe(true)
    expect(systemHandlerMocks.reload).toHaveBeenCalledTimes(1)

    await expect(handler?.({ sender }, 'zoom-in')).resolves.toBe(true)
    expect(systemHandlerMocks.setZoomLevel).toHaveBeenCalledWith(1.5)

    await expect(handler?.({ sender }, 'toggle-maximize')).resolves.toBe(true)
    expect(systemHandlerMocks.maximize).toHaveBeenCalledTimes(1)

    await expect(handler?.({ sender }, 'open-help')).resolves.toBe(true)
    expect(systemHandlerMocks.shellOpenExternal).toHaveBeenCalledWith(
      'https://github.com/solnikhil/ZuraAI'
    )
  })

  it('disables app-menu DevTools command in packaged builds', async () => {
    systemHandlerMocks.setIsPackaged(true)
    const { registerSystemHandlers } = await import('./systemHandlers')
    registerSystemHandlers()

    const handler = systemHandlerMocks.handlers.get('app-menu:command')
    await expect(handler?.({ sender: createSender() }, 'toggle-devtools')).resolves.toBe(false)

    expect(systemHandlerMocks.toggleDevTools).not.toHaveBeenCalled()
  })
})

function createSender() {
  return {
    send: systemHandlerMocks.send,
    inspectElement: systemHandlerMocks.inspectElement,
    reload: systemHandlerMocks.reload,
    toggleDevTools: systemHandlerMocks.toggleDevTools,
    setZoomLevel: systemHandlerMocks.setZoomLevel,
    getZoomLevel: systemHandlerMocks.getZoomLevel,
  }
}

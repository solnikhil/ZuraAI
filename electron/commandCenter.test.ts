import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('Command Center main service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function loadService() {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const sentEvents: Array<{ channel: string; payload: unknown }> = []
    const register = vi.fn(() => true)
    const unregister = vi.fn()
    const showCommandCenterWindow = vi.fn()
    const hideCommandCenterWindow = vi.fn()
    const toggleCommandCenterWindow = vi.fn()
    const executeWindowSnap = vi.fn(async () => ({ success: true, data: { action: 'snap' } }))
    const executeSystemVolumeSet = vi.fn(async () => ({ success: true, data: { level: 60 } }))
    const executeSystemOpenPath = vi.fn(async () => ({ success: true, data: { opened: true } }))

    const webContents = {
      isLoading: vi.fn(() => false),
      once: vi.fn(),
      send: vi.fn((channel: string, payload: unknown) => {
        sentEvents.push({ channel, payload })
      }),
    }
    const mainWindow = {
      webContents,
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      isDestroyed: vi.fn(() => false),
    }

    vi.doMock('electron', () => ({
      globalShortcut: {
        register,
        unregister,
      },
      ipcMain: {
        handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
          handlers.set(channel, handler)
        }),
        removeHandler: vi.fn(),
      },
    }))

    vi.doMock('./windows', () => ({
      createMainWindow: vi.fn(() => mainWindow),
      getMainWindow: vi.fn(() => mainWindow),
      hideCommandCenterWindow,
      showCommandCenterWindow,
      toggleCommandCenterWindow,
    }))

    vi.doMock('./tools/os-integration', () => ({
      executeSystemActiveWindow: vi.fn(async () => ({
        success: true,
        data: { title: 'Demo', processName: 'notepad' },
      })),
      executeWindowSnap,
      executeSystemVolumeSet,
      executeSystemOpenPath,
    }))

    const service = await import('./commandCenter')
    return {
      service,
      handlers,
      register,
      unregister,
      showCommandCenterWindow,
      hideCommandCenterWindow,
      toggleCommandCenterWindow,
      mainWindow,
      sentEvents,
      executeWindowSnap,
      executeSystemVolumeSet,
      executeSystemOpenPath,
    }
  }

  it('registers and unregisters the global shortcut with extension state', async () => {
    const { service, register, unregister, hideCommandCenterWindow } = await loadService()

    expect(service.setCommandCenterExtensionEnabled(true)).toEqual({
      enabled: true,
      shortcut: 'CommandOrControl+Shift+Space',
      shortcutRegistered: true,
    })
    expect(register).toHaveBeenCalledWith('CommandOrControl+Shift+Space', expect.any(Function))

    service.setCommandCenterExtensionEnabled(false)
    expect(unregister).toHaveBeenCalledWith('CommandOrControl+Shift+Space')
    expect(hideCommandCenterWindow).toHaveBeenCalledTimes(1)
  })

  it('routes submitted overlay commands into the main window', async () => {
    const { service, handlers, sentEvents, hideCommandCenterWindow, mainWindow } = await loadService()
    service.registerCommandCenterHandlers()
    service.setCommandCenterExtensionEnabled(true)

    const submit = handlers.get('command-center:submit-command')
    expect(submit).toBeDefined()

    const result = await submit?.({}, ' summarize this window ')

    expect(result).toEqual({ accepted: true })
    expect(sentEvents[0]).toMatchObject({
      channel: 'command-center:command',
      payload: {
        text: 'summarize this window',
        activeWindow: { title: 'Demo', processName: 'notepad' },
      },
    })
    expect(mainWindow.show).toHaveBeenCalledTimes(1)
    expect(mainWindow.focus).toHaveBeenCalledTimes(1)
    expect(hideCommandCenterWindow).toHaveBeenCalledTimes(1)
  })

  it('executes only allowlisted direct OS actions', async () => {
    const { service, handlers, executeWindowSnap, executeSystemVolumeSet } = await loadService()
    service.registerCommandCenterHandlers()
    service.setCommandCenterExtensionEnabled(true)

    const list = handlers.get('command-center:list-actions')
    const execute = handlers.get('command-center:execute-action')

    expect(await list?.()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'snap-left', label: 'Snap left' }),
        expect.objectContaining({ id: 'volume-60', label: 'Volume 60%' }),
      ])
    )

    await expect(execute?.({}, 'snap-left')).resolves.toEqual({ success: true, data: { action: 'snap' } })
    await expect(execute?.({}, 'volume-60')).resolves.toEqual({ success: true, data: { level: 60 } })
    await expect(execute?.({}, 'format-drive')).resolves.toEqual({
      success: false,
      error: 'Command Center action is not allowed.',
    })

    expect(executeWindowSnap).toHaveBeenCalledWith({ preset: 'left', autoApprove: true })
    expect(executeSystemVolumeSet).toHaveBeenCalledWith({ level: 60, autoApprove: true })
  })
})

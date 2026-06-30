import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('Command Center main service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function loadService(overrides: {
    executeAppList?: ReturnType<typeof vi.fn>
    executeAppFind?: ReturnType<typeof vi.fn>
  } = {}) {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const sentEvents: Array<{ channel: string; payload: unknown }> = []
    const register = vi.fn(() => true)
    const unregister = vi.fn()
    const readText = vi.fn(() => 'clipboard sample')
    const preloadCommandCenterWindow = vi.fn()
    const showCommandCenterWindow = vi.fn()
    const hideCommandCenterWindow = vi.fn()
    const setCommandCenterWindowLayout = vi.fn()
    const toggleCommandCenterWindow = vi.fn()
    const executeWindowSnap = vi.fn(async () => ({ success: true, data: { action: 'snap' } }))
    const executeSystemVolumeSet = vi.fn(async () => ({ success: true, data: { level: 60 } }))
    const executeSystemVolumeGet = vi.fn(async () => ({ success: true, data: { level: 60, muted: false } }))
    const executeSystemMuteSet = vi.fn(async () => ({ success: true, data: { muted: true } }))
    const executeSystemOpenPath = vi.fn(async () => ({ success: true, data: { opened: true } }))
    const executeSystemSettingsOpen = vi.fn(async (args: Record<string, unknown>) => ({
      success: true,
      data: { page: args.page },
    }))
    const executeSystemStatus = vi.fn(async () => ({ success: true, data: { disks: [] } }))
    const executeSystemThemeGet = vi.fn(async () => ({ success: true, data: { appTheme: 'dark' } }))
    const executeSystemThemeSet = vi.fn(async () => ({ success: true, data: { appTheme: 'light' } }))
    const executeAppList = overrides.executeAppList ?? vi.fn(async () => ({
      success: true,
      data: {
        apps: [
          { name: 'Chrome', shortcutPath: 'C:\\Chrome.lnk', path: 'C:\\Chrome.lnk', source: 'start-menu', iconKey: 'chrome-icon', rank: 10 },
          {
            name: 'Kiro',
            shortcutPath: 'C:\\Users\\Nikhil\\Desktop\\Kiro.lnk',
            path: 'C:\\Users\\Nikhil\\Desktop\\Kiro.lnk',
            source: 'desktop',
            targetPath: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Kiro\\Kiro.exe',
            iconKey: 'kiro-icon',
          },
          {
            name: 'Native App',
            source: 'windows-search',
            appUserModelId: 'Native.App',
            iconKey: 'native-icon',
          },
        ],
      },
    }))
    const executeAppFind = overrides.executeAppFind ?? vi.fn(async (args: { query?: string }) => ({
      success: true,
      data: {
        query: args.query,
        matches: args.query === 'kiro'
          ? [
              {
                name: 'Kiro',
                source: 'windows-search',
                appUserModelId: 'Kiro',
                iconKey: 'kiro-icon',
              },
            ]
          : [],
      },
    }))
    const executeAppLaunch = vi.fn(async () => ({ success: true, data: { launched: true } }))
    const executeWindowList = vi.fn(async () => ({
      success: true,
      data: {
        windows: [
          { hwnd: 55, title: 'Chrome - Docs', processName: 'chrome', processId: 10 },
          { hwnd: 77, title: '#general | kirodotdev - Discord', processName: 'Discord', processId: 11 },
        ],
      },
    }))
    const executeWindowFocus = vi.fn(async () => ({ success: true, data: { focused: true } }))
    const listCommandCenterWorkflows = vi.fn(async () => [
      {
        id: 'morning',
        name: 'Morning startup',
        aliases: ['start'],
        steps: [{ type: 'app', appPath: 'C:\\Chrome.lnk' }],
        createdAt: 1,
        updatedAt: 2,
      },
    ])
    const saveCommandCenterWorkflow = vi.fn(async (workflow) => workflow)
    const deleteCommandCenterWorkflow = vi.fn(async () => true)
    const markCommandCenterWorkflowRun = vi.fn(async () => undefined)

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
      app: {
        getFileIcon: vi.fn(async () => ({
          isEmpty: () => false,
          toDataURL: () => 'data:image/png;base64,icon',
        })),
      },
      globalShortcut: {
        register,
        unregister,
      },
      clipboard: {
        readText,
      },
      ipcMain: {
        handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
          handlers.set(channel, handler)
        }),
        removeHandler: vi.fn(),
      },
    }))

    vi.doMock('./chatStore', () => ({
      getSessionMetadataAsync: vi.fn(async () => [
        {
          id: 'chat-1',
          title: 'Demo chat',
          createdAt: 1,
          updatedAt: 2,
          pinned: false,
          folderId: null,
          tags: [],
          messageCount: 2,
        },
      ]),
    }))

    vi.doMock('./commandCenterWorkflows', () => ({
      listCommandCenterWorkflows,
      saveCommandCenterWorkflow,
      deleteCommandCenterWorkflow,
      markCommandCenterWorkflowRun,
    }))

    vi.doMock('./windows', () => ({
      createMainWindow: vi.fn(() => mainWindow),
      getMainWindow: vi.fn(() => mainWindow),
      preloadCommandCenterWindow,
      hideCommandCenterWindow,
      setCommandCenterWindowLayout,
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
      executeSystemVolumeGet,
      executeSystemMuteSet,
      executeSystemOpenPath,
      executeSystemSettingsOpen,
      executeSystemStatus,
      executeSystemThemeGet,
      executeSystemThemeSet,
    }))

    vi.doMock('./tools/app-management', () => ({
      executeAppFind,
      executeAppList,
      executeAppLaunch,
    }))

    vi.doMock('./appIndexService', () => ({
      getCachedAppIcon: vi.fn((iconKey?: string) => iconKey ? 'data:image/png;base64,icon' : undefined),
      refreshAppIndex: vi.fn(async () => ({ ok: true, stale: false, sourceCounts: {} })),
      resolveAppIndexEntry: vi.fn(async (itemId: string) => {
        if (itemId === 'app:TmF0aXZlLkFwcA') {
          return { id: itemId, name: 'Native App', appUserModelId: 'Native.App', launchStrategy: 'appUserModelId' }
        }
        if (itemId === 'app:QzpcQ2hyb21lLmxuaw') {
          return { id: itemId, name: 'Chrome', shortcutPath: 'C:\\Chrome.lnk', launchStrategy: 'shortcutPath' }
        }
        if (itemId) {
          return { id: itemId, name: 'Kiro', appUserModelId: 'Kiro', launchStrategy: 'appUserModelId' }
        }
        return undefined
      }),
      warmAppIndex: vi.fn(),
    }))

    vi.doMock('./tools/window-management', () => ({
      executeWindowList,
      executeWindowFocus,
    }))

    const service = await import('./commandCenter')
    return {
      service,
      handlers,
      register,
      unregister,
      preloadCommandCenterWindow,
      showCommandCenterWindow,
      hideCommandCenterWindow,
      setCommandCenterWindowLayout,
      toggleCommandCenterWindow,
      mainWindow,
      sentEvents,
      readText,
      executeWindowSnap,
      executeSystemVolumeSet,
      executeSystemVolumeGet,
      executeSystemMuteSet,
      executeSystemOpenPath,
      executeSystemSettingsOpen,
      executeSystemStatus,
      executeSystemThemeGet,
      executeSystemThemeSet,
      executeAppList,
      executeAppFind,
      executeAppLaunch,
      executeWindowList,
      executeWindowFocus,
      listCommandCenterWorkflows,
      markCommandCenterWorkflowRun,
    }
  }

  it('registers and unregisters the global shortcut with extension state', async () => {
    const { service, register, unregister, hideCommandCenterWindow, preloadCommandCenterWindow } = await loadService()

    expect(service.setCommandCenterExtensionEnabled(true)).toEqual({
      enabled: true,
      shortcut: 'CommandOrControl+Shift+Space',
      shortcutRegistered: true,
    })
    expect(register).toHaveBeenCalledWith('CommandOrControl+Shift+Space', expect.any(Function))
    expect(preloadCommandCenterWindow).toHaveBeenCalledTimes(1)

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
    const {
      service,
      handlers,
      sentEvents,
      mainWindow,
      executeWindowSnap,
      executeSystemVolumeSet,
      executeSystemVolumeGet,
      executeSystemMuteSet,
      executeSystemThemeGet,
      executeSystemThemeSet,
      readText,
      executeSystemSettingsOpen,
    } = await loadService()
    service.registerCommandCenterHandlers()
    service.setCommandCenterExtensionEnabled(true)

    const list = handlers.get('command-center:list-actions')
    const execute = handlers.get('command-center:execute-action')

    expect(await list?.()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'snap-left', label: 'Snap left' }),
        expect.objectContaining({ id: 'volume-60', label: 'Volume 60%' }),
        expect.objectContaining({ id: 'toggle-mute', label: 'Toggle mute' }),
        expect.objectContaining({ id: 'system-status', label: 'System status' }),
        expect.objectContaining({ id: 'toggle-theme', label: 'Toggle theme' }),
        expect.objectContaining({ id: 'clipboard-to-chat', label: 'Ask about clipboard' }),
        expect.objectContaining({ id: 'focus-zuraai', label: 'Focus ZuraAI' }),
        expect.objectContaining({ id: 'settings-display', label: 'Display settings' }),
        expect.objectContaining({ id: 'settings-sound', label: 'Sound settings' }),
        expect.objectContaining({ id: 'settings-network', label: 'Network settings' }),
        expect.objectContaining({ id: 'settings-bluetooth', label: 'Bluetooth settings' }),
      ])
    )

    await expect(execute?.({}, 'snap-left')).resolves.toEqual({ success: true, data: { action: 'snap' } })
    await expect(execute?.({}, 'volume-60')).resolves.toEqual({ success: true, data: { level: 60 } })
    await expect(execute?.({}, 'toggle-mute')).resolves.toEqual({ success: true, data: { muted: true } })
    await expect(execute?.({}, 'system-status')).resolves.toEqual({ success: true, data: { disks: [] } })
    await expect(execute?.({}, 'toggle-theme')).resolves.toEqual({ success: true, data: { appTheme: 'light' } })
    await expect(execute?.({}, 'clipboard-to-chat')).resolves.toEqual({
      success: true,
      data: { queued: true, characterCount: 16 },
    })
    await expect(execute?.({}, 'focus-zuraai')).resolves.toEqual({ success: true, data: { focused: true } })
    await expect(execute?.({}, 'settings-display')).resolves.toEqual({ success: true, data: { page: 'display' } })
    await expect(execute?.({}, 'settings-network')).resolves.toEqual({ success: true, data: { page: 'network' } })
    await expect(execute?.({}, 'format-drive')).resolves.toEqual({
      success: false,
      error: 'Command Center action is not allowed.',
    })

    expect(executeWindowSnap).toHaveBeenCalledWith({ preset: 'left', autoApprove: true })
    expect(executeSystemVolumeSet).toHaveBeenCalledWith({ level: 60, autoApprove: true })
    expect(executeSystemVolumeGet).toHaveBeenCalledTimes(1)
    expect(executeSystemMuteSet).toHaveBeenCalledWith({ muted: true, autoApprove: true })
    expect(executeSystemThemeGet).toHaveBeenCalledTimes(1)
    expect(executeSystemThemeSet).toHaveBeenCalledWith({ theme: 'light', autoApprove: true })
    expect(readText).toHaveBeenCalledTimes(1)
    expect(mainWindow.show).toHaveBeenCalled()
    expect(mainWindow.focus).toHaveBeenCalled()
    expect(executeSystemSettingsOpen).toHaveBeenCalledWith({ page: 'display', autoApprove: true })
    expect(executeSystemSettingsOpen).toHaveBeenCalledWith({ page: 'network', autoApprove: true })
    expect(sentEvents.some((event) => (
      event.channel === 'command-center:command' &&
      typeof (event.payload as { text?: unknown }).text === 'string' &&
      ((event.payload as { text: string }).text.includes('clipboard sample'))
    ))).toBe(true)
  })

  it('builds a searchable index and focuses an existing app window by default', async () => {
    const { service, handlers, executeWindowFocus, executeAppLaunch } = await loadService()
    service.registerCommandCenterHandlers()
    service.setCommandCenterExtensionEnabled(true)

    const getIndex = handlers.get('command-center:get-index')
    const executeItem = handlers.get('command-center:execute-index-item')
    const index = await getIndex?.()

    expect(index).toMatchObject({
      workflows: expect.arrayContaining([expect.objectContaining({ title: 'Morning startup' })]),
      apps: expect.arrayContaining([
        expect.objectContaining({ title: 'Chrome', hint: 'Application' }),
      ]),
      windows: expect.arrayContaining([expect.objectContaining({ hwnd: 55 })]),
      chats: expect.arrayContaining([expect.objectContaining({ sessionId: 'chat-1' })]),
    })
    expect((index as { apps: Array<{ title: string; existingWindow?: unknown }> }).apps).toContainEqual(
      expect.objectContaining({ title: 'Kiro', existingWindow: undefined })
    )
    expect((index as { apps: Array<{ title: string; appUserModelId?: string }> }).apps).toContainEqual(
      expect.objectContaining({ title: 'Native App', appUserModelId: 'Native.App' })
    )

    await expect(executeItem?.({}, 'app:QzpcQ2hyb21lLmxuaw')).resolves.toEqual({
      success: true,
      data: { focused: true },
    })
    expect(executeWindowFocus).toHaveBeenCalledWith({ hwnd: 55, autoApprove: true })
    expect(executeAppLaunch).not.toHaveBeenCalled()

    await expect(executeItem?.({}, 'app:TmF0aXZlLkFwcA')).resolves.toEqual({
      success: true,
      data: { launched: true },
    })
    expect(executeAppLaunch).toHaveBeenCalledWith({
      nameOrPath: undefined,
      appUserModelId: 'Native.App',
      itemId: 'app:TmF0aXZlLkFwcA',
      autoApprove: true,
    })
  })

  it('uses the current cached app icon data when building app rows', async () => {
    const { service, handlers } = await loadService()
    service.registerCommandCenterHandlers()
    service.setCommandCenterExtensionEnabled(true)

    const getIndex = handlers.get('command-center:get-index')
    const index = await getIndex?.() as { apps: Array<{ title: string; iconDataUrl?: string }> }

    expect(index.apps).toContainEqual(expect.objectContaining({
      title: 'Chrome',
      iconDataUrl: 'data:image/png;base64,icon',
    }))
  })

  it('uses the typed query when indexing and executing native app matches', async () => {
    const { service, handlers, executeAppFind, executeAppLaunch } = await loadService()
    service.registerCommandCenterHandlers()
    service.setCommandCenterExtensionEnabled(true)

    const getIndex = handlers.get('command-center:get-index')
    const executeItem = handlers.get('command-center:execute-index-item')
    const index = await getIndex?.({}, 'kiro') as { apps: Array<{ id: string; title: string }> }

    expect(executeAppFind).toHaveBeenCalledWith({ query: 'kiro' })
    expect(index.apps).toContainEqual(expect.objectContaining({ title: 'Kiro' }))

    const kiro = index.apps.find((app) => app.title === 'Kiro')
    expect(kiro).toBeDefined()

    await expect(executeItem?.({}, kiro!.id, 'kiro')).resolves.toEqual({
      success: true,
      data: { launched: true },
    })
    expect(executeAppLaunch).toHaveBeenCalledWith({
      nameOrPath: undefined,
      appUserModelId: 'Kiro',
      itemId: kiro!.id,
      autoApprove: true,
    })
  })

  it('surfaces app index diagnostics while keeping other result groups available', async () => {
    const executeAppList = vi.fn(async () => ({
      success: false,
      error: 'Get-StartApps failed',
    }))
    const { service, handlers } = await loadService({ executeAppList })
    service.registerCommandCenterHandlers()
    service.setCommandCenterExtensionEnabled(true)

    const getIndex = handlers.get('command-center:get-index')
    const index = await getIndex?.() as {
      apps: unknown[]
      windows: unknown[]
      chats: unknown[]
      diagnostics?: { apps?: { ok: boolean; error?: string } }
    }

    expect(index.apps).toEqual([])
    expect(index.windows).toEqual(expect.arrayContaining([expect.objectContaining({ hwnd: 55 })]))
    expect(index.chats).toEqual(expect.arrayContaining([expect.objectContaining({ sessionId: 'chat-1' })]))
    expect(index.diagnostics?.apps).toEqual({
      ok: false,
      error: 'Get-StartApps failed',
      sourceCounts: {},
    })
  })
})

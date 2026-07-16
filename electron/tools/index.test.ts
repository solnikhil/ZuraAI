import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeClickArgs,
  normalizeCursorArgs,
  normalizeScrollArgs,
} from './computer-use/normalize'

describe('computer-use argument normalization', () => {
  it('accepts numeric strings for click coordinates', () => {
    expect(normalizeClickArgs({ x: '42', y: '24', button: 'right' })).toEqual({
      args: { x: 42, y: 24, button: 'right' },
      autoApprove: false,
    })
  })

  it('keeps zero-valued click coordinates instead of treating them as missing', () => {
    expect(normalizeClickArgs({ x: 0, y: 0 })).toEqual({
      args: { x: 0, y: 0, button: 'left' },
      autoApprove: false,
    })
  })

  it('rejects invalid click coordinates instead of defaulting to the top-left corner', () => {
    expect(() => normalizeClickArgs({ x: 'left', y: 12 })).toThrow('Invalid x coordinate')
    expect(() => normalizeClickArgs({ x: 12, y: undefined })).toThrow('Invalid y coordinate')
  })

  it('normalizes scroll and cursor coordinates with the same finite-number rules', () => {
    expect(normalizeScrollArgs({ x: '10', y: '20', direction: 'up', amount: '4' }).args).toEqual({
      x: 10,
      y: 20,
      direction: 'up',
      amount: 4,
    })
    expect(normalizeCursorArgs({ x: '30', y: '40' }).args).toEqual({ x: 30, y: 40 })
    expect(() => normalizeScrollArgs({ x: 10, y: Number.NaN, direction: 'down' })).toThrow(
      'Invalid y coordinate'
    )
  })
})

describe('tool routing through current-desktop Computer Use', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function loadToolHandler(
    computerUseOverrides: Record<string, ReturnType<typeof vi.fn>> = {}
  ): Promise<{
    handler: (
      event: { sender?: { id: number } },
      toolName: string,
      args: unknown,
      executionContext?: { approvalToken?: string }
    ) => Promise<unknown>
    handlers: Record<string, ReturnType<typeof vi.fn>>
  }> {
    let handler:
      | ((
          event: { sender?: { id: number } },
          toolName: string,
          args: unknown,
          executionContext?: { approvalToken?: string }
        ) => Promise<unknown>)
      | null = null

    vi.doMock('../ipc/trustedIpc', () => ({
      trustedIpcMain: {
        handle: (channel: string, callback: typeof handler) => {
          if (channel === 'execute-tool') handler = callback
        },
        removeHandler: vi.fn(),
      },
    }))

    vi.doMock('electron', () => ({
      app: {
        getPath: vi.fn(() => '/tmp/zura-tools-test'),
        isPackaged: false,
      },
      ipcMain: {
        handle: vi.fn((channel: string, callback: typeof handler) => {
          if (channel === 'execute-tool') {
            handler = callback
          }
        }),
      },
    }))

    const computerUse = {
      executeScreenshot: vi.fn(async () => ({ success: true, data: { action: 'screenshot' } })),
      executeClick: vi.fn(async () => ({ success: true, data: { action: 'click' } })),
      executeType: vi.fn(async () => ({ success: true, data: { action: 'type' } })),
      executeKey: vi.fn(async () => ({ success: true, data: { action: 'key' } })),
      executeScroll: vi.fn(async () => ({ success: true, data: { action: 'scroll' } })),
      executeCursorPosition: vi.fn(async () => ({
        success: true,
        data: { action: 'cursor_position' },
      })),
      executeListWindows: vi.fn(async () => ({ success: true, data: { windows: [] } })),
      ...computerUseOverrides,
    }

    const nativeMocks = {
      executeWindowsUiaSnapshot: vi.fn(async () => ({ success: true, data: { windows: [] } })),
      executeWindowsUiaInvoke: vi.fn(async () => ({ success: false, error: 'approval required' })),
      executeWindowsUiaSetValue: vi.fn(async () => ({
        success: false,
        error: 'approval required',
      })),
      executeWindowsUiaSelect: vi.fn(async () => ({ success: false, error: 'approval required' })),
      executeSystemShell: vi.fn(async () => ({ success: false, error: 'approval required' })),
      executeFileRead: vi.fn(async () => ({ success: true, data: { content: 'ok' } })),
      executeFileWrite: vi.fn(async () => ({ success: false, error: 'approval required' })),
      executeFileSearch: vi.fn(async () => ({ success: true, data: { results: [] } })),
      executeFileMove: vi.fn(async () => ({ success: false, error: 'approval required' })),
      executeAppFind: vi.fn(async () => ({ success: true, data: { matches: [] } })),
      executeAppLaunch: vi.fn(async () => ({ success: false, error: 'approval required' })),
      executeAppList: vi.fn(async () => ({ success: true, data: { apps: [] } })),
      executeAppInstall: vi.fn(async () => ({ success: false, error: 'approval required' })),
      executeAppUninstall: vi.fn(async () => ({ success: false, error: 'approval required' })),
      executeWindowList: vi.fn(async () => ({ success: true, data: { windows: [] } })),
      executeWindowFocus: vi.fn(async () => ({ success: false, error: 'approval required' })),
      executeWindowMove: vi.fn(async () => ({ success: false, error: 'approval required' })),
      executeWindowClose: vi.fn(async () => ({ success: false, error: 'approval required' })),
      executeSystemActiveWindow: vi.fn(async () => ({ success: true, data: { title: 'Demo' } })),
      executeSystemStatus: vi.fn(async () => ({ success: true, data: { disks: [] } })),
      executeSystemSettingsOpen: vi.fn(async () => ({
        success: false,
        error: 'approval required',
      })),
      executeSystemOpenPath: vi.fn(async () => ({ success: false, error: 'approval required' })),
      executeWindowSnap: vi.fn(async () => ({ success: false, error: 'approval required' })),
      createMcpAddRequest: vi.fn(() => ({ requestId: 'request-1', status: 'pending' })),
    }

    vi.doMock('./computerUse', () => computerUse)
    vi.doMock('./windows-uia', () => nativeMocks)
    vi.doMock('./system-shell', () => nativeMocks)
    vi.doMock('./files', () => nativeMocks)
    vi.doMock('./app-management', () => nativeMocks)
    vi.doMock('./window-management', () => nativeMocks)
    vi.doMock('./os-integration', () => nativeMocks)
    vi.doMock('../mcp/mcpAddRequests', () => nativeMocks)
    vi.doMock('./webSearch', () => ({
      executeWebSearch: vi.fn(async () => ({ success: true, data: [] })),
    }))
    vi.doMock('./codeExecution', () => ({
      executeCode: vi.fn(async () => ({ success: true, data: {} })),
    }))
    vi.doMock('../windows/spotlightOverlay', () => ({
      showSpotlight: vi.fn(async () => undefined),
    }))
    vi.doMock('../monitors', () => ({
      createScheduledTask: vi.fn(),
      deleteScheduledTask: vi.fn(),
      listRuns: vi.fn(async () => []),
      listScheduledTasks: vi.fn(async () => []),
      sanitizeScheduledTaskInput: vi.fn((input: unknown) => input),
      updateScheduledTask: vi.fn(),
      getMonitorRuntime: vi.fn(() => null),
    }))
    vi.doMock('../agentSkills/service', () => ({
      activateAgentSkill: vi.fn(async () => ({ success: true, data: { content: '' } })),
    }))

    const tools = await import('./index')
    tools.registerToolHandlers()

    expect(handler).not.toBeNull()
    return {
      handler: handler as NonNullable<typeof handler>,
      handlers: { ...computerUse, ...nativeMocks },
    }
  }

  it('routes computer_screenshot directly to the current-desktop handler', async () => {
    const { handler, handlers } = await loadToolHandler()

    const result = await handler({}, 'computer_screenshot', { window_title: 'Settings' })

    if (process.platform === 'darwin') {
      expect(result).toEqual({
        success: false,
        error: 'Computer Use is disabled on macOS for now.',
      })
      expect(handlers.executeScreenshot).not.toHaveBeenCalled()
      return
    }

    expect(result).toEqual({ success: true, data: { action: 'screenshot' } })
    expect(handlers.executeScreenshot).toHaveBeenCalledWith({
      display_id: undefined,
      window_id: undefined,
      window_title: 'Settings',
      app_name: undefined,
    })
  })

  it('routes native Windows tools through execute-tool', async () => {
    const { handler, handlers } = await loadToolHandler()

    const result = await handler({}, 'windows_uia_snapshot', {})

    expect(result).toEqual({ success: true, data: { windows: [] } })
    expect(handlers.executeWindowsUiaSnapshot).toHaveBeenCalledTimes(1)
  })

  it('routes mcp_request_add through the shared built-in channel', async () => {
    const { handler, handlers } = await loadToolHandler()
    const args = { mode: 'catalogue', reason: 'Connect Gmail for the requested email task.' }

    await expect(handler({}, 'mcp_request_add', args)).resolves.toEqual({
      success: true,
      data: { requestId: 'request-1', status: 'pending' },
    })
    expect(handlers.createMcpAddRequest).toHaveBeenCalledWith(args)
  })

  it('fails closed for removed duplicate Computer Use app tools', async () => {
    const { handler } = await loadToolHandler()

    for (const toolName of ['computer_launch_app', 'computer_find_app', 'computer_close_app']) {
      await expect(handler({}, toolName, {})).resolves.toEqual({
        success: false,
        error: `Tool "${toolName}" is disabled.`,
      })
    }
  })

  it('rejects malformed arguments at the main boundary before dispatch', async () => {
    const { handler, handlers } = await loadToolHandler()

    await expect(handler({}, 'file_read', { path: 42 })).resolves.toEqual({
      success: false,
      error: 'Invalid arguments for tool "file_read": /path must be string',
    })
    await expect(handler({}, 'file_read', {})).resolves.toEqual({
      success: false,
      error: 'Invalid arguments for tool "file_read": missing required property "path"',
    })
    await expect(handler({}, 'file_read', { path: '   ' })).resolves.toEqual({
      success: false,
      error:
        'Invalid arguments for tool "file_read": required string properties must not be empty: path.',
    })

    expect(handlers.executeFileRead).not.toHaveBeenCalled()
  })

  it('routes mutating native tools to fail closed when approval is absent', async () => {
    const { handler, handlers } = await loadToolHandler()

    const result = await handler({}, 'system_shell', {
      command: 'Get-Date',
      description: 'Check date',
    })

    expect(result).toEqual({ success: false, error: 'approval required' })
    expect(handlers.executeSystemShell).toHaveBeenCalledTimes(1)
  })

  it('rejects model-supplied approval authority and accepts only an exact main-issued token', async () => {
    const { handler, handlers } = await loadToolHandler()
    const args = { command: 'Get-Date', description: 'Check date' }

    await expect(
      handler({ sender: { id: 7 } }, 'system_shell', { ...args, autoApprove: true })
    ).resolves.toMatchObject({ success: false })
    expect(handlers.executeSystemShell).not.toHaveBeenCalled()

    const { issueToolApprovalAuthorization } = await import('./toolApprovalAuthorizations')
    const token = issueToolApprovalAuthorization(7, 'system_shell', args)
    await handler({ sender: { id: 7 } }, 'system_shell', args, { approvalToken: token })

    expect(handlers.executeSystemShell).toHaveBeenCalledWith({ ...args, autoApprove: true })
  })

  it('routes desktop OS integration tools through execute-tool', async () => {
    const { handler, handlers } = await loadToolHandler()

    const activeWindow = await handler({}, 'system_active_window', {})
    const status = await handler({}, 'system_status', {})
    const settingsOpen = await handler({}, 'system_settings_open', { page: 'display' })
    const openPath = await handler({}, 'system_open_path', { path: 'C:\\Users\\Nikhil\\Downloads' })
    const snap = await handler({}, 'window_snap', { preset: 'left' })

    expect(activeWindow).toEqual({ success: true, data: { title: 'Demo' } })
    expect(status).toEqual({ success: true, data: { disks: [] } })
    expect(settingsOpen).toEqual({ success: false, error: 'approval required' })
    expect(openPath).toEqual({ success: false, error: 'approval required' })
    expect(snap).toEqual({ success: false, error: 'approval required' })
    expect(handlers.executeSystemActiveWindow).toHaveBeenCalledTimes(1)
    expect(handlers.executeSystemStatus).toHaveBeenCalledTimes(1)
    expect(handlers.executeSystemSettingsOpen).toHaveBeenCalledTimes(1)
    expect(handlers.executeSystemOpenPath).toHaveBeenCalledTimes(1)
    expect(handlers.executeWindowSnap).toHaveBeenCalledTimes(1)
  })
})

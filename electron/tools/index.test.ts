import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeClickArgs,
  normalizeCursorArgs,
  normalizeScrollArgs,
} from './computer-use/normalize'

describe('computer-use argument normalization', () => {
  it('accepts numeric strings for click coordinates', () => {
    expect(
      normalizeClickArgs({ screenshot_id: 'shot-1', x: '42', y: '24', button: 'right' })
    ).toEqual({
      args: { screenshot_id: 'shot-1', x: 42, y: 24, button: 'right' },
      autoApprove: false,
    })
  })

  it('keeps zero-valued click coordinates instead of treating them as missing', () => {
    expect(normalizeClickArgs({ screenshot_id: 'shot-1', x: 0, y: 0 })).toEqual({
      args: { screenshot_id: 'shot-1', x: 0, y: 0, button: 'left' },
      autoApprove: false,
    })
  })

  it('rejects invalid click coordinates instead of defaulting to the top-left corner', () => {
    expect(() => normalizeClickArgs({ screenshot_id: 'shot-1', x: 'left', y: 12 })).toThrow(
      'Invalid x coordinate'
    )
    expect(() => normalizeClickArgs({ screenshot_id: 'shot-1', x: 12, y: undefined })).toThrow(
      'Invalid y coordinate'
    )
  })

  it('normalizes scroll and cursor coordinates with the same finite-number rules', () => {
    expect(
      normalizeScrollArgs({
        screenshot_id: 'shot-1',
        x: '10',
        y: '20',
        direction: 'up',
        amount: '4',
      }).args
    ).toEqual({ screenshot_id: 'shot-1', x: 10, y: 20, direction: 'up', amount: 4 })
    expect(normalizeCursorArgs({ screenshot_id: 'shot-1', x: '30', y: '40' }).args).toEqual({
      screenshot_id: 'shot-1',
      x: 30,
      y: 40,
    })
    expect(() =>
      normalizeScrollArgs({
        screenshot_id: 'shot-1',
        x: 10,
        y: Number.NaN,
        direction: 'down',
      })
    ).toThrow('Invalid y coordinate')
  })
})

const describeWindows = process.platform === 'win32' ? describe : describe.skip

describeWindows('tool routing through current-desktop Computer Use', () => {
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
      executionContext?: { approvalToken?: string; runId?: string }
    ) => Promise<unknown>
    handlers: Record<string, ReturnType<typeof vi.fn>>
    backgroundWindowCoordinator: {
      status: ReturnType<typeof vi.fn>
      attach: ReturnType<typeof vi.fn>
      release: ReturnType<typeof vi.fn>
    }
    agentRunHandlers: {
      cancel: (event: { sender: { id: number } }, runId: unknown) => Promise<boolean>
      getRuntime: (event: { sender: { id: number } }, runId: unknown) => unknown
    }
  }> {
    let handler:
      | ((
          event: { sender?: { id: number } },
          toolName: string,
          args: unknown,
          executionContext?: { approvalToken?: string; runId?: string }
        ) => Promise<unknown>)
      | null = null
    const ipcHandlers = new Map<string, (...args: any[]) => any>()

    vi.doMock('../ipc/trustedIpc', () => ({
      trustedIpcMain: {
        handle: (channel: string, callback: typeof handler) => {
          if (callback) ipcHandlers.set(channel, callback as (...args: any[]) => any)
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
          if (callback) ipcHandlers.set(channel, callback as (...args: any[]) => any)
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
      executeWindowsUiaInvoke: vi.fn(async () => ({
        success: false,
        error: 'approval required',
      })),
      executeWindowsUiaSetValue: vi.fn(async () => ({
        success: false,
        error: 'approval required',
      })),
      executeWindowsUiaSelect: vi.fn(async () => ({
        success: false,
        error: 'approval required',
      })),
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

    const uiMocks = {
      executeUiGetAppState: vi.fn(async () => ({
        success: true,
        data: { state: { state_id: 'state-1', windows: [] } },
      })),
      executeUiFind: vi.fn(async () => ({ success: true, data: { matches: [] } })),
      executeUiWaitFor: vi.fn(async () => ({ success: true, data: { matches: [] } })),
      executeUiClick: vi.fn(async () => ({ success: true, data: { status: 'completed' } })),
      executeUiTypeText: vi.fn(async () => ({ success: true, data: { status: 'completed' } })),
      executeUiSetValue: vi.fn(async () => ({ success: true, data: { status: 'completed' } })),
      executeUiSelect: vi.fn(async () => ({ success: true, data: { status: 'completed' } })),
      executeUiScroll: vi.fn(async () => ({ success: true, data: { status: 'completed' } })),
      executeUiFocus: vi.fn(async () => ({ success: false, error: 'foreground required' })),
      executeUiKey: vi.fn(async () => ({ success: false, error: 'foreground required' })),
      getUiAutomationElementTarget: vi.fn(() => null),
    }

    const backgroundWindowCoordinator = {
      status: vi.fn(() => null),
      attach: vi.fn(),
      release: vi.fn(async () => false),
      releaseSender: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
    }

    vi.doMock('./computerUse', () => computerUse)
    vi.doMock('./windows-uia', () => nativeMocks)
    vi.doMock('./system-shell', () => nativeMocks)
    vi.doMock('./files', () => nativeMocks)
    vi.doMock('./app-management', () => nativeMocks)
    vi.doMock('./window-management', () => nativeMocks)
    vi.doMock('./os-integration', () => nativeMocks)
    vi.doMock('./ui-automation', () => uiMocks)
    vi.doMock('../mcp/mcpAddRequests', () => nativeMocks)
    vi.doMock('./background-window', () => ({ backgroundWindowCoordinator }))
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
      handlers: { ...computerUse, ...nativeMocks, ...uiMocks },
      backgroundWindowCoordinator,
      agentRunHandlers: {
        cancel: ipcHandlers.get('agent-run:cancel') as (
          event: { sender: { id: number } },
          runId: unknown
        ) => Promise<boolean>,
        getRuntime: ipcHandlers.get('agent-run:get-runtime') as (
          event: { sender: { id: number } },
          runId: unknown
        ) => unknown,
      },
    }
  }

  it('binds Agent runs to their sender at the execute-tool boundary', async () => {
    const { handler, handlers, agentRunHandlers } = await loadToolHandler()
    const context = { runId: 'owned-run' }

    await expect(
      handler({ sender: { id: 7 } }, 'file_read', { path: 'C:\\demo.txt' }, context)
    ).resolves.toEqual(expect.objectContaining({ success: true }))
    await expect(
      handler({ sender: { id: 8 } }, 'file_read', { path: 'C:\\demo.txt' }, context)
    ).resolves.toEqual({ success: false, error: 'Agent run is owned by another renderer.' })
    expect(handlers.executeFileRead).toHaveBeenCalledTimes(1)
    expect(() => agentRunHandlers.getRuntime({ sender: { id: 8 } }, 'owned-run')).toThrow(
      'owned by another renderer'
    )
    await expect(agentRunHandlers.cancel({ sender: { id: 8 } }, 'owned-run')).rejects.toThrow(
      'owned by another renderer'
    )
  })

  it('keeps pre-tool cancellation authoritative at the execute-tool boundary', async () => {
    const { handler, handlers, agentRunHandlers } = await loadToolHandler()

    await expect(
      agentRunHandlers.cancel({ sender: { id: 7 } }, 'cancel-before-dispatch')
    ).resolves.toBe(true)
    await expect(
      handler(
        { sender: { id: 7 } },
        'file_read',
        { path: 'C:\\demo.txt' },
        { runId: 'cancel-before-dispatch' }
      )
    ).resolves.toEqual({
      success: false,
      error: 'Agent run stopped by its run cancellation.',
    })
    expect(handlers.executeFileRead).not.toHaveBeenCalled()
  })

  it('enforces the main-owned total tool budget before dispatch', async () => {
    const { handler, handlers, agentRunHandlers } = await loadToolHandler()
    const event = { sender: { id: 7 } }
    const context = { runId: 'bounded-run' }

    for (let index = 0; index < 120; index += 1) {
      await expect(
        handler(event, 'file_read', { path: `C:\\demo-${index}.txt` }, context)
      ).resolves.toEqual(expect.objectContaining({ success: true }))
    }
    await expect(
      handler(event, 'file_read', { path: 'C:\\over-budget.txt' }, context)
    ).resolves.toEqual({
      success: false,
      error: 'Agent run stopped by its tool-call budget.',
    })
    expect(handlers.executeFileRead).toHaveBeenCalledTimes(120)
    expect(agentRunHandlers.getRuntime(event, 'bounded-run')).toMatchObject({
      status: 'cancelled',
      stopReason: 'budget_exhausted',
      budgetReason: 'tool_calls',
      toolCalls: 120,
    })
  })

  it('releases Agent accounting when a built-in handler fails', async () => {
    const { handler, handlers, agentRunHandlers } = await loadToolHandler()
    handlers.executeFileRead.mockRejectedValueOnce(new Error('read failed'))
    const event = { sender: { id: 7 } }

    await expect(
      handler(event, 'file_read', { path: 'C:\\demo.txt' }, { runId: 'failed-built-in' })
    ).resolves.toEqual({ success: false, error: 'read failed' })
    expect(agentRunHandlers.getRuntime(event, 'failed-built-in')).toMatchObject({
      activeToolCalls: 0,
      status: 'running',
      toolCalls: 1,
    })
  })

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
    expect(handlers.executeScreenshot).toHaveBeenCalledWith(
      {
        display_id: undefined,
        window_id: undefined,
        window_title: 'Settings',
        app_name: undefined,
        reserve_background: true,
      },
      { sessionKey: 'unscoped' }
    )
  })

  it('locks screenshots to the exact reserved HWND and reports unavailable background capture', async () => {
    const executeScreenshot = vi.fn(async () => ({
      success: false,
      error: 'No matching window source available for capture',
    }))
    const { handler, backgroundWindowCoordinator } = await loadToolHandler({ executeScreenshot })
    backgroundWindowCoordinator.status.mockReturnValue({
      hwnd: 67850,
      processId: 25044,
      processStartTimeMs: 123456,
      title: 'Spotify Premium',
    })

    const result = await handler(
      { sender: { id: 7 } },
      'computer_screenshot',
      { window_title: 'Another app' },
      { runId: 'run-1' }
    )

    expect(executeScreenshot).toHaveBeenCalledWith(
      { window_id: 'window:67850:0' },
      { registerEmergencyStop: false, sessionKey: '7:run-1' }
    )
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        data: expect.objectContaining({
          status: 'blocked',
          reason: 'screenshot_unavailable',
          hwnd: 67850,
        }),
      })
    )
  })

  it('blocks window_focus while the owning run has a background reservation', async () => {
    const { handler, handlers, backgroundWindowCoordinator } = await loadToolHandler()
    backgroundWindowCoordinator.status.mockReturnValue({
      hwnd: 67850,
      processId: 25044,
      processStartTimeMs: 123456,
      title: 'Spotify Premium',
    })

    const result = await handler(
      { sender: { id: 7 } },
      'window_focus',
      { hwnd: 67850 },
      { runId: 'run-1' }
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        data: expect.objectContaining({
          status: 'foreground_required',
          action: 'window_focus',
          hwnd: 67850,
        }),
      })
    )
    expect(handlers.executeWindowFocus).not.toHaveBeenCalled()
  })

  it('automatically reserves an exact window returned by a targeted Agent screenshot', async () => {
    const executeScreenshot = vi.fn(async () => ({
      success: true,
      data: {
        action: 'screenshot',
        screenshotId: 'shot-1',
        target: { type: 'window', hwnd: 393776, id: 'window:393776:0', title: 'Discord' },
      },
    }))
    const { handler, backgroundWindowCoordinator } = await loadToolHandler({ executeScreenshot })
    const target = {
      hwnd: 393776,
      processId: 1780,
      processStartTimeMs: 123456,
      title: 'Discord',
    }
    backgroundWindowCoordinator.attach.mockResolvedValue(target)

    const result = await handler(
      { sender: { id: 7 } },
      'computer_screenshot',
      { app_name: 'Discord' },
      { runId: 'run-1' }
    )

    expect(result).toMatchObject({
      success: true,
      data: {
        screenshotId: 'shot-1',
        backgroundReservation: { status: 'attached', automatic: true, target },
      },
    })
    expect(backgroundWindowCoordinator.attach).toHaveBeenCalledWith(
      { runId: 'run-1', senderWebContentsId: 7 },
      393776,
      expect.any(Function),
      expect.any(Function)
    )
  })

  it('keeps an explicit foreground-fallback screenshot from reattaching the guard', async () => {
    const executeScreenshot = vi.fn(async () => ({
      success: true,
      data: {
        action: 'screenshot',
        screenshotId: 'shot-foreground',
        target: { type: 'window', hwnd: 393776, id: 'window:393776:0', title: 'Discord' },
      },
    }))
    const { handler, backgroundWindowCoordinator } = await loadToolHandler({ executeScreenshot })
    backgroundWindowCoordinator.release.mockResolvedValueOnce(true)

    await handler({ sender: { id: 7 } }, 'background_window_release', {}, { runId: 'run-1' })

    const result = await handler(
      { sender: { id: 7 } },
      'computer_screenshot',
      { app_name: 'Discord', reserve_background: false },
      { runId: 'run-1' }
    )

    expect(result).toMatchObject({
      success: true,
      data: { screenshotId: 'shot-foreground' },
    })
    expect(executeScreenshot).toHaveBeenCalledWith(
      expect.objectContaining({ app_name: 'Discord', reserve_background: false }),
      { sessionKey: '7:run-1' }
    )
    expect(backgroundWindowCoordinator.attach).not.toHaveBeenCalled()
  })

  it('rejects a foreground-fallback screenshot without a fresh release permit', async () => {
    const { handler, handlers, backgroundWindowCoordinator } = await loadToolHandler()

    const result = await handler(
      { sender: { id: 7 } },
      'computer_screenshot',
      { app_name: 'Discord', reserve_background: false },
      { runId: 'run-1' }
    )

    expect(result).toMatchObject({
      success: false,
      data: { status: 'blocked', reason: 'foreground_fallback_not_authorized' },
    })
    expect(handlers.executeScreenshot).not.toHaveBeenCalled()
    expect(backgroundWindowCoordinator.attach).not.toHaveBeenCalled()
  })

  it('converts an approved Agent Mode focus request into background ownership', async () => {
    const { handler, handlers, backgroundWindowCoordinator } = await loadToolHandler()
    const target = {
      hwnd: 393776,
      processId: 1780,
      processStartTimeMs: 123456,
      title: 'Discord',
    }
    backgroundWindowCoordinator.attach.mockResolvedValue(target)
    const args = { hwnd: 393776 }
    const { issueToolApprovalAuthorization } = await import('./toolApprovalAuthorizations')
    const token = issueToolApprovalAuthorization(7, 'window_focus', args)

    const result = await handler({ sender: { id: 7 } }, 'window_focus', args, {
      runId: 'run-1',
      approvalToken: token,
    })

    expect(result).toMatchObject({
      success: true,
      data: {
        status: 'background_attached',
        focusChanged: false,
        target,
      },
    })
    expect(backgroundWindowCoordinator.attach).toHaveBeenCalledWith(
      { runId: 'run-1', senderWebContentsId: 7 },
      393776,
      expect.any(Function),
      expect.any(Function)
    )
    expect(handlers.executeUiGetAppState).toHaveBeenCalledWith({ hwnd: 393776 })
    expect(handlers.executeWindowFocus).not.toHaveBeenCalled()
  })

  it('does not release a background reservation for shared physical input', async () => {
    const { handler, handlers, backgroundWindowCoordinator } = await loadToolHandler()
    backgroundWindowCoordinator.status.mockReturnValue({
      hwnd: 67850,
      processId: 25044,
      processStartTimeMs: 123456,
      title: 'Discord',
    })

    const keyResult = await handler(
      { sender: { id: 7 } },
      'computer_key',
      { screenshot_id: 'shot-1', key: 'ctrl+k' },
      { runId: 'run-1' }
    )
    const typeResult = await handler(
      { sender: { id: 7 } },
      'computer_type',
      { screenshot_id: 'shot-1', text: 'Hector' },
      { runId: 'run-1' }
    )
    const scrollResult = await handler(
      { sender: { id: 7 } },
      'computer_scroll',
      { screenshot_id: 'shot-1', x: 10, y: 20, direction: 'down' },
      { runId: 'run-1' }
    )
    const cursorResult = await handler(
      { sender: { id: 7 } },
      'computer_cursor_position',
      { screenshot_id: 'shot-1', x: 10, y: 20 },
      { runId: 'run-1' }
    )

    for (const result of [keyResult, typeResult, scrollResult, cursorResult]) {
      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          data: expect.objectContaining({ status: 'foreground_required', hwnd: 67850 }),
        })
      )
    }
    expect(backgroundWindowCoordinator.release).not.toHaveBeenCalled()
    expect(handlers.executeKey).not.toHaveBeenCalled()
    expect(handlers.executeType).not.toHaveBeenCalled()
    expect(handlers.executeScroll).not.toHaveBeenCalled()
    expect(handlers.executeCursorPosition).not.toHaveBeenCalled()
  })

  it('disables physical click fallback while a background reservation exists', async () => {
    const { handler, handlers, backgroundWindowCoordinator } = await loadToolHandler()
    backgroundWindowCoordinator.status.mockReturnValue({
      hwnd: 393776,
      processId: 1780,
      processStartTimeMs: 123456,
      title: 'Discord',
    })

    await handler(
      { sender: { id: 7 } },
      'computer_click',
      { screenshot_id: 'shot-1', x: 458, y: 371 },
      { runId: 'run-1' }
    )

    expect(handlers.executeClick).toHaveBeenCalledWith(
      { screenshot_id: 'shot-1', x: 458, y: 371, button: 'left' },
      false,
      expect.any(Function),
      '7:run-1',
      expect.any(Function),
      false
    )
    expect(backgroundWindowCoordinator.release).not.toHaveBeenCalled()
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

  it('fails closed when background window attachment lacks main-issued approval', async () => {
    const { handler } = await loadToolHandler()

    await expect(
      handler({ sender: { id: 7 } }, 'background_window_attach', { hwnd: 42 }, { runId: 'run-1' })
    ).resolves.toEqual({
      success: false,
      error: 'background_window_attach requires user approval before it can run.',
    })
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
    const openPath = await handler({}, 'system_open_path', {
      path: 'C:\\Users\\Nikhil\\Downloads',
    })
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

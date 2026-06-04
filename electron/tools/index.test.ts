import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeClickArgs, normalizeCursorArgs, normalizeScrollArgs } from './computer-use/normalize'

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
    expect(() => normalizeScrollArgs({ x: 10, y: Number.NaN, direction: 'down' })).toThrow('Invalid y coordinate')
  })
})

describe('tool routing through Agent Desktop readiness', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function loadToolHandlerWithAgentDesktop(
    service: {
      getState: ReturnType<typeof vi.fn>
      ensureReadyForTool: ReturnType<typeof vi.fn>
      gateComputerAction: ReturnType<typeof vi.fn>
      activateTakeOver?: ReturnType<typeof vi.fn>
      endTakeOver?: ReturnType<typeof vi.fn>
    },
    computerUseOverrides: Record<string, ReturnType<typeof vi.fn>> = {}
  ): Promise<{
    handler: (event: unknown, toolName: string, args: unknown) => Promise<unknown>
    computerUse: Record<string, ReturnType<typeof vi.fn>>
  }> {
    let handler:
      | ((event: unknown, toolName: string, args: unknown) => Promise<unknown>)
      | null = null

    vi.doMock('electron', () => ({
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
      executeLaunchApp: vi.fn(async () => ({ success: true, data: { action: 'launch_app' } })),
      executeFindApp: vi.fn(async () => ({ success: true, data: { action: 'find_app' } })),
      executeCloseApp: vi.fn(async () => ({ success: true, data: { action: 'close_app' } })),
      ...computerUseOverrides,
    }

    vi.doMock('./computerUse', () => computerUse)
    const nativeMocks = {
      executeWindowsUiaSnapshot: vi.fn(async () => ({ success: true, data: { windows: [] } })),
      executeWindowsUiaInvoke: vi.fn(async () => ({ success: false, error: 'approval required' })),
      executeWindowsUiaSetValue: vi.fn(async () => ({ success: false, error: 'approval required' })),
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
    }
    vi.doMock('./windows-uia', () => nativeMocks)
    vi.doMock('./system-shell', () => nativeMocks)
    vi.doMock('./files', () => nativeMocks)
    vi.doMock('./app-management', () => nativeMocks)
    vi.doMock('./window-management', () => nativeMocks)
    vi.doMock('./webSearch', () => ({
      executeWebSearch: vi.fn(async () => ({ success: true, data: [] })),
    }))
    vi.doMock('./codeExecution', () => ({
      executeCode: vi.fn(async () => ({ success: true, data: {} })),
    }))
    vi.doMock('../windows/spotlightOverlay', () => ({
      showSpotlight: vi.fn(async () => undefined),
    }))
    vi.doMock('../agentDesktop', () => ({
      initializeAgentDesktopService: vi.fn(async () => ({
        enabled: true,
        capability: 'available',
      })),
    }))
    vi.doMock('../agentDesktop/service', () => ({
      getAgentDesktopService: vi.fn(() => service),
    }))

    const tools = await import('./index')
    tools.registerToolHandlers()

    expect(handler).not.toBeNull()
    return { handler: handler as NonNullable<typeof handler>, computerUse: { ...computerUse, ...nativeMocks } }
  }

  it('runs Agent Desktop readiness before gating and executing a routed computer tool', async () => {
    const calls: string[] = []
    const service = {
      getState: vi.fn(() => ({ enabled: true })),
      ensureReadyForTool: vi.fn(async () => {
        calls.push('ready')
        return { ready: true, state: { capability: 'active' } }
      }),
      gateComputerAction: vi.fn(async () => {
        calls.push('gate')
        return { allow: true, autoApprove: true, desktopOverride: 123 }
      }),
      activateTakeOver: vi.fn(),
    }
    const { handler, computerUse } = await loadToolHandlerWithAgentDesktop(service)

    const result = await handler({}, 'computer_screenshot', {})

    expect(result).toEqual({ success: true, data: { action: 'screenshot' } })
    expect(service.ensureReadyForTool).toHaveBeenCalledTimes(1)
    expect(service.gateComputerAction).toHaveBeenCalledTimes(1)
    expect(computerUse.executeScreenshot).toHaveBeenCalledWith({}, 123)
    expect(calls).toEqual(['ready', 'gate'])
  })

  it('uses readiness on later Agent Desktop-routed calls, allowing stale-session repair before gating', async () => {
    const service = {
      getState: vi.fn(() => ({ enabled: true })),
      ensureReadyForTool: vi.fn(async () => ({ ready: true, state: { capability: 'active' } })),
      gateComputerAction: vi.fn(async () => ({ allow: true, autoApprove: true })),
      activateTakeOver: vi.fn(),
    }
    const { handler, computerUse } = await loadToolHandlerWithAgentDesktop(service)

    await handler({}, 'computer_list_windows', {})
    await handler({}, 'computer_list_windows', {})

    expect(service.ensureReadyForTool).toHaveBeenCalledTimes(2)
    expect(service.gateComputerAction).toHaveBeenCalledTimes(2)
    expect(computerUse.executeListWindows).toHaveBeenCalledTimes(2)
  })

  it('returns readiness failure without falling back to the regular Computer Use handler', async () => {
    const service = {
      getState: vi.fn(() => ({ enabled: true })),
      ensureReadyForTool: vi.fn(async () => ({
        ready: false,
        error: 'The Agent Desktop could not be provisioned.',
        state: { capability: 'available' },
      })),
      gateComputerAction: vi.fn(),
      activateTakeOver: vi.fn(),
    }
    const executeScreenshot = vi.fn(async () => ({
      success: true,
      data: { action: 'fallback-screenshot' },
    }))
    const { handler } = await loadToolHandlerWithAgentDesktop(service, { executeScreenshot })

    const result = await handler({}, 'computer_screenshot', {})

    expect(result).toEqual({
      success: false,
      error: 'The Agent Desktop could not be provisioned.',
    })
    expect(service.gateComputerAction).not.toHaveBeenCalled()
    expect(executeScreenshot).not.toHaveBeenCalled()
  })

  it('displays the Agent Desktop before launching an app so it cannot launch on the current desktop', async () => {
    const calls: string[] = []
    const service = {
      getState: vi.fn(() => ({ enabled: true })),
      ensureReadyForTool: vi.fn(async () => {
        calls.push('ready')
        return {
          ready: true,
          state: { capability: 'active', agentDesktopDisplayed: false },
        }
      }),
      activateTakeOver: vi.fn(async () => {
        calls.push('display')
        return { ok: true, state: { agentDesktopDisplayed: true } }
      }),
      gateComputerAction: vi.fn(async () => {
        calls.push('gate')
        return { allow: true, autoApprove: true }
      }),
      endTakeOver: vi.fn(async () => {
        calls.push('return')
        return { ok: true, state: { agentDesktopDisplayed: false } }
      }),
    }
    const executeLaunchApp = vi.fn(async () => ({
      success: true,
      data: { launched: 'notepad' },
    }))
    const { handler } = await loadToolHandlerWithAgentDesktop(service, { executeLaunchApp })

    const result = await handler({}, 'computer_launch_app', {
      name: 'notepad',
    })

    expect(result).toEqual({ success: true, data: { launched: 'notepad' } })
    expect(service.ensureReadyForTool).toHaveBeenCalledTimes(1)
    expect(service.activateTakeOver).toHaveBeenCalledTimes(1)
    expect(service.gateComputerAction).toHaveBeenCalledTimes(1)
    expect(service.endTakeOver).toHaveBeenCalledTimes(1)
    expect(executeLaunchApp).toHaveBeenCalledWith({ name: 'notepad' })
    expect(calls).toEqual(['ready', 'display', 'gate', 'return'])
  })

  it('blocks app launch when the Agent Desktop cannot be displayed', async () => {
    const service = {
      getState: vi.fn(() => ({ enabled: true })),
      ensureReadyForTool: vi.fn(async () => ({
        ready: true,
        state: { capability: 'active', agentDesktopDisplayed: false },
      })),
      activateTakeOver: vi.fn(async () => ({
        ok: false,
        error: 'Agent Desktop could not be displayed.',
        state: { agentDesktopDisplayed: false },
      })),
      gateComputerAction: vi.fn(),
      endTakeOver: vi.fn(),
    }
    const executeLaunchApp = vi.fn(async () => ({ success: true, data: { launched: 'notepad' } }))
    const { handler } = await loadToolHandlerWithAgentDesktop(service, { executeLaunchApp })

    const result = await handler({}, 'computer_launch_app', { name: 'notepad' })

    expect(result).toEqual({
      success: false,
      error: 'Agent Desktop could not be displayed.',
    })
    expect(service.activateTakeOver).toHaveBeenCalledTimes(1)
    expect(service.endTakeOver).not.toHaveBeenCalled()
    expect(service.gateComputerAction).not.toHaveBeenCalled()
    expect(executeLaunchApp).not.toHaveBeenCalled()
  })

  it('returns to the user desktop when launch gating fails after displaying Agent Desktop', async () => {
    const service = {
      getState: vi.fn(() => ({ enabled: true })),
      ensureReadyForTool: vi.fn(async () => ({
        ready: true,
        state: { capability: 'active', agentDesktopDisplayed: false },
      })),
      activateTakeOver: vi.fn(async () => ({
        ok: true,
        state: { agentDesktopDisplayed: true },
      })),
      gateComputerAction: vi.fn(async () => ({
        allow: false,
        reason: 'Action limit reached (50). Start a new task.',
      })),
      endTakeOver: vi.fn(async () => ({
        ok: true,
        state: { agentDesktopDisplayed: false },
      })),
    }
    const executeLaunchApp = vi.fn(async () => ({ success: true, data: { launched: 'notepad' } }))
    const { handler } = await loadToolHandlerWithAgentDesktop(service, { executeLaunchApp })

    const result = await handler({}, 'computer_launch_app', { name: 'notepad' })

    expect(result).toEqual({
      success: false,
      error: 'Action limit reached (50). Start a new task.',
    })
    expect(service.activateTakeOver).toHaveBeenCalledTimes(1)
    expect(service.gateComputerAction).toHaveBeenCalledTimes(1)
    expect(service.endTakeOver).toHaveBeenCalledTimes(1)
    expect(executeLaunchApp).not.toHaveBeenCalled()
  })

  it('routes native Windows tools through execute-tool', async () => {
    const service = {
      getState: vi.fn(() => ({ enabled: false })),
      ensureReadyForTool: vi.fn(),
      gateComputerAction: vi.fn(),
    }
    const { handler, computerUse } = await loadToolHandlerWithAgentDesktop(service)

    const result = await handler({}, 'windows_uia_snapshot', {})

    expect(result).toEqual({ success: true, data: { windows: [] } })
    expect(computerUse.executeWindowsUiaSnapshot).toHaveBeenCalledTimes(1)
    expect(service.ensureReadyForTool).not.toHaveBeenCalled()
  })

  it('routes mutating native tools to fail closed when approval is absent', async () => {
    const service = {
      getState: vi.fn(() => ({ enabled: false })),
      ensureReadyForTool: vi.fn(),
      gateComputerAction: vi.fn(),
    }
    const { handler, computerUse } = await loadToolHandlerWithAgentDesktop(service)

    const result = await handler({}, 'system_shell', {
      command: 'Get-Date',
      description: 'Check date',
    })

    expect(result).toEqual({ success: false, error: 'approval required' })
    expect(computerUse.executeSystemShell).toHaveBeenCalledTimes(1)
  })
})

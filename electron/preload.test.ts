// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_MAIN_TOOL_NAMES } from '../src/tools/builtinMainToolContract'

const preloadMocks = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  exposeInMainWorld: vi.fn((key: string, value: unknown) => {
    preloadMocks.exposed.set(key, value)
  }),
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: preloadMocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: preloadMocks.invoke,
    on: preloadMocks.on,
    off: preloadMocks.off,
    removeListener: preloadMocks.removeListener,
    send: preloadMocks.send,
  },
}))

describe('preload MCP bridge', () => {
  beforeEach(async () => {
    vi.resetModules()
    preloadMocks.exposed.clear()
    preloadMocks.exposeInMainWorld.mockClear()
    preloadMocks.invoke.mockReset()
    preloadMocks.on.mockReset()
    preloadMocks.off.mockReset()
    preloadMocks.removeListener.mockReset()
    preloadMocks.send.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await import('./preload')
  })

  it('exposes main-owned Agent Mode autonomous policy controls', async () => {
    const agentApproval = getExposedBridge<{
      getAutonomousMode: () => Promise<{ enabled: boolean }>
      setAutonomousMode: (enabled: boolean) => Promise<{ enabled: boolean }>
    }>('agentApproval')
    preloadMocks.invoke
      .mockResolvedValueOnce({ enabled: false })
      .mockResolvedValueOnce({ enabled: true })

    await expect(agentApproval.getAutonomousMode()).resolves.toEqual({ enabled: false })
    await expect(agentApproval.setAutonomousMode(true)).resolves.toEqual({ enabled: true })
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(1, 'agent-approval:get-autonomous-mode')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(
      2,
      'agent-approval:set-autonomous-mode',
      true
    )
  })

  it('exposes the narrow ChatGPT Codex account actions on the provider bridge', async () => {
    const providerRuntime = getExposedBridge<{
      signInCodex: () => Promise<boolean>
      getCodexAuthStatus: () => Promise<{ signedIn: boolean }>
      signOutCodex: () => Promise<boolean>
    }>('providerRuntime')
    preloadMocks.invoke
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({ signedIn: true })
      .mockResolvedValueOnce(true)

    await expect(providerRuntime.signInCodex()).resolves.toBe(true)
    await expect(providerRuntime.getCodexAuthStatus()).resolves.toEqual({ signedIn: true })
    await expect(providerRuntime.signOutCodex()).resolves.toBe(true)

    expect(preloadMocks.invoke).toHaveBeenCalledWith('provider-runtime:codex-sign-in')
    expect(preloadMocks.invoke).toHaveBeenCalledWith('provider-runtime:codex-auth-status')
    expect(preloadMocks.invoke).toHaveBeenCalledWith('provider-runtime:codex-sign-out')
  })

  it('exposes a dedicated MCP bridge with invoke helpers', async () => {
    const mcp = getExposedBridge<{
      listServers: () => Promise<unknown>
      connectServer: (serverId: string) => Promise<unknown>
      listTools: (serverId?: string) => Promise<unknown>
      executeTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>
      resolveApproval: (requestId: string, approved: boolean) => Promise<unknown>
      getState: () => Promise<unknown>
      openConfigFile: () => Promise<unknown>
      resolveAddRequest: (requestId: string) => Promise<unknown>
      approveAddRequest: (requestId: string) => Promise<unknown>
      cancelAddRequest: (requestId: string) => Promise<unknown>
    }>('mcp')

    preloadMocks.invoke
      .mockResolvedValueOnce([{ id: 'server-1' }])
      .mockResolvedValueOnce({ serverId: 'server-1', status: 'connected' })
      .mockResolvedValueOnce([{ namespacedName: 'mcp__server__read_file' }])
      .mockResolvedValueOnce({ success: true, metadata: { origin: 'mcp' } })
      .mockResolvedValueOnce({ requestId: 'approval-1', approved: true, outcome: 'approved' })
      .mockResolvedValueOnce({ servers: [], runtimeStates: [], tools: [], pendingApprovals: [] })
      .mockResolvedValueOnce({ ok: true, path: '/tmp/mcp-servers.json' })
      .mockResolvedValueOnce({ requestId: 'add-1', serverName: 'Gmail' })
      .mockResolvedValueOnce({ requestId: 'add-1', status: 'connected' })
      .mockResolvedValueOnce({ requestId: 'add-2', status: 'cancelled' })

    await expect(mcp.listServers()).resolves.toEqual([{ id: 'server-1' }])
    await expect(mcp.connectServer('server-1')).resolves.toEqual({
      serverId: 'server-1',
      status: 'connected',
    })
    await expect(mcp.listTools('server-1')).resolves.toEqual([
      { namespacedName: 'mcp__server__read_file' },
    ])
    await expect(mcp.executeTool('mcp__server__read_file', { path: 'demo.txt' })).resolves.toEqual({
      success: true,
      metadata: { origin: 'mcp' },
    })
    await expect(mcp.resolveApproval('approval-1', true)).resolves.toEqual({
      requestId: 'approval-1',
      approved: true,
      outcome: 'approved',
    })
    await expect(mcp.getState()).resolves.toEqual({
      servers: [],
      runtimeStates: [],
      tools: [],
      pendingApprovals: [],
    })
    await expect(mcp.openConfigFile()).resolves.toEqual({ ok: true, path: '/tmp/mcp-servers.json' })
    await expect(mcp.resolveAddRequest('add-1')).resolves.toEqual({
      requestId: 'add-1',
      serverName: 'Gmail',
    })
    await expect(mcp.approveAddRequest('add-1')).resolves.toEqual({
      requestId: 'add-1',
      status: 'connected',
    })
    await expect(mcp.cancelAddRequest('add-2')).resolves.toEqual({
      requestId: 'add-2',
      status: 'cancelled',
    })

    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(1, 'mcp:list-servers')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(2, 'mcp:connect-server', 'server-1')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(3, 'mcp:list-tools', 'server-1')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(
      4,
      'mcp:execute-tool',
      'mcp__server__read_file',
      { path: 'demo.txt' }
    )
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(
      5,
      'mcp:resolve-approval',
      'approval-1',
      true
    )
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(6, 'mcp:get-state')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(7, 'mcp:open-config-file')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(8, 'mcp:resolve-add-request', 'add-1')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(9, 'mcp:approve-add-request', 'add-1')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(10, 'mcp:cancel-add-request', 'add-2')
  })

  it('subscribes to MCP snapshot updates and unregisters listeners', () => {
    const mcp = getExposedBridge<{
      onStateChange: (callback: (snapshot: unknown) => void) => () => void
    }>('mcp')
    const callback = vi.fn()

    const unsubscribe = mcp.onStateChange(callback)

    expect(preloadMocks.on).toHaveBeenCalledWith('mcp:state-changed', expect.any(Function))
    const listener = preloadMocks.on.mock.calls[0]?.[1]
    const snapshot = {
      servers: [],
      runtimeStates: [{ serverId: 'server-1', status: 'connected' }],
      tools: [],
    }

    listener?.({}, snapshot)
    expect(callback).toHaveBeenCalledWith(snapshot)

    unsubscribe()
    expect(preloadMocks.removeListener).toHaveBeenCalledWith('mcp:state-changed', listener)
  })

  it('exposes the native context-menu bridge with narrow action callbacks', async () => {
    const contextMenu = getExposedBridge<{
      show: (request: { hasSelection: boolean }) => Promise<void>
      onAction: (callback: (action: string) => void) => () => void
    }>('contextMenu')
    const callback = vi.fn()

    preloadMocks.invoke.mockResolvedValueOnce(undefined)
    await expect(contextMenu.show({ hasSelection: true })).resolves.toBeUndefined()
    expect(preloadMocks.invoke).toHaveBeenCalledWith('context-menu:show', { hasSelection: true })

    const unsubscribe = contextMenu.onAction(callback)
    expect(preloadMocks.on).toHaveBeenCalledWith('context-menu:action', expect.any(Function))

    const listener = preloadMocks.on.mock.calls.find(
      (call) => call[0] === 'context-menu:action'
    )?.[1]
    listener?.({}, 'copy')
    expect(callback).toHaveBeenCalledWith('copy')

    unsubscribe()
    expect(preloadMocks.removeListener).toHaveBeenCalledWith('context-menu:action', listener)
  })

  it('exposes the native dialog bridge for fixed delete confirmations', async () => {
    const nativeDialog = getExposedBridge<{
      confirmDeleteChat: () => Promise<boolean>
    }>('nativeDialog')

    preloadMocks.invoke.mockResolvedValueOnce(true)

    await expect(nativeDialog.confirmDeleteChat()).resolves.toBe(true)
    expect(preloadMocks.invoke).toHaveBeenCalledWith('native-dialog:confirm-delete-chat')
  })

  it('exposes a dedicated app-menu bridge and keeps it out of generic IPC', async () => {
    const appMenu = getExposedBridge<{
      command: (command: string) => Promise<boolean>
    }>('appMenu')
    const ipcRenderer = getExposedBridge<{
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }>('ipcRenderer')

    preloadMocks.invoke.mockResolvedValueOnce(true)
    await expect(appMenu.command('new-chat')).resolves.toBe(true)
    expect(preloadMocks.invoke).toHaveBeenCalledWith('app-menu:command', 'new-chat')

    expect(() => ipcRenderer.invoke('app-menu:command' as never, 'new-chat')).toThrow(
      'Blocked IPC invoke channel: app-menu:command'
    )
  })

  it('keeps MCP tools blocked from the generic execute-tool bridge', async () => {
    const ipcRenderer = getExposedBridge<{
      send: (channel: string, ...args: unknown[]) => void
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }>('ipcRenderer')

    expect(() => ipcRenderer.send('spawn-terminal-command', 'whoami')).toThrow(
      'Blocked IPC send channel: spawn-terminal-command'
    )
    expect(preloadMocks.send).not.toHaveBeenCalled()

    await expect(
      ipcRenderer.invoke('execute-tool', 'mcp__server__read_file', { path: 'demo.txt' })
    ).resolves.toEqual({
      success: false,
      error: 'Tool "mcp__server__read_file" is disabled.',
    })
    expect(preloadMocks.invoke).not.toHaveBeenCalled()

    preloadMocks.invoke.mockResolvedValueOnce({ success: true, data: { ok: true } })
    await expect(
      ipcRenderer.invoke('execute-tool', 'web_search', { query: 'mcp' })
    ).resolves.toEqual({
      success: true,
      data: { ok: true },
    })
    expect(preloadMocks.invoke).toHaveBeenCalledWith('execute-tool', 'web_search', { query: 'mcp' })
  })

  it('forwards every exact built-in main tool name and blocks lookalikes', async () => {
    const ipcRenderer = getExposedBridge<{
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }>('ipcRenderer')

    preloadMocks.invoke.mockResolvedValue({ success: true })

    for (const toolName of BUILTIN_MAIN_TOOL_NAMES) {
      await expect(ipcRenderer.invoke('execute-tool', toolName, {})).resolves.toEqual({
        success: true,
      })
      expect(preloadMocks.invoke).toHaveBeenLastCalledWith('execute-tool', toolName, {})
    }

    const forwardedCallCount = preloadMocks.invoke.mock.calls.length
    for (const toolName of ['mcp__server__read_file', 'file_not_registered', 'web_search_extra']) {
      await expect(ipcRenderer.invoke('execute-tool', toolName, {})).resolves.toEqual({
        success: false,
        error: `Tool "${toolName}" is disabled.`,
      })
    }
    expect(preloadMocks.invoke).toHaveBeenCalledTimes(forwardedCallCount)
  })

  it('exposes the terminal approval bridge', () => {
    expect(preloadMocks.exposed.has('terminal')).toBe(true)
    const bridge = preloadMocks.exposed.get('terminal') as {
      resolveApproval?: unknown
      onPendingApproval?: unknown
    }
    expect(typeof bridge.resolveApproval).toBe('function')
    expect(typeof bridge.onPendingApproval).toBe('function')
  })

  it('exposes a narrow background-window lifecycle bridge', async () => {
    const bridge = getExposedBridge<{
      releaseRun: (runId: string, outcome: string) => Promise<boolean>
      onRunStopped: (callback: (event: unknown) => void) => () => void
    }>('backgroundWindow')
    preloadMocks.invoke.mockResolvedValueOnce(true)

    await expect(bridge.releaseRun('run-1', 'completed')).resolves.toBe(true)
    expect(preloadMocks.invoke).toHaveBeenCalledWith(
      'background-window:release-run',
      'run-1',
      'completed'
    )

    const callback = vi.fn()
    const unsubscribe = bridge.onRunStopped(callback)
    expect(preloadMocks.on).toHaveBeenCalledWith(
      'background-window:run-stopped',
      expect.any(Function)
    )
    unsubscribe()
    expect(preloadMocks.removeListener).toHaveBeenCalledWith(
      'background-window:run-stopped',
      expect.any(Function)
    )
  })

  it('exposes a dedicated analytics bridge and keeps it out of generic IPC', async () => {
    const analytics = getExposedBridge<{
      getState: () => Promise<unknown>
      setEnabled: (enabled: boolean) => Promise<unknown>
      track: (eventName: string, properties?: Record<string, unknown>) => Promise<boolean>
    }>('analytics')
    const ipcRenderer = getExposedBridge<{
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }>('ipcRenderer')

    preloadMocks.invoke
      .mockResolvedValueOnce({ analyticsEnabled: false, consentState: 'undecided' })
      .mockResolvedValueOnce({ analyticsEnabled: true, consentState: 'accepted' })
      .mockResolvedValueOnce(true)

    await expect(analytics.getState()).resolves.toEqual({
      analyticsEnabled: false,
      consentState: 'undecided',
    })
    await expect(analytics.setEnabled(true)).resolves.toEqual({
      analyticsEnabled: true,
      consentState: 'accepted',
    })
    await expect(analytics.track('chat_message_sent', { provider: 'openrouter' })).resolves.toBe(
      true
    )

    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(1, 'analytics:get-state')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(2, 'analytics:set-enabled', true)
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(3, 'analytics:track', 'chat_message_sent', {
      provider: 'openrouter',
    })
    expect(() => ipcRenderer.invoke('analytics:track' as never, 'app_start')).toThrow(
      'Blocked IPC invoke channel: analytics:track'
    )
  })

  it('exposes a dedicated email notification bridge and keeps it out of generic IPC', async () => {
    const emailNotifications = getExposedBridge<{
      applySettings: (settings: {
        enabled: boolean
        senderName: string
        senderEmail: string
        recipientEmail: string
      }) => Promise<unknown>
      sendTest: () => Promise<{ ok: boolean }>
    }>('emailNotifications')
    const ipcRenderer = getExposedBridge<{
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }>('ipcRenderer')
    const settings = {
      enabled: true,
      senderName: 'ZuraAI',
      senderEmail: 'reminders@example.com',
      recipientEmail: 'user@example.com',
    }

    preloadMocks.invoke.mockResolvedValueOnce(settings).mockResolvedValueOnce({ ok: true })

    await expect(emailNotifications.applySettings(settings)).resolves.toEqual(settings)
    await expect(emailNotifications.sendTest()).resolves.toEqual({ ok: true })

    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(
      1,
      'email-notifications:apply-settings',
      settings
    )
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(2, 'email-notifications:send-test')
    expect(() => ipcRenderer.invoke('email-notifications:send-test' as never)).toThrow(
      'Blocked IPC invoke channel: email-notifications:send-test'
    )
  })

  it('exposes memory summary delete and clear only through the memory bridge', async () => {
    const memory = getExposedBridge<{
      summaries: {
        delete: (sessionId: string) => Promise<boolean>
        clear: () => Promise<boolean>
      }
    }>('memory')
    const ipcRenderer = getExposedBridge<{
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }>('ipcRenderer')

    preloadMocks.invoke.mockResolvedValueOnce(true).mockResolvedValueOnce(true)

    await expect(memory.summaries.delete('session-1')).resolves.toBe(true)
    await expect(memory.summaries.clear()).resolves.toBe(true)

    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(1, 'memory:summaries-delete', 'session-1')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(2, 'memory:summaries-clear')
    expect(() => ipcRenderer.invoke('memory:summaries-delete' as never, 'session-1')).toThrow(
      'Blocked IPC invoke channel: memory:summaries-delete'
    )
  })

  it('exposes AI automation run callbacks only through the scheduled tasks bridge', async () => {
    const scheduledTasks = getExposedBridge<{
      resolveAutomationRun: (response: {
        requestId: string
        outputText?: string
      }) => Promise<boolean>
      onAutomationRunRequest: (
        callback: (request: { requestId: string; taskId: string }) => void
      ) => () => void
    }>('scheduledTasks')
    const ipcRenderer = getExposedBridge<{
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }>('ipcRenderer')
    const callback = vi.fn()

    preloadMocks.invoke.mockResolvedValueOnce(true)
    await expect(
      scheduledTasks.resolveAutomationRun({
        requestId: 'run-1',
        outputText: 'done',
      })
    ).resolves.toBe(true)
    expect(preloadMocks.invoke).toHaveBeenCalledWith('scheduled-tasks:resolve-automation-run', {
      requestId: 'run-1',
      outputText: 'done',
    })

    const unsubscribe = scheduledTasks.onAutomationRunRequest(callback)
    const listener = preloadMocks.on.mock.calls.find(
      (call) => call[0] === 'scheduled-tasks:automation-run-request'
    )?.[1]
    listener?.({}, { requestId: 'run-1', taskId: 'task-1' })
    expect(callback).toHaveBeenCalledWith({ requestId: 'run-1', taskId: 'task-1' })
    unsubscribe()
    expect(preloadMocks.removeListener).toHaveBeenCalledWith(
      'scheduled-tasks:automation-run-request',
      listener
    )

    expect(() => ipcRenderer.invoke('scheduled-tasks:resolve-automation-run' as never, {})).toThrow(
      'Blocked IPC invoke channel: scheduled-tasks:resolve-automation-run'
    )
  })
})

describe('preload updater bridge', () => {
  beforeEach(async () => {
    vi.resetModules()
    preloadMocks.exposed.clear()
    preloadMocks.exposeInMainWorld.mockClear()
    preloadMocks.invoke.mockReset()
    preloadMocks.on.mockReset()
    preloadMocks.off.mockReset()
    preloadMocks.removeListener.mockReset()
    preloadMocks.send.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await import('./preload')
  })

  it('forwards update-error messages and supports unsubscribe', () => {
    const updater = getExposedBridge<{
      onUpdateError: (callback: (message: string) => void) => () => void
    }>('updater')
    const callback = vi.fn()

    const unsubscribe = updater.onUpdateError(callback)
    expect(preloadMocks.on).toHaveBeenCalledWith('update-error', expect.any(Function))

    const listener = preloadMocks.on.mock.calls.find((call) => call[0] === 'update-error')?.[1]
    listener?.({}, 'Download failed: 404')
    expect(callback).toHaveBeenCalledWith('Download failed: 404')

    unsubscribe()
    expect(preloadMocks.off).toHaveBeenCalledWith('update-error', listener)
  })

  it('forwards update-download-progress payloads and supports unsubscribe', () => {
    const updater = getExposedBridge<{
      onUpdateProgress: (
        callback: (progress: { percent: number; transferred: number; total: number }) => void
      ) => () => void
    }>('updater')
    const callback = vi.fn()

    const unsubscribe = updater.onUpdateProgress(callback)
    expect(preloadMocks.on).toHaveBeenCalledWith('update-download-progress', expect.any(Function))

    const listener = preloadMocks.on.mock.calls.find(
      (call) => call[0] === 'update-download-progress'
    )?.[1]
    const progress = { percent: 42.5, transferred: 1000, total: 2353 }
    listener?.({}, progress)
    expect(callback).toHaveBeenCalledWith(progress)

    unsubscribe()
    expect(preloadMocks.off).toHaveBeenCalledWith('update-download-progress', listener)
  })

  it('blocks update-error subscription via the generic ipcRenderer bridge before allowlisting', () => {
    // Sanity check: the generic ipcRenderer.on path enforces ON_CHANNELS membership,
    // and update-error is allowlisted (so this should NOT throw). This locks in the
    // allowlist so accidental removal causes a regression.
    const ipcRenderer = getExposedBridge<{
      on: (channel: string, listener: (...args: unknown[]) => void) => () => void
    }>('ipcRenderer')

    expect(() => ipcRenderer.on('update-error', () => undefined)).not.toThrow()
    expect(() => ipcRenderer.on('update-download-progress', () => undefined)).not.toThrow()
    expect(() => ipcRenderer.on('not-an-allowlisted-channel' as never, () => undefined)).toThrow(
      /Blocked IPC on channel/
    )
  })

  it('strips the privileged Electron event from generic subscription callbacks', () => {
    const ipcRenderer = getExposedBridge<{
      on: (channel: string, listener: (...args: unknown[]) => void) => () => void
    }>('ipcRenderer')
    const callback = vi.fn()

    const unsubscribe = ipcRenderer.on('settings:navigate', callback)
    const listener = preloadMocks.on.mock.calls.find((call) => call[0] === 'settings:navigate')?.[1]
    const privilegedEvent = { sender: { send: vi.fn() } }
    listener?.(privilegedEvent, 'providers')

    expect(callback).toHaveBeenCalledWith('providers')
    expect(callback).not.toHaveBeenCalledWith(privilegedEvent, 'providers')

    unsubscribe()
    expect(preloadMocks.off).toHaveBeenCalledWith('settings:navigate', listener)
  })
})

function getExposedBridge<T>(name: string): T {
  const bridge = preloadMocks.exposed.get(name)
  if (!bridge) {
    throw new Error(`Expected preload bridge "${name}" to be exposed`)
  }

  return bridge as T
}

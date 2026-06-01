// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('exposes a dedicated MCP bridge with invoke helpers', async () => {
    const mcp = getExposedBridge<{
      listServers: () => Promise<unknown>
      connectServer: (serverId: string) => Promise<unknown>
      listTools: (serverId?: string) => Promise<unknown>
      executeTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>
      resolveApproval: (requestId: string, approved: boolean) => Promise<unknown>
      getState: () => Promise<unknown>
    }>('mcp')

    preloadMocks.invoke
      .mockResolvedValueOnce([{ id: 'server-1' }])
      .mockResolvedValueOnce({ serverId: 'server-1', status: 'connected' })
      .mockResolvedValueOnce([{ namespacedName: 'mcp__server__read_file' }])
      .mockResolvedValueOnce({ success: true, metadata: { origin: 'mcp' } })
      .mockResolvedValueOnce({ requestId: 'approval-1', approved: true, outcome: 'approved' })
      .mockResolvedValueOnce({ servers: [], runtimeStates: [], tools: [], pendingApprovals: [] })

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
    await expect(mcp.getState()).resolves.toEqual({ servers: [], runtimeStates: [], tools: [], pendingApprovals: [] })

    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(1, 'mcp:list-servers')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(2, 'mcp:connect-server', 'server-1')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(3, 'mcp:list-tools', 'server-1')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(4, 'mcp:execute-tool', 'mcp__server__read_file', { path: 'demo.txt' })
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(5, 'mcp:resolve-approval', 'approval-1', true)
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(6, 'mcp:get-state')
  })

  it('subscribes to MCP snapshot updates and unregisters listeners', () => {
    const mcp = getExposedBridge<{
      onStateChange: (callback: (snapshot: unknown) => void) => () => void
    }>('mcp')
    const callback = vi.fn()

    const unsubscribe = mcp.onStateChange(callback)

    expect(preloadMocks.on).toHaveBeenCalledWith('mcp:state-changed', expect.any(Function))
    const listener = preloadMocks.on.mock.calls[0]?.[1]
    const snapshot = { servers: [], runtimeStates: [{ serverId: 'server-1', status: 'connected' }], tools: [] }

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

    const listener = preloadMocks.on.mock.calls.find((call) => call[0] === 'context-menu:action')?.[1]
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

    await expect(ipcRenderer.invoke('execute-tool', 'mcp__server__read_file', { path: 'demo.txt' })).resolves.toEqual({
      success: false,
      error: 'Tool "mcp__server__read_file" is disabled.',
    })
    expect(preloadMocks.invoke).not.toHaveBeenCalled()

    preloadMocks.invoke.mockResolvedValueOnce({ success: true, data: { ok: true } })
    await expect(ipcRenderer.invoke('execute-tool', 'web_search', { query: 'mcp' })).resolves.toEqual({
      success: true,
      data: { ok: true },
    })
    expect(preloadMocks.invoke).toHaveBeenCalledWith('execute-tool', 'web_search', { query: 'mcp' })
  })

  it('does not expose the deprecated terminal bridge', () => {
    expect(preloadMocks.exposed.has('terminal')).toBe(false)
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
      on: (channel: string, listener: (...args: unknown[]) => void) => void
    }>('ipcRenderer')

    expect(() => ipcRenderer.on('update-error', () => undefined)).not.toThrow()
    expect(() => ipcRenderer.on('update-download-progress', () => undefined)).not.toThrow()
    expect(() => ipcRenderer.on('not-an-allowlisted-channel' as never, () => undefined)).toThrow(
      /Blocked IPC on channel/
    )
  })
})

function getExposedBridge<T>(name: string): T {
  const bridge = preloadMocks.exposed.get(name)
  if (!bridge) {
    throw new Error(`Expected preload bridge "${name}" to be exposed`)
  }

  return bridge as T
}

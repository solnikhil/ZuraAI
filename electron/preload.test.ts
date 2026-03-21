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

  it('keeps MCP tools blocked from the generic execute-tool bridge', async () => {
    const ipcRenderer = getExposedBridge<{
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }>('ipcRenderer')

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
})

function getExposedBridge<T>(name: string): T {
  const bridge = preloadMocks.exposed.get(name)
  if (!bridge) {
    throw new Error(`Expected preload bridge "${name}" to be exposed`)
  }

  return bridge as T
}

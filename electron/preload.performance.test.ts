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

describe('preload performanceMonitor bridge', () => {
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

    await import('./preload')
  })

  it('exposes performance monitor actions and snapshot subscription', async () => {
    const bridge = getExposedBridge<{
      openWindow: () => Promise<void>
      getSnapshot: () => Promise<unknown>
      subscribe: (callback: (snapshot: unknown) => void) => () => void
      startTrace: () => Promise<unknown>
      stopTrace: () => Promise<unknown>
      exportBundle: () => Promise<unknown>
    }>('performanceMonitor')

    preloadMocks.invoke
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ sampledAt: '2026-01-01T00:00:00.000Z' })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ status: 'recording' })
      .mockResolvedValueOnce({ status: 'stopped' })
      .mockResolvedValueOnce({ canceled: false })

    await expect(bridge.openWindow()).resolves.toBeUndefined()
    await expect(bridge.getSnapshot()).resolves.toEqual({ sampledAt: '2026-01-01T00:00:00.000Z' })
    const callback = vi.fn()
    const unsubscribe = bridge.subscribe(callback)
    const listener = preloadMocks.on.mock.calls[0]?.[1]
    listener?.({}, { sampledAt: '2026-01-01T00:00:01.000Z' })
    expect(callback).toHaveBeenCalledWith({ sampledAt: '2026-01-01T00:00:01.000Z' })
    await expect(bridge.startTrace()).resolves.toEqual({ status: 'recording' })
    await expect(bridge.stopTrace()).resolves.toEqual({ status: 'stopped' })
    await expect(bridge.exportBundle()).resolves.toEqual({ canceled: false })

    unsubscribe()

    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(1, 'performance-monitor:open-window')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(2, 'performance-monitor:get-snapshot')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(3, 'performance-monitor:subscribe')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(4, 'performance-monitor:start-trace')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(5, 'performance-monitor:stop-trace')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(6, 'performance-monitor:export-bundle')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(7, 'performance-monitor:unsubscribe')
    expect(preloadMocks.removeListener).toHaveBeenCalledWith('performance-monitor:snapshot', listener)
  })
})

function getExposedBridge<T>(name: string): T {
  const bridge = preloadMocks.exposed.get(name)
  if (!bridge) {
    throw new Error(`Expected preload bridge "${name}" to be exposed`)
  }

  return bridge as T
}

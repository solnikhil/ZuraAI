import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  screen: { screenToDipRect: vi.fn((_window, bounds) => bounds) },
}))

import { TargetWindowWatcher, type TargetWindowSnapshotProvider } from './targetWatcher'
import type { BackgroundWindowSnapshot } from './types'

const snapshot: BackgroundWindowSnapshot = {
  hwnd: 42,
  processId: 100,
  processStartTimeMs: 123_000,
  title: 'Notepad',
  bounds: { x: 10, y: 20, width: 800, height: 600 },
  visible: true,
  minimized: false,
}

describe('TargetWindowWatcher', () => {
  it('publishes updates and stops polling after target identity changes', async () => {
    vi.useFakeTimers()
    const provider: TargetWindowSnapshotProvider = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ ...snapshot, bounds: { ...snapshot.bounds, x: 50 } })
        .mockResolvedValueOnce({ ...snapshot, processStartTimeMs: 999_000 }),
    }
    const watcher = new TargetWindowWatcher({ provider, intervalMs: 200 })
    const onSnapshot = vi.fn()
    const onLost = vi.fn()

    watcher.start(snapshot, onSnapshot, onLost, snapshot)
    expect(onSnapshot).toHaveBeenCalledWith(snapshot)
    await vi.advanceTimersByTimeAsync(200)
    expect(onSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ bounds: expect.objectContaining({ x: 50 }) })
    )
    await vi.advanceTimersByTimeAsync(200)
    expect(onLost).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(provider.read).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('does not publish an in-flight result after stop', async () => {
    vi.useFakeTimers()
    let resolveRead: ((value: BackgroundWindowSnapshot) => void) | undefined
    const provider: TargetWindowSnapshotProvider = {
      read: vi.fn(() => new Promise((resolve) => (resolveRead = resolve))),
    }
    const watcher = new TargetWindowWatcher({ provider, intervalMs: 200 })
    const onSnapshot = vi.fn()
    const onLost = vi.fn()
    watcher.start(snapshot, onSnapshot, onLost)
    await vi.advanceTimersByTimeAsync(200)
    watcher.stop()
    resolveRead?.(snapshot)
    await Promise.resolve()
    expect(onSnapshot).not.toHaveBeenCalled()
    expect(onLost).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

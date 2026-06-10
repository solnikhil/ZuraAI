import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResourceSample } from '../electron/types'

import { useResourceMetrics } from './useResourceMetrics'

function makeSample(overrides: Partial<ResourceSample> = {}): ResourceSample {
  return {
    capturedAt: Date.now(),
    processes: [
      {
        pid: 1,
        type: 'Browser',
        rawType: 'Browser',
        name: 'Main',
        memoryMB: 120.5,
        peakMemoryMB: 200,
        cpuPercent: 1.5,
      },
      {
        pid: 2,
        type: 'Tab',
        rawType: 'Tab',
        name: 'Renderer',
        memoryMB: 80,
        peakMemoryMB: 100,
        cpuPercent: 4.5,
      },
    ],
    ...overrides,
  }
}

describe('useResourceMetrics', () => {
  let listeners: Array<(sample: ResourceSample) => void> = []
  let unsubscribe: ReturnType<typeof vi.fn>
  let getNow: ReturnType<typeof vi.fn>

  beforeEach(() => {
    listeners = []
    unsubscribe = vi.fn()
    getNow = vi.fn().mockResolvedValue(makeSample())
    Object.defineProperty(window, 'resourceMonitor', {
      configurable: true,
      writable: true,
      value: {
        getNow,
        subscribe: (cb: (sample: ResourceSample) => void) => {
          listeners.push(cb)
          return unsubscribe
        },
      },
    })
  })

  afterEach(() => {
    delete (window as unknown as { resourceMonitor?: unknown }).resourceMonitor
    vi.useRealTimers()
  })

  it('returns no-op state when bridge is missing', () => {
    delete (window as unknown as { resourceMonitor?: unknown }).resourceMonitor
    const { result } = renderHook(() => useResourceMetrics())
    expect(result.current.isAvailable).toBe(false)
    expect(result.current.sample).toBeNull()
    expect(result.current.totals.processCount).toBe(0)
  })

  it('subscribes on mount and unsubscribes on unmount', async () => {
    const { unmount, result } = renderHook(() => useResourceMetrics())
    // Flush the initial getNow promise.
    await act(async () => {})
    expect(result.current.isAvailable).toBe(true)
    expect(listeners).toHaveLength(1)

    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('computes totals from the latest streamed sample', async () => {
    const { result } = renderHook(() => useResourceMetrics())
    await act(async () => {})

    act(() => {
      listeners[0]?.(makeSample())
    })

    expect(result.current.totals.totalMemoryMB).toBeCloseTo(200.5, 1)
    expect(result.current.totals.totalCpuPercent).toBeCloseTo(6, 1)
    expect(result.current.totals.processCount).toBe(2)
    expect(result.current.isStale).toBe(false)
  })

  it('flips isStale once the latest sample is older than the threshold', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useResourceMetrics())
    await act(async () => {})

    act(() => {
      listeners[0]?.(makeSample())
    })
    expect(result.current.isStale).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000)
    })

    expect(result.current.isStale).toBe(true)
  })
})

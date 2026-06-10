// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { __test__, normalizeMetric, type RawProcessMetric } from './resourceMonitor'

const { buildResourceMonitor, kbToMb, clampPercent, classifyType } = __test__

function makeMetric(overrides: Partial<RawProcessMetric> = {}): RawProcessMetric {
  return {
    pid: 1234,
    type: 'Browser',
    name: 'Main',
    memory: { workingSetSize: 102400, peakWorkingSetSize: 204800 },
    cpu: { percentCPUUsage: 1.234 },
    ...overrides,
  }
}

describe('resourceMonitor unit helpers', () => {
  it('kbToMb rounds to one decimal and clamps non-positive', () => {
    expect(kbToMb(102400)).toBe(100)
    expect(kbToMb(102450)).toBe(100) // 100.0439...
    expect(kbToMb(0)).toBe(0)
    expect(kbToMb(-50)).toBe(0)
    expect(kbToMb(Number.NaN)).toBe(0)
  })

  it('clampPercent rejects junk and rounds to one decimal', () => {
    expect(clampPercent(12.345)).toBe(12.3)
    expect(clampPercent(-5)).toBe(0)
    expect(clampPercent(Number.NaN)).toBe(0)
  })

  it('classifyType maps known values and falls back to Unknown', () => {
    expect(classifyType('Tab')).toBe('Tab')
    expect(classifyType('Browser')).toBe('Browser')
    expect(classifyType('GPU')).toBe('GPU')
    expect(classifyType('Mystery')).toBe('Unknown')
  })

  it('normalizeMetric produces renderer-safe shape', () => {
    const sample = normalizeMetric(makeMetric({ type: 'Tab' }), 'Main Window')
    expect(sample).toMatchObject({
      pid: 1234,
      type: 'Tab',
      rawType: 'Tab',
      name: 'Main',
      memoryMB: 100,
      peakMemoryMB: 200,
      cpuPercent: 1.2,
      windowTitle: 'Main Window',
    })
  })

  it('normalizeMetric falls back to type label when name is missing', () => {
    const sample = normalizeMetric(
      makeMetric({ type: 'GPU', name: undefined, serviceName: undefined })
    )
    expect(sample.name).toBe('GPU')
    expect(sample.windowTitle).toBeUndefined()
  })
})

describe('resourceMonitor runtime', () => {
  function setupRuntime(metrics: RawProcessMetric[] = [makeMetric()]) {
    const setIntervalImpl = vi.fn(() => 'timer-id' as unknown as ReturnType<typeof setInterval>)
    const clearIntervalImpl = vi.fn()
    const runtime = buildResourceMonitor({
      getAppMetrics: () => metrics,
      listWindows: () => [],
      setIntervalImpl: setIntervalImpl as unknown as typeof setInterval,
      clearIntervalImpl: clearIntervalImpl as unknown as typeof clearInterval,
      sampleIntervalMs: 50,
    })
    return { runtime, setIntervalImpl, clearIntervalImpl }
  }

  function fakeWebContents() {
    let destroyed = false
    const listeners = new Map<string, Array<() => void>>()
    const wc = {
      id: Math.floor(Math.random() * 10_000),
      isDestroyed: () => destroyed,
      send: vi.fn(),
      once: vi.fn((event: string, listener: () => void) => {
        const arr = listeners.get(event) ?? []
        arr.push(listener)
        listeners.set(event, arr)
      }),
      __destroy: () => {
        destroyed = true
        for (const listener of listeners.get('destroyed') ?? []) listener()
      },
    }
    return wc as unknown as Electron.WebContents & { __destroy: () => void; send: ReturnType<typeof vi.fn> }
  }

  it('starts the interval on first subscribe and stops on last unsubscribe', () => {
    const { runtime, setIntervalImpl, clearIntervalImpl } = setupRuntime()
    expect(runtime.isRunning()).toBe(false)

    const a = fakeWebContents()
    runtime.addSubscriber(a)
    expect(runtime.isRunning()).toBe(true)
    expect(setIntervalImpl).toHaveBeenCalledTimes(1)

    const b = fakeWebContents()
    runtime.addSubscriber(b)
    expect(setIntervalImpl).toHaveBeenCalledTimes(1) // already running

    runtime.removeSubscriber(a)
    expect(runtime.isRunning()).toBe(true)
    expect(clearIntervalImpl).not.toHaveBeenCalled()

    runtime.removeSubscriber(b)
    expect(runtime.isRunning()).toBe(false)
    expect(clearIntervalImpl).toHaveBeenCalledTimes(1)
  })

  it('auto-removes destroyed webContents and stops the interval', () => {
    const { runtime, clearIntervalImpl } = setupRuntime()
    const a = fakeWebContents()
    runtime.addSubscriber(a)
    expect(runtime.subscriberCount()).toBe(1)

    a.__destroy()
    expect(runtime.subscriberCount()).toBe(0)
    expect(clearIntervalImpl).toHaveBeenCalledTimes(1)
  })

  it('sampleNow returns normalized samples', () => {
    const { runtime } = setupRuntime([
      makeMetric({ pid: 1, type: 'Browser' }),
      makeMetric({ pid: 2, type: 'GPU', memory: { workingSetSize: 51200, peakWorkingSetSize: 51200 } }),
    ])

    const sample = runtime.sampleNow()
    expect(sample.processes).toHaveLength(2)
    expect(sample.processes[0]?.type).toBe('Browser')
    expect(sample.processes[1]?.memoryMB).toBe(50)
    expect(typeof sample.capturedAt).toBe('number')
  })

  it('sampleNow tolerates getAppMetrics throwing', () => {
    const runtime = buildResourceMonitor({
      getAppMetrics: () => {
        throw new Error('boom')
      },
      listWindows: () => [],
      setIntervalImpl: vi.fn() as unknown as typeof setInterval,
      clearIntervalImpl: vi.fn() as unknown as typeof clearInterval,
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const sample = runtime.sampleNow()
    expect(sample.processes).toEqual([])
    warnSpy.mockRestore()
  })
})

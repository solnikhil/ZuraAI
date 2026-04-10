// @vitest-environment node

import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => {
  const app = {
    on: vi.fn(),
    off: vi.fn(),
    getAppMetrics: vi.fn(),
    getGPUFeatureStatus: vi.fn(),
    getGPUInfo: vi.fn(),
    getPath: vi.fn(),
    getName: vi.fn(),
    getVersion: vi.fn(),
    isPackaged: false,
  }

  return {
    app,
    BrowserWindow: {
      getAllWindows: vi.fn(() => []),
    },
    contentTracing: {
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
    },
    dialog: {
      showOpenDialog: vi.fn(),
    },
  }
})

vi.mock('electron', () => electronMocks)

import {
  PerformanceMonitorService,
  classifyProcessMetric,
  createGpuInfoState,
  normalizeProcessMetric,
  pushBoundedHistory,
} from './performanceMonitor'

function makeMetric(overrides: Record<string, unknown> = {}) {
  return {
    pid: 101,
    type: 'Browser',
    creationTime: 123,
    sandboxed: false,
    serviceName: '',
    cpu: {
      percentCPUUsage: 12.34,
      idleWakeupsPerSecond: 1.2,
    },
    memory: {
      workingSetSize: 512 * 1024 * 1024,
      peakWorkingSetSize: 640 * 1024 * 1024,
      privateBytes: 300 * 1024 * 1024,
      sharedBytes: 64 * 1024 * 1024,
    },
    ...overrides,
  }
}

describe('performanceMonitor service', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    electronMocks.app.getAppMetrics.mockReturnValue([makeMetric()])
    electronMocks.app.getGPUFeatureStatus.mockReturnValue({ compositing: 'enabled' })
    electronMocks.app.getGPUInfo.mockResolvedValue({ auxAttributes: { glVersion: '1.0' } })
    electronMocks.app.getPath.mockImplementation((key: string) => {
      if (key === 'temp') return os.tmpdir()
      return os.tmpdir()
    })
    electronMocks.app.getName.mockReturnValue('ZuraAI')
    electronMocks.app.getVersion.mockReturnValue('0.0.4')
    electronMocks.contentTracing.startRecording.mockResolvedValue(undefined)
    electronMocks.contentTracing.stopRecording.mockImplementation(async (tracePath: string) => {
      await fs.writeFile(tracePath, '{"trace":true}', 'utf8')
      return tracePath
    })
    electronMocks.dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [],
    })
  })

  it('normalizes process metrics into stable groups', () => {
    expect(classifyProcessMetric({ type: 'Browser', serviceName: '' })).toBe('main')
    expect(classifyProcessMetric({ type: 'GPU', serviceName: '' })).toBe('gpu')
    expect(classifyProcessMetric({ type: 'Tab', serviceName: '' })).toBe('renderer')
    expect(classifyProcessMetric({ type: 'Utility', serviceName: 'Network Service' })).toBe('network')
    expect(classifyProcessMetric({ type: 'Utility', serviceName: 'IndexedDB Storage' })).toBe('storage')
    expect(classifyProcessMetric({ type: 'Utility', serviceName: 'Audio Service' })).toBe('network')
  })

  it('builds renderer rows with discoverable window labels', () => {
    const row = normalizeProcessMetric(
      makeMetric({ pid: 500, type: 'Tab', name: 'Dashboard Renderer' }) as never,
      new Map([[500, { label: 'Performance window', windowTitle: 'Performance Monitor', windowRoute: '/performance' }]])
    )

    expect(row.group).toBe('renderer')
    expect(row.label).toBe('Performance window')
    expect(row.windowRoute).toBe('/performance')
    expect(row.workingSetSizeKb).toBeGreaterThan(0)
  })

  it('retains only the bounded history tail', () => {
    expect(pushBoundedHistory([1, 2, 3], 4, 3)).toEqual([2, 3, 4])
  })

  it('degrades cleanly when GPU info is unavailable', async () => {
    electronMocks.app.getGPUInfo.mockRejectedValue(new Error('GPU info unavailable'))
    const service = new PerformanceMonitorService()

    await service.refreshGpuInfo()

    const snapshot = await service.getSnapshot()
    expect(snapshot.gpu.infoStatus).toBe('unavailable')
    expect(snapshot.gpu.error).toContain('GPU info unavailable')

    service.dispose()
  })

  it('rejects invalid trace state transitions', async () => {
    const service = new PerformanceMonitorService({ now: () => 1000 })

    await expect(service.stopTrace()).rejects.toThrow('Trace recording is not active')

    await service.startTrace()
    await expect(service.startTrace()).rejects.toThrow('Trace recording is already active')

    service.dispose()
  })

  it('publishes snapshots on cadence to subscribers', async () => {
    vi.useFakeTimers()
    let now = 1000
    const service = new PerformanceMonitorService({
      samplingIntervalMs: 1000,
      now: () => now,
    })
    const subscriber = {
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
      once: vi.fn(),
    }

    service.subscribe(subscriber as never)
    await Promise.resolve()

    expect(subscriber.send).toHaveBeenCalledTimes(1)

    now += 1000
    await vi.advanceTimersByTimeAsync(1000)

    expect(subscriber.send).toHaveBeenCalledTimes(2)

    service.unsubscribe(subscriber as never)
    service.dispose()
  })

  it('exports summary and raw diagnostics artifacts', async () => {
    let now = 1_700_000_000_000
    const exportRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zura-diagnostics-test-'))
    electronMocks.dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [exportRoot],
    })

    const service = new PerformanceMonitorService({
      now: () => now,
    })

    await service.startTrace()
    now += 4000
    await service.stopTrace()
    const result = await service.exportBundle()

    expect(result.canceled).toBe(false)
    expect(result.bundlePath).toBeTruthy()
    expect(result.files.summaryJson).toBeTruthy()
    expect(result.files.summaryMarkdown).toBeTruthy()
    expect(result.files.metricsJson).toBeTruthy()
    expect(result.files.traceJson).toBeTruthy()

    const summaryJson = await fs.readFile(result.files.summaryJson!, 'utf8')
    const metricsJson = await fs.readFile(result.files.metricsJson!, 'utf8')
    const traceJson = await fs.readFile(result.files.traceJson!, 'utf8')

    expect(summaryJson).toContain('"probableHotspots"')
    expect(metricsJson).toContain('"sampledAt"')
    expect(traceJson).toContain('"trace":true')

    service.dispose()
  })

  it('creates explicit GPU fallback payloads', () => {
    expect(
      createGpuInfoState(null, null, 'pending', null, null)
    ).toEqual({
      featureStatus: {},
      info: null,
      infoStatus: 'pending',
      error: null,
      lastUpdatedAt: null,
    })
  })
})

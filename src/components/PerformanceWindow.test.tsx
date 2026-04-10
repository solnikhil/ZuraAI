import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: any }) => <div>{children}</div>,
  LineChart: ({ children }: { children: any }) => <div>{children}</div>,
  Line: () => <div />,
  CartesianGrid: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
}))

import PerformanceWindow from './PerformanceWindow'
import type { DiagnosticsSnapshot } from '../performance/types'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const baseSnapshot: DiagnosticsSnapshot = {
  sampledAt: '2026-04-10T12:00:00.000Z',
  overview: {
    app: {
      appName: 'ZuraAI',
      appVersion: '0.0.4',
      channel: 'Installed build',
      isPackaged: true,
      electronVersion: '41.1.0',
      chromiumVersion: '141.0.0.0',
      nodeVersion: '25.0.0',
      v8Version: '13.0.0',
      osVersion: 'Windows 11 10.0.22631 (x64)',
      commitHash: 'abcdef123',
      commitDate: '2026-04-10',
    },
    platform: 'win32',
    arch: 'x64',
    uptimeSeconds: 321,
    sampledAt: '2026-04-10T12:00:00.000Z',
    samplingIntervalMs: 1000,
    isSampling: true,
    processCount: 3,
  },
  totals: {
    cpuPercent: 34.5,
    workingSetSizeKb: 900_000,
    privateBytesKb: 700_000,
    sharedBytesKb: 120_000,
  },
  processes: [
    {
      id: 'Browser:1',
      pid: 1,
      group: 'main',
      type: 'Browser',
      cpuPercent: 10.2,
      idleWakeupsPerSecond: 1.1,
      workingSetSizeKb: 350_000,
      peakWorkingSetSizeKb: 400_000,
      privateBytesKb: 250_000,
      sharedBytesKb: 30_000,
      creationTime: 1,
      sandboxed: false,
      serviceName: null,
      name: null,
      label: 'Main process',
      windowTitle: null,
      windowRoute: null,
    },
    {
      id: 'Tab:2',
      pid: 2,
      group: 'renderer',
      type: 'Tab',
      cpuPercent: 15.6,
      idleWakeupsPerSecond: 2.4,
      workingSetSizeKb: 420_000,
      peakWorkingSetSizeKb: 470_000,
      privateBytesKb: 330_000,
      sharedBytesKb: 50_000,
      creationTime: 2,
      sandboxed: true,
      serviceName: null,
      name: 'Dashboard Renderer',
      label: 'Dashboard',
      windowTitle: 'ZuraAI - Dashboard',
      windowRoute: '/dashboard',
    },
  ],
  history: [
    {
      sampledAt: '2026-04-10T11:59:00.000Z',
      totalCpuPercent: 21,
      totalWorkingSetSizeKb: 800_000,
      totalPrivateBytesKb: 620_000,
      rendererWorkingSetSizeKb: 360_000,
      gpuWorkingSetSizeKb: 60_000,
    },
    {
      sampledAt: '2026-04-10T12:00:00.000Z',
      totalCpuPercent: 34.5,
      totalWorkingSetSizeKb: 900_000,
      totalPrivateBytesKb: 700_000,
      rendererWorkingSetSizeKb: 420_000,
      gpuWorkingSetSizeKb: 70_000,
    },
  ],
  gpu: {
    featureStatus: { compositing: 'enabled' },
    info: { gpuDevice: [{ vendorId: 1234 }] },
    infoStatus: 'ready',
    lastUpdatedAt: '2026-04-10T12:00:00.000Z',
    error: null,
  },
  trace: {
    status: 'idle',
    startedAt: null,
    stoppedAt: null,
    elapsedMs: 0,
    categories: ['blink'],
    tracePath: null,
    estimatedTraceSizeBytes: null,
    lastError: null,
  },
}

describe('PerformanceWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  it('renders loading state before the first snapshot arrives', async () => {
    let resolveSnapshot: ((value: DiagnosticsSnapshot) => void) | null = null
    window.performanceMonitor = {
      openWindow: vi.fn(),
      getSnapshot: vi.fn(
        () => new Promise<DiagnosticsSnapshot>((resolve) => {
          resolveSnapshot = resolve
        })
      ),
      subscribe: vi.fn(() => () => undefined),
      startTrace: vi.fn(),
      stopTrace: vi.fn(),
      exportBundle: vi.fn(),
    }

    render(<PerformanceWindow />)

    expect(screen.getByText('Loading live diagnostics...')).toBeInTheDocument()

    await act(async () => {
      resolveSnapshot?.(baseSnapshot)
    })
  })

  it('renders live data and trace recording state', async () => {
    window.performanceMonitor = {
      openWindow: vi.fn(),
      getSnapshot: vi.fn().mockResolvedValue({
        ...baseSnapshot,
        trace: {
          ...baseSnapshot.trace,
          status: 'recording',
          startedAt: '2026-04-10T12:00:00.000Z',
          elapsedMs: 42_000,
        },
      }),
      subscribe: vi.fn(() => () => undefined),
      startTrace: vi.fn(),
      stopTrace: vi.fn(),
      exportBundle: vi.fn(),
    }

    render(<PerformanceWindow />)

    await waitFor(() => {
      expect(screen.queryByText('Loading live diagnostics...')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Start trace' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Stop trace' })).not.toBeDisabled()
    expect(screen.getAllByText(/Total CPU/).length).toBeGreaterThan(0)
    expect(screen.getByText('Process Table')).toBeInTheDocument()
  })

  it('shows explicit GPU fallback text when metrics are unavailable', async () => {
    window.performanceMonitor = {
      openWindow: vi.fn(),
      getSnapshot: vi.fn().mockResolvedValue({
        ...baseSnapshot,
        gpu: {
          ...baseSnapshot.gpu,
          info: null,
          infoStatus: 'unavailable',
          error: 'GPU info unavailable',
        },
      }),
      subscribe: vi.fn(() => () => undefined),
      startTrace: vi.fn(),
      stopTrace: vi.fn(),
      exportBundle: vi.fn(),
    }

    render(<PerformanceWindow />)

    expect(await screen.findByText(/GPU diagnostics unavailable:/)).toHaveTextContent(
      'GPU diagnostics unavailable: GPU info unavailable'
    )
  })

  it('renders export-ready metadata after exporting a bundle', async () => {
    window.performanceMonitor = {
      openWindow: vi.fn(),
      getSnapshot: vi.fn().mockResolvedValue(baseSnapshot),
      subscribe: vi.fn(() => () => undefined),
      startTrace: vi.fn(),
      stopTrace: vi.fn(),
      exportBundle: vi.fn().mockResolvedValue({
        canceled: false,
        bundlePath: 'C:/exports/zura-diagnostics-1',
        exportedAt: '2026-04-10T12:10:00.000Z',
        files: {
          summaryJson: 'C:/exports/zura-diagnostics-1/summary.json',
          summaryMarkdown: 'C:/exports/zura-diagnostics-1/summary.md',
          metricsJson: 'C:/exports/zura-diagnostics-1/metrics.json',
          traceJson: 'C:/exports/zura-diagnostics-1/trace.json',
        },
        unavailable: [],
      }),
    }

    render(<PerformanceWindow />)

    await screen.findByText('Performance Monitor')
    fireEvent.click(screen.getByRole('button', { name: 'Export diagnostics bundle' }))

    await waitFor(() => {
      expect(screen.getByText('Last Export')).toBeInTheDocument()
    })

    expect(screen.getByText('Bundle: C:/exports/zura-diagnostics-1')).toBeInTheDocument()
  })
})

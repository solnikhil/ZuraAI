import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ResourceSample } from '@/electron/types'

import { ResourceMonitorSection } from './ResourceMonitorSection'

vi.mock('@/performance/useResourceMetrics', () => ({
  useResourceMetrics: vi.fn(),
}))

import { useResourceMetrics } from '@/performance/useResourceMetrics'

const mocked = vi.mocked(useResourceMetrics)

function makeSample(): ResourceSample {
  return {
    capturedAt: 1_700_000_000_000,
    processes: [
      {
        pid: 100,
        type: 'Browser',
        rawType: 'Browser',
        name: 'Main',
        memoryMB: 250,
        peakMemoryMB: 300,
        cpuPercent: 1.0,
      },
      {
        pid: 200,
        type: 'Tab',
        rawType: 'Tab',
        name: 'Renderer A',
        memoryMB: 180,
        peakMemoryMB: 200,
        cpuPercent: 4.5,
      },
      {
        pid: 201,
        type: 'Tab',
        rawType: 'Tab',
        name: 'Renderer B',
        memoryMB: 120,
        peakMemoryMB: 150,
        cpuPercent: 2.0,
      },
      {
        pid: 300,
        type: 'GPU',
        rawType: 'GPU',
        name: 'GPU Process',
        memoryMB: 60,
        peakMemoryMB: 80,
        cpuPercent: 0.3,
      },
    ],
  }
}

describe('ResourceMonitorSection', () => {
  afterEach(() => {
    mocked.mockReset()
  })

  it('shows an unavailable message when the bridge is missing', () => {
    mocked.mockReturnValue({
      sample: null,
      lastUpdatedMs: null,
      isStale: false,
      isAvailable: false,
      isPaused: false,
      refreshNow: vi.fn(),
      totals: { totalMemoryMB: 0, totalCpuPercent: 0, processCount: 0 },
    })

    render(<ResourceMonitorSection />)
    expect(
      screen.getByText('Resource Monitor is only available inside the ZuraAI desktop app.')
    ).toBeInTheDocument()
  })

  it('groups processes and shows totals + a stale badge when isStale', () => {
    mocked.mockReturnValue({
      sample: makeSample(),
      lastUpdatedMs: 1_700_000_000_000,
      isStale: true,
      isAvailable: true,
      isPaused: false,
      refreshNow: vi.fn(),
      totals: { totalMemoryMB: 610, totalCpuPercent: 7.8, processCount: 4 },
    })

    render(<ResourceMonitorSection />)

    expect(screen.getByText('Stale')).toBeInTheDocument()
    // "Renderer" label appears in the group header AND in the Type column for each Tab row.
    expect(screen.getAllByText(/^Renderer$/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Renderer A')).toBeInTheDocument()
    expect(screen.getByText('Renderer B')).toBeInTheDocument()
    expect(screen.getByText('GPU Process')).toBeInTheDocument()
    // Totals appear in summary and footer; check at least one occurrence.
    expect(screen.getAllByText('610.0 MB').length).toBeGreaterThan(0)
    expect(screen.getAllByText('7.8%').length).toBeGreaterThan(0)
  })

  it('renders a loading state when bridge is available but no sample yet', () => {
    mocked.mockReturnValue({
      sample: null,
      lastUpdatedMs: null,
      isStale: false,
      isAvailable: true,
      isPaused: false,
      refreshNow: vi.fn(),
      totals: { totalMemoryMB: 0, totalCpuPercent: 0, processCount: 0 },
    })

    render(<ResourceMonitorSection />)
    expect(screen.getByText(/Loading process metrics/)).toBeInTheDocument()
  })

  it('marks numeric column headers and uses scope=col', () => {
    mocked.mockReturnValue({
      sample: makeSample(),
      lastUpdatedMs: Date.now(),
      isStale: false,
      isAvailable: true,
      isPaused: false,
      refreshNow: vi.fn(),
      totals: { totalMemoryMB: 610, totalCpuPercent: 7.8, processCount: 4 },
    })

    render(<ResourceMonitorSection />)
    for (const header of ['PID', 'Type', 'Name', 'Memory', 'CPU']) {
      const el = screen.getByRole('columnheader', { name: header })
      expect(el).toHaveAttribute('scope', 'col')
    }
  })
})

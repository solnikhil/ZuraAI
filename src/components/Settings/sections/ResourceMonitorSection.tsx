import React, { useEffect, useMemo, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Activity, Copy, RotateCcw } from '@/components/icons'
import { useResourceMetrics } from '@/performance/useResourceMetrics'
import type { ProcessSample, ProcessSampleType, ResourceSample } from '@/electron/types'

import './ResourceMonitorSection.css'

const memoryFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const wholeFormatter = new Intl.NumberFormat()

const TYPE_GROUP_ORDER: ProcessSampleType[] = [
  'Browser',
  'Tab',
  'GPU',
  'Utility',
  'Sandbox helper',
  'Zygote',
  'Unknown',
]

const TYPE_LABELS: Record<ProcessSampleType, string> = {
  Browser: 'Main',
  Tab: 'Renderer',
  GPU: 'GPU',
  Utility: 'Utility',
  'Sandbox helper': 'Sandbox',
  Zygote: 'Zygote',
  Unknown: 'Other',
}

interface ProcessGroup {
  type: ProcessSampleType
  label: string
  rows: ProcessSample[]
  totalMemoryMB: number
  totalCpuPercent: number
}

function groupProcesses(processes: ProcessSample[]): ProcessGroup[] {
  const groups = new Map<ProcessSampleType, ProcessGroup>()
  for (const process of processes) {
    const existing = groups.get(process.type)
    if (existing) {
      existing.rows.push(process)
      existing.totalMemoryMB += process.memoryMB
      existing.totalCpuPercent += process.cpuPercent
    } else {
      groups.set(process.type, {
        type: process.type,
        label: TYPE_LABELS[process.type] ?? process.type,
        rows: [process],
        totalMemoryMB: process.memoryMB,
        totalCpuPercent: process.cpuPercent,
      })
    }
  }
  for (const group of groups.values()) {
    group.rows.sort((a, b) => b.memoryMB - a.memoryMB)
  }

  return TYPE_GROUP_ORDER
    .map((type) => groups.get(type))
    .filter((group): group is ProcessGroup => Boolean(group))
}

function formatMemoryMB(value: number): string {
  return `${memoryFormatter.format(value)} MB`
}

function formatCpuPercent(value: number): string {
  return `${memoryFormatter.format(value)}%`
}

function formatDelta(value: number, suffix: string): string {
  const rounded = Math.round(value * 10) / 10
  if (Math.abs(rounded) < 0.1) return `0.0 ${suffix}`
  return `${rounded > 0 ? '+' : ''}${memoryFormatter.format(rounded)} ${suffix}`
}

function getMetricLevel(kind: 'memory' | 'cpu', value: number): 'normal' | 'warning' | 'high' {
  if (kind === 'memory') {
    if (value >= 1500) return 'high'
    if (value >= 1000) return 'warning'
    return 'normal'
  }
  if (value >= 80) return 'high'
  if (value >= 35) return 'warning'
  return 'normal'
}

function buildReport(
  sample: ResourceSample,
  totals: { totalMemoryMB: number; totalCpuPercent: number; processCount: number }
): string {
  const lines = [
    `ZuraAI Resource Monitor - ${new Date(sample.capturedAt).toLocaleString()}`,
    `Total memory: ${formatMemoryMB(totals.totalMemoryMB)}`,
    `Total CPU: ${formatCpuPercent(totals.totalCpuPercent)}`,
    `Processes: ${wholeFormatter.format(totals.processCount)}`,
    '',
    'PID\tType\tName\tMemory\tCPU',
  ]

  for (const process of [...sample.processes].sort((a, b) => b.memoryMB - a.memoryMB)) {
    lines.push(
      [
        process.pid,
        TYPE_LABELS[process.type] ?? process.type,
        process.windowTitle ? `${process.name} (${process.windowTitle})` : process.name,
        formatMemoryMB(process.memoryMB),
        formatCpuPercent(process.cpuPercent),
      ].join('\t')
    )
  }

  return lines.join('\n')
}

function DeltaValue({ value, suffix }: { value: number | null; suffix: string }): React.ReactElement | null {
  if (value === null) return null
  const rounded = Math.round(value * 10) / 10
  const direction = Math.abs(rounded) < 0.1 ? 'neutral' : rounded > 0 ? 'up' : 'down'
  return (
    <span className={`resource-monitor__delta resource-monitor__delta--${direction}`}>
      {formatDelta(rounded, suffix)}
    </span>
  )
}

interface MemoryBarProps {
  valueMB: number
  maxMB: number
  deltaMB: number | null
  label: string
}

function MemoryBar({ valueMB, maxMB, deltaMB, label }: MemoryBarProps): React.ReactElement {
  const ratio = maxMB > 0 ? Math.min(1, valueMB / maxMB) : 0
  return (
    <div className="resource-monitor__memory-cell">
      <span className="resource-monitor__memory-value">
        {formatMemoryMB(valueMB)}
        <DeltaValue value={deltaMB} suffix="MB" />
      </span>
      <div
        className="resource-monitor__memory-bar"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(maxMB)}
        aria-valuenow={Math.round(valueMB)}
      >
        <div
          className="resource-monitor__memory-bar-fill"
          style={{ width: `${(ratio * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  )
}

export function ResourceMonitorSection(): React.ReactElement {
  const { sample, totals, isStale, isAvailable, isPaused, lastUpdatedMs, refreshNow } =
    useResourceMetrics()
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const previousSampleRef = useRef<ResourceSample | null>(null)
  const previousSample = previousSampleRef.current

  useEffect(() => {
    if (sample) previousSampleRef.current = sample
  }, [sample])

  const groups = useMemo(() => groupProcesses(sample?.processes ?? []), [sample])

  const previousByPid = useMemo(() => {
    const previous = new Map<number, ProcessSample>()
    for (const process of previousSample?.processes ?? []) {
      previous.set(process.pid, process)
    }
    return previous
  }, [previousSample])

  const maxProcessMemoryMB = useMemo(
    () => Math.max(0, ...(sample?.processes.map((process) => process.memoryMB) ?? [])),
    [sample]
  )

  const previousTotals = useMemo(() => {
    let totalMemoryMB = 0
    let totalCpuPercent = 0
    for (const process of previousSample?.processes ?? []) {
      totalMemoryMB += process.memoryMB
      totalCpuPercent += process.cpuPercent
    }
    return {
      totalMemoryMB: Math.round(totalMemoryMB * 10) / 10,
      totalCpuPercent: Math.round(totalCpuPercent * 10) / 10,
    }
  }, [previousSample])

  const lastUpdatedLabel = useMemo(() => {
    if (lastUpdatedMs === null) return null
    try {
      return new Date(lastUpdatedMs).toLocaleTimeString()
    } catch {
      return null
    }
  }, [lastUpdatedMs])

  const report = useMemo(() => {
    if (!sample) return ''
    return buildReport(sample, totals)
  }, [sample, totals])

  const handleRefresh = () => {
    void refreshNow()
  }

  const handleCopyReport = () => {
    if (!report || !navigator.clipboard?.writeText) return
    void navigator.clipboard
      .writeText(report)
      .then(() => {
        setCopyState('copied')
        window.setTimeout(() => setCopyState('idle'), 1500)
      })
      .catch(() => {
        setCopyState('error')
        window.setTimeout(() => setCopyState('idle'), 2000)
      })
  }

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">
          <span className="resource-monitor__title-icon" aria-hidden="true">
            <Activity size={20} />
          </span>
          Resource Monitor
        </h2>
        <div className="page-subtitle">
          Live memory and CPU usage for ZuraAI processes. Sampling pauses when this panel is hidden.
        </div>
      </div>

      <div className="resource-monitor">
        <div className="resource-monitor__summary" aria-live="polite">
          <div
            className={`resource-monitor__summary-item resource-monitor__summary-item--${getMetricLevel(
              'memory',
              totals.totalMemoryMB
            )}`}
          >
            <span className="resource-monitor__summary-label">Total memory</span>
            <span className="resource-monitor__summary-value">
              {formatMemoryMB(totals.totalMemoryMB)}
            </span>
            <DeltaValue
              value={previousSample ? totals.totalMemoryMB - previousTotals.totalMemoryMB : null}
              suffix="MB"
            />
          </div>
          <div
            className={`resource-monitor__summary-item resource-monitor__summary-item--${getMetricLevel(
              'cpu',
              totals.totalCpuPercent
            )}`}
          >
            <span className="resource-monitor__summary-label">Total CPU</span>
            <span className="resource-monitor__summary-value">
              {formatCpuPercent(totals.totalCpuPercent)}
            </span>
            <DeltaValue
              value={previousSample ? totals.totalCpuPercent - previousTotals.totalCpuPercent : null}
              suffix="%"
            />
          </div>
          <div className="resource-monitor__summary-item">
            <span className="resource-monitor__summary-label">Processes</span>
            <span className="resource-monitor__summary-value">
              {wholeFormatter.format(totals.processCount)}
            </span>
          </div>
          <div className="resource-monitor__summary-spacer" />
          {lastUpdatedLabel && (
            <span className="resource-monitor__updated">Updated {lastUpdatedLabel}</span>
          )}
          {isPaused && (
            <Badge variant="secondary" className="resource-monitor__stale-badge">
              Paused
            </Badge>
          )}
          {isStale && (
            <Badge variant="secondary" className="resource-monitor__stale-badge">
              Stale
            </Badge>
          )}
          <div className="resource-monitor__actions">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="resource-monitor__action"
              onClick={handleRefresh}
              disabled={!isAvailable}
            >
              <RotateCcw size={13} />
              Refresh
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="resource-monitor__action"
              onClick={handleCopyReport}
              disabled={!sample || !navigator.clipboard?.writeText}
            >
              <Copy size={13} />
              {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy'}
            </Button>
          </div>
        </div>

        {!isAvailable && (
          <div className="resource-monitor__empty">
            Resource Monitor is only available inside the ZuraAI desktop app.
          </div>
        )}

        {isAvailable && sample === null && (
          <div className="resource-monitor__empty">Loading process metrics...</div>
        )}

        {isAvailable && sample !== null && groups.length === 0 && (
          <div className="resource-monitor__empty">No process metrics reported yet.</div>
        )}

        {groups.length > 0 && (
          <div className="resource-monitor__table-wrapper">
            <table className="resource-monitor__table">
              <thead>
                <tr>
                  <th scope="col">PID</th>
                  <th scope="col">Type</th>
                  <th scope="col">Name</th>
                  <th scope="col" className="resource-monitor__col-numeric">
                    Memory
                  </th>
                  <th scope="col" className="resource-monitor__col-numeric">
                    CPU
                  </th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.type} className="resource-monitor__group">
                  <tr className="resource-monitor__group-header">
                    <th scope="rowgroup" colSpan={3}>
                      {group.label}
                      <span className="resource-monitor__group-count">
                        {' '}
                        ({wholeFormatter.format(group.rows.length)})
                      </span>
                    </th>
                    <td className="resource-monitor__col-numeric">
                      {formatMemoryMB(group.totalMemoryMB)}
                    </td>
                    <td className="resource-monitor__col-numeric">
                      {formatCpuPercent(group.totalCpuPercent)}
                    </td>
                  </tr>
                  {group.rows.map((process) => (
                    <tr key={process.pid}>
                      <td className="resource-monitor__col-pid">{process.pid}</td>
                      <td>{TYPE_LABELS[process.type] ?? process.type}</td>
                      <td className="resource-monitor__col-name">
                        <span>{process.name}</span>
                        {process.windowTitle && (
                          <span className="resource-monitor__window-title">
                            {process.windowTitle}
                          </span>
                        )}
                      </td>
                      <td className="resource-monitor__col-numeric">
                        <MemoryBar
                          valueMB={process.memoryMB}
                          maxMB={maxProcessMemoryMB}
                          deltaMB={
                            previousByPid.has(process.pid)
                              ? process.memoryMB - (previousByPid.get(process.pid)?.memoryMB ?? process.memoryMB)
                              : null
                          }
                          label={`${process.name} relative memory usage`}
                        />
                      </td>
                      <td className="resource-monitor__col-numeric">
                        <span className="resource-monitor__cpu-value">
                          {formatCpuPercent(process.cpuPercent)}
                          <DeltaValue
                            value={
                              previousByPid.has(process.pid)
                                ? process.cpuPercent -
                                  (previousByPid.get(process.pid)?.cpuPercent ?? process.cpuPercent)
                                : null
                            }
                            suffix="%"
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3}>
                    Total
                  </th>
                  <td className="resource-monitor__col-numeric">
                    {formatMemoryMB(totals.totalMemoryMB)}
                  </td>
                  <td className="resource-monitor__col-numeric">
                    {formatCpuPercent(totals.totalCpuPercent)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default ResourceMonitorSection

import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChevronDown, ChevronRight } from './icons'

import type {
  DiagnosticsExportResult,
  DiagnosticsHistoryPoint,
  DiagnosticsProcessMetricRow,
  DiagnosticsSnapshot,
} from '../performance/types'

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatMbFromKb(value: number): string {
  return `${(value / 1024).toFixed(1)} MB`
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function pickTopProcesses(processes: DiagnosticsProcessMetricRow[]): DiagnosticsProcessMetricRow[] {
  return [...processes]
    .sort((left, right) => {
      if (right.cpuPercent !== left.cpuPercent) return right.cpuPercent - left.cpuPercent
      return right.workingSetSizeKb - left.workingSetSizeKb
    })
    .slice(0, 12)
}

function getProcessSignals(process: DiagnosticsProcessMetricRow): string[] {
  const signals: string[] = []

  if (process.cpuPercent >= 20) {
    signals.push(`High CPU load at ${formatPercent(process.cpuPercent)}.`)
  } else if (process.cpuPercent >= 8) {
    signals.push(`Moderate CPU activity at ${formatPercent(process.cpuPercent)}.`)
  }

  if (process.workingSetSizeKb >= 700 * 1024) {
    signals.push(`Very high working set at ${formatMbFromKb(process.workingSetSizeKb)}.`)
  } else if (process.workingSetSizeKb >= 300 * 1024) {
    signals.push(`Elevated working set at ${formatMbFromKb(process.workingSetSizeKb)}.`)
  }

  if (process.privateBytesKb >= 400 * 1024) {
    signals.push(`Large private allocation at ${formatMbFromKb(process.privateBytesKb)}.`)
  }

  if (process.idleWakeupsPerSecond != null && process.idleWakeupsPerSecond >= 150) {
    signals.push(`Frequent wakeups at ${process.idleWakeupsPerSecond.toFixed(1)}/s.`)
  }

  if (process.group === 'renderer') {
    signals.push('Renderer pressure can show up as jank, slow paints, or input delay.')
  }
  if (process.group === 'gpu') {
    signals.push('GPU pressure can correlate with compositor stalls, video issues, or animation hitching.')
  }
  if (process.group === 'network') {
    signals.push('Network service activity usually points to request churn, streaming, or cache work.')
  }

  if (signals.length === 0) {
    signals.push('No obvious hotspot signal from the current sample. Check if spikes happen intermittently.')
  }

  return signals
}

function getProcessNextStep(process: DiagnosticsProcessMetricRow): string {
  if (process.group === 'renderer') {
    return 'Check what this window is rendering right now, then compare its memory growth over the next few samples.'
  }
  if (process.group === 'gpu') {
    return 'Look for heavy animation, canvas/video work, or compositor-heavy surfaces in the active windows.'
  }
  if (process.group === 'network') {
    return 'Look for repeated requests, streaming responses, or sync loops that keep the network service busy.'
  }
  if (process.group === 'main') {
    return 'Check main-process timers, IPC fan-out, and any window or tray event loops that may be staying hot.'
  }
  return 'Watch a few more samples and compare CPU, working set, and private bytes for movement.'
}

function ChartPanel({
  title,
  data,
  dataKey,
  color,
  formatter,
}: {
  title: string
  data: DiagnosticsHistoryPoint[]
  dataKey: keyof DiagnosticsHistoryPoint
  color: string
  formatter: (value: number) => string
}) {
  if (data.length === 0) {
    return (
      <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
        <div className="mb-3 text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[var(--theme-text-secondary)]">
          {title}
        </div>
        <div className="text-sm text-[var(--theme-text-secondary)]">No retained samples yet.</div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
      <div className="mb-3 text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[var(--theme-text-secondary)]">
        {title}
      </div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="var(--theme-border)" vertical={false} />
            <XAxis
              dataKey="sampledAt"
              tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              stroke="var(--theme-text-secondary)"
              minTickGap={18}
            />
            <YAxis
              stroke="var(--theme-text-secondary)"
              tickFormatter={(value) => formatter(Number(value))}
              width={70}
            />
            <Tooltip
              formatter={(value: number | string | undefined) => formatter(Number(value ?? 0))}
              labelFormatter={(value) => formatTimestamp(String(value))}
              contentStyle={{
                backgroundColor: 'var(--theme-surface)',
                border: '1px solid var(--theme-border)',
                borderRadius: 10,
                color: 'var(--theme-text-primary)',
              }}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function OverviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-background)] px-3 py-2">
      <div className="text-[0.7rem] uppercase tracking-[0.14em] text-[var(--theme-text-secondary)]">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-[var(--theme-text-primary)]">{value}</div>
    </div>
  )
}

export default function PerformanceWindow() {
  const traceControlsEnabled = false
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null)
  const [expandedProcessId, setExpandedProcessId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isTracePending, setIsTracePending] = useState(false)
  const [isExportPending, setIsExportPending] = useState(false)
  const [exportResult, setExportResult] = useState<DiagnosticsExportResult | null>(null)

  useEffect(() => {
    document.title = 'Performance Monitor'
  }, [])

  useEffect(() => {
    let isCancelled = false

    const loadSnapshot = async () => {
      try {
        const nextSnapshot = await window.performanceMonitor.getSnapshot()
        if (!isCancelled) {
          setSnapshot(nextSnapshot)
          setError(null)
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load diagnostics snapshot')
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    void loadSnapshot()
    const unsubscribe = window.performanceMonitor.subscribe((nextSnapshot) => {
      if (!isCancelled) {
        setSnapshot(nextSnapshot)
      }
    })

    return () => {
      isCancelled = true
      unsubscribe()
    }
  }, [])

  const topProcesses = useMemo(() => pickTopProcesses(snapshot?.processes ?? []), [snapshot?.processes])

  const refreshNow = async () => {
    setIsRefreshing(true)
    setActionError(null)
    try {
      const nextSnapshot = await window.performanceMonitor.getSnapshot()
      setSnapshot(nextSnapshot)
    } catch (refreshError) {
      setActionError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh metrics')
    } finally {
      setIsRefreshing(false)
    }
  }

  const startTrace = async () => {
    setIsTracePending(true)
    setActionError(null)
    try {
      const trace = await window.performanceMonitor.startTrace()
      setSnapshot((current) => (current ? { ...current, trace } : current))
    } catch (traceError) {
      setActionError(traceError instanceof Error ? traceError.message : 'Failed to start trace')
    } finally {
      setIsTracePending(false)
    }
  }

  const stopTrace = async () => {
    setIsTracePending(true)
    setActionError(null)
    try {
      const trace = await window.performanceMonitor.stopTrace()
      setSnapshot((current) => (current ? { ...current, trace } : current))
    } catch (traceError) {
      setActionError(traceError instanceof Error ? traceError.message : 'Failed to stop trace')
    } finally {
      setIsTracePending(false)
    }
  }

  const exportBundle = async () => {
    setIsExportPending(true)
    setActionError(null)
    try {
      const result = await window.performanceMonitor.exportBundle()
      setExportResult(result)
      if (!result.canceled) {
        const nextSnapshot = await window.performanceMonitor.getSnapshot()
        setSnapshot(nextSnapshot)
      }
    } catch (exportError) {
      setActionError(exportError instanceof Error ? exportError.message : 'Failed to export diagnostics bundle')
    } finally {
      setIsExportPending(false)
    }
  }

  const traceStatus = snapshot?.trace.status ?? 'idle'

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-[var(--theme-background)] text-[var(--theme-text-primary)]">
      <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-4 p-4">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3">
          <div>
            <div className="text-[0.78rem] font-semibold uppercase tracking-[0.18em] text-[var(--theme-text-secondary)]">
              Live Diagnostics
            </div>
            <h1 className="mt-1 text-xl font-semibold">Performance Monitor</h1>
            <div className="mt-1 text-sm text-[var(--theme-text-secondary)]">
              Electron-native process metrics, GPU status, Chromium tracing, and exportable diagnostics bundles.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--theme-border)] px-3 py-2 text-sm"
              onClick={refreshNow}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh now'}
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--theme-border)] px-3 py-2 text-sm"
              onClick={startTrace}
              disabled={!traceControlsEnabled || traceStatus === 'recording' || isTracePending}
              title={!traceControlsEnabled ? 'Temporarily disabled' : undefined}
            >
              Start trace
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--theme-border)] px-3 py-2 text-sm"
              onClick={stopTrace}
              disabled={!traceControlsEnabled || traceStatus !== 'recording' || isTracePending}
              title={!traceControlsEnabled ? 'Temporarily disabled' : undefined}
            >
              Stop trace
            </button>
            <button
              type="button"
              className="rounded-lg bg-[var(--theme-text-primary)] px-3 py-2 text-sm font-medium text-[var(--theme-background)]"
              onClick={exportBundle}
              disabled={!traceControlsEnabled || isExportPending}
              title={!traceControlsEnabled ? 'Temporarily disabled' : undefined}
            >
              {isExportPending ? 'Exporting...' : 'Export diagnostics bundle'}
            </button>
          </div>
        </header>

        {actionError ? (
          <section className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {actionError}
          </section>
        ) : null}

        {loading ? (
          <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-10 text-center text-sm text-[var(--theme-text-secondary)]">
            Loading live diagnostics...
          </section>
        ) : error ? (
          <section className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-10 text-center text-sm text-red-200">
            {error}
          </section>
        ) : snapshot ? (
          <>
            <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[var(--theme-text-secondary)]">
                    Process Table
                  </div>
                  <div className="text-sm text-[var(--theme-text-secondary)]">
                    Top CPU and memory consumers from the latest sample.
                  </div>
                </div>
                <div className="text-right text-xs text-[var(--theme-text-secondary)]">
                  <div>Total CPU {formatPercent(snapshot.totals.cpuPercent)}</div>
                  <div>Working Set {formatMbFromKb(snapshot.totals.workingSetSizeKb)}</div>
                </div>
              </div>

              {topProcesses.length === 0 ? (
                <div className="text-sm text-[var(--theme-text-secondary)]">
                  No process metrics are currently available.
                </div>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--theme-text-secondary)]">
                      <tr>
                        <th className="px-2 py-2">Role</th>
                        <th className="px-2 py-2">Group</th>
                        <th className="px-2 py-2">CPU</th>
                        <th className="px-2 py-2">Working Set</th>
                        <th className="px-2 py-2">Private</th>
                        <th className="px-2 py-2">PID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProcesses.map((process) => {
                        const isExpanded = expandedProcessId === process.id
                        const detailLabel = process.windowRoute ?? process.serviceName ?? process.type
                        const signals = getProcessSignals(process)

                        return (
                          <Fragment key={process.id}>
                            <tr
                              className="border-t border-[var(--theme-border)] cursor-pointer transition-colors hover:bg-[var(--theme-background)]/50"
                              onClick={() => {
                                setExpandedProcessId((current) => current === process.id ? null : process.id)
                              }}
                            >
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  className="flex items-start gap-2 text-left"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setExpandedProcessId((current) => current === process.id ? null : process.id)
                                  }}
                                >
                                  <span className="mt-0.5 text-[var(--theme-text-secondary)]">
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  </span>
                                  <span>
                                    <div>{process.label}</div>
                                    <div className="text-xs text-[var(--theme-text-secondary)]">
                                      {detailLabel}
                                    </div>
                                  </span>
                                </button>
                              </td>
                              <td className="px-2 py-2 uppercase">{process.group}</td>
                              <td className="px-2 py-2">{formatPercent(process.cpuPercent)}</td>
                              <td className="px-2 py-2">{formatMbFromKb(process.workingSetSizeKb)}</td>
                              <td className="px-2 py-2">{formatMbFromKb(process.privateBytesKb)}</td>
                              <td className="px-2 py-2 font-mono text-xs">{process.pid}</td>
                            </tr>
                            {isExpanded ? (
                              <tr className="border-t border-[var(--theme-border)] bg-[var(--theme-background)]/60">
                                <td colSpan={6} className="px-4 py-4">
                                  <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr_1fr]">
                                    <div>
                                      <div className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[var(--theme-text-secondary)]">
                                        Hotspot Read
                                      </div>
                                      <div className="space-y-2 text-sm text-[var(--theme-text-primary)]">
                                        {signals.map((signal) => (
                                          <div key={signal}>{signal}</div>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[var(--theme-text-secondary)]">
                                        Breakdown
                                      </div>
                                      <div className="space-y-1 text-sm">
                                        <div>Peak Working Set: {formatMbFromKb(process.peakWorkingSetSizeKb)}</div>
                                        <div>Private Bytes: {formatMbFromKb(process.privateBytesKb)}</div>
                                        <div>Shared Bytes: {formatMbFromKb(process.sharedBytesKb)}</div>
                                        <div>
                                          Idle Wakeups: {process.idleWakeupsPerSecond != null
                                            ? `${process.idleWakeupsPerSecond.toFixed(1)}/s`
                                            : 'Unavailable'}
                                        </div>
                                        <div>Sandboxed: {process.sandboxed ? 'Yes' : 'No'}</div>
                                      </div>
                                    </div>
                                    <div>
                                      <div className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[var(--theme-text-secondary)]">
                                        Next Step
                                      </div>
                                      <div className="text-sm text-[var(--theme-text-primary)]">
                                        {getProcessNextStep(process)}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 md:grid-cols-4 xl:grid-cols-8">
              <OverviewItem label="App" value={`v${snapshot.overview.app.appVersion}`} />
              <OverviewItem label="Electron" value={snapshot.overview.app.electronVersion} />
              <OverviewItem label="Chromium" value={snapshot.overview.app.chromiumVersion} />
              <OverviewItem label="Node" value={snapshot.overview.app.nodeVersion} />
              <OverviewItem label="Platform" value={snapshot.overview.app.osVersion} />
              <OverviewItem label="Uptime" value={`${snapshot.overview.uptimeSeconds}s`} />
              <OverviewItem label="Processes" value={String(snapshot.overview.processCount)} />
              <OverviewItem
                label="Sampling"
                value={`${snapshot.overview.isSampling ? 'Live' : 'Idle'} • ${snapshot.overview.samplingIntervalMs}ms`}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <ChartPanel
                title="Total CPU"
                data={snapshot.history}
                dataKey="totalCpuPercent"
                color="#f59e0b"
                formatter={(value) => `${value.toFixed(1)}%`}
              />
              <ChartPanel
                title="Working Set"
                data={snapshot.history}
                dataKey="totalWorkingSetSizeKb"
                color="#38bdf8"
                formatter={formatMbFromKb}
              />
              <ChartPanel
                title="Renderer Memory"
                data={snapshot.history}
                dataKey="rendererWorkingSetSizeKb"
                color="#34d399"
                formatter={formatMbFromKb}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <div className="flex flex-col gap-4">
                <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
                  <div className="mb-3 text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[var(--theme-text-secondary)]">
                    GPU
                  </div>
                  {snapshot.gpu.infoStatus === 'ready' ? (
                    <div className="space-y-3">
                      <div className="text-sm text-[var(--theme-text-secondary)]">
                        Last updated {formatTimestamp(snapshot.gpu.lastUpdatedAt)}
                      </div>
                      <div className="max-h-48 overflow-auto rounded-lg bg-[var(--theme-background)] p-3 text-xs">
                        <pre className="whitespace-pre-wrap break-words">
                          {JSON.stringify(snapshot.gpu.featureStatus, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--theme-text-secondary)]">
                      GPU diagnostics unavailable: {snapshot.gpu.error ?? snapshot.gpu.infoStatus}
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
                  <div className="mb-3 text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[var(--theme-text-secondary)]">
                    Trace
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>Status: <span className="font-medium uppercase">{snapshot.trace.status}</span></div>
                    <div>Elapsed: {formatDuration(snapshot.trace.elapsedMs)}</div>
                    <div>Started: {formatTimestamp(snapshot.trace.startedAt)}</div>
                    <div>Stopped: {formatTimestamp(snapshot.trace.stoppedAt)}</div>
                    <div>Trace Path: {snapshot.trace.tracePath ?? 'Not captured yet'}</div>
                    <div>
                      Trace Size: {snapshot.trace.estimatedTraceSizeBytes != null
                        ? `${(snapshot.trace.estimatedTraceSizeBytes / (1024 * 1024)).toFixed(2)} MB`
                        : 'Unavailable'}
                    </div>
                  </div>
                </section>
              </div>
            </section>

            {exportResult ? (
              <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 text-sm">
                <div className="mb-2 text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[var(--theme-text-secondary)]">
                  Last Export
                </div>
                {exportResult.canceled ? (
                  <div className="text-[var(--theme-text-secondary)]">Export canceled.</div>
                ) : (
                  <div className="space-y-1">
                    <div>Bundle: {exportResult.bundlePath}</div>
                    <div>Summary JSON: {exportResult.files.summaryJson ?? 'Unavailable'}</div>
                    <div>Summary Markdown: {exportResult.files.summaryMarkdown ?? 'Unavailable'}</div>
                    <div>Metrics JSON: {exportResult.files.metricsJson ?? 'Unavailable'}</div>
                    <div>Trace JSON: {exportResult.files.traceJson ?? 'Unavailable'}</div>
                    {exportResult.unavailable.length > 0 ? (
                      <div className="text-[var(--theme-text-secondary)]">
                        Missing artifacts: {exportResult.unavailable.join(', ')}
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            ) : null}
          </>
        ) : (
          <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-10 text-center text-sm text-[var(--theme-text-secondary)]">
            Diagnostics snapshot unavailable.
          </section>
        )}
      </div>
    </div>
  )
}

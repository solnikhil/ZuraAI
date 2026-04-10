import {
  app,
  BrowserWindow,
  contentTracing,
  dialog,
  type ProcessMetric,
  type WebContents,
} from 'electron'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { getAppRuntimeInfo } from '../runtimeInfo'
import type {
  DiagnosticsExportResult,
  DiagnosticsGpuInfo,
  DiagnosticsHistoryPoint,
  DiagnosticsProcessGroup,
  DiagnosticsProcessMetricRow,
  DiagnosticsSnapshot,
  DiagnosticsTraceState,
} from '../../src/performance/types'

const PERFORMANCE_TRACE_CATEGORIES = [
  'blink',
  'browser',
  'cc',
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'gpu',
  'input',
  'loading',
  'netlog',
  'renderer.scheduler',
  'toplevel',
  'v8',
]

const DEFAULT_SAMPLING_INTERVAL_MS = 1000
const DEFAULT_HISTORY_LIMIT = 300

export interface PerformanceMonitorOptions {
  samplingIntervalMs?: number
  historyLimit?: number
  traceCategories?: string[]
  now?: () => number
}

interface WindowProcessDetails {
  label: string
  windowTitle: string | null
  windowRoute: string | null
}

interface HistorySample {
  snapshot: DiagnosticsSnapshot
}

function normalizeKb(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value ?? 0))
}

function getSharedBytes(memory: ProcessMetric['memory']): number | undefined {
  const memoryWithSharedBytes = memory as ProcessMetric['memory'] & { sharedBytes?: number }
  return memoryWithSharedBytes.sharedBytes
}

function normalizeMetricName(metric: ProcessMetric): string | null {
  const candidate = 'name' in metric && typeof metric.name === 'string'
    ? metric.name
    : null
  return candidate && candidate.trim().length > 0 ? candidate : null
}

function normalizeServiceName(metric: ProcessMetric): string | null {
  return typeof metric.serviceName === 'string' && metric.serviceName.trim().length > 0
    ? metric.serviceName
    : null
}

function inferWindowRoute(win: BrowserWindow): string | null {
  try {
    const url = win.webContents.getURL()
    const hashIndex = url.indexOf('#')
    if (hashIndex === -1) return null
    return url.slice(hashIndex + 1) || null
  } catch {
    return null
  }
}

export function classifyProcessMetric(metric: Pick<ProcessMetric, 'type' | 'serviceName'> & { name?: string }): DiagnosticsProcessGroup {
  const type = metric.type.toLowerCase()
  const serviceName = `${metric.serviceName ?? ''} ${metric.name ?? ''}`.toLowerCase()

  if (type === 'browser') return 'main'
  if (type === 'tab' || type === 'window' || type === 'renderer') return 'renderer'
  if (type === 'gpu') return 'gpu'

  if (type === 'utility') {
    if (/(network|audio service|media|video capture|data decoder|proxy)/.test(serviceName)) {
      return 'network'
    }
    if (/(storage|cache|database|indexeddb|filesystem)/.test(serviceName)) {
      return 'storage'
    }
    return 'utility'
  }

  return 'other'
}

export function pushBoundedHistory<T>(history: T[], entry: T, limit: number): T[] {
  const next = [...history, entry]
  if (next.length <= limit) return next
  return next.slice(next.length - limit)
}

export function createGpuInfoState(
  featureStatus: Record<string, string> | null,
  info: unknown | null,
  status: DiagnosticsGpuInfo['infoStatus'],
  error: string | null,
  timestamp: string | null
): DiagnosticsGpuInfo {
  return {
    featureStatus: featureStatus ?? {},
    info,
    infoStatus: status,
    error,
    lastUpdatedAt: timestamp,
  }
}

function getWindowProcessMap(): Map<number, WindowProcessDetails> {
  const map = new Map<number, WindowProcessDetails>()

  for (const win of BrowserWindow.getAllWindows()) {
    try {
      const pid = win.webContents.getOSProcessId()
      if (!pid) continue

      const route = inferWindowRoute(win)
      const title = win.getTitle() || null
      const label = route === '/about'
        ? 'About window'
        : route === '/performance'
          ? 'Performance window'
          : title || 'Renderer window'

      map.set(pid, {
        label,
        windowTitle: title,
        windowRoute: route,
      })
    } catch {
      // Ignore windows that are closing while metrics are being sampled.
    }
  }

  return map
}

export function normalizeProcessMetric(
  metric: ProcessMetric,
  windowProcessMap: Map<number, WindowProcessDetails>
): DiagnosticsProcessMetricRow {
  const group = classifyProcessMetric({
    type: metric.type,
    serviceName: metric.serviceName,
    name: normalizeMetricName(metric) ?? undefined,
  })
  const windowDetails = windowProcessMap.get(metric.pid)
  const name = normalizeMetricName(metric)
  const serviceName = normalizeServiceName(metric)

  const label = windowDetails?.label
    ?? (group === 'main'
      ? 'Main process'
      : group === 'gpu'
        ? 'GPU process'
        : name
          ?? serviceName
          ?? metric.type)

  return {
    id: `${metric.type}:${metric.pid}`,
    pid: metric.pid,
    group,
    type: metric.type,
    cpuPercent: Number(metric.cpu.percentCPUUsage?.toFixed(2) ?? 0),
    idleWakeupsPerSecond: Number.isFinite(metric.cpu.idleWakeupsPerSecond)
      ? Number(metric.cpu.idleWakeupsPerSecond.toFixed(2))
      : null,
    workingSetSizeKb: normalizeKb(metric.memory.workingSetSize),
    peakWorkingSetSizeKb: normalizeKb(metric.memory.peakWorkingSetSize),
    privateBytesKb: normalizeKb(metric.memory.privateBytes),
    sharedBytesKb: normalizeKb(getSharedBytes(metric.memory)),
    creationTime: Number.isFinite(metric.creationTime) ? metric.creationTime : null,
    sandboxed: Boolean(metric.sandboxed),
    serviceName,
    name,
    label,
    windowTitle: windowDetails?.windowTitle ?? null,
    windowRoute: windowDetails?.windowRoute ?? null,
  }
}

function historyPointFromSnapshot(snapshot: DiagnosticsSnapshot): DiagnosticsHistoryPoint {
  const rendererWorkingSetSizeKb = snapshot.processes
    .filter((process) => process.group === 'renderer')
    .reduce((total, process) => total + process.workingSetSizeKb, 0)
  const gpuWorkingSetSizeKb = snapshot.processes
    .filter((process) => process.group === 'gpu')
    .reduce((total, process) => total + process.workingSetSizeKb, 0)

  return {
    sampledAt: snapshot.sampledAt,
    totalCpuPercent: snapshot.totals.cpuPercent,
    totalWorkingSetSizeKb: snapshot.totals.workingSetSizeKb,
    totalPrivateBytesKb: snapshot.totals.privateBytesKb,
    rendererWorkingSetSizeKb,
    gpuWorkingSetSizeKb,
  }
}

function formatMb(kb: number): string {
  return `${(kb / 1024).toFixed(1)} MB`
}

function buildSummary(snapshot: DiagnosticsSnapshot, history: DiagnosticsSnapshot[]) {
  const topCpu = [...snapshot.processes]
    .sort((left, right) => right.cpuPercent - left.cpuPercent)
    .slice(0, 5)
  const topMemory = [...snapshot.processes]
    .sort((left, right) => right.workingSetSizeKb - left.workingSetSizeKb)
    .slice(0, 5)
  const firstHistory = history[0]
  const lastHistory = history[history.length - 1]
  const workingSetGrowthKb = firstHistory
    ? lastHistory.totals.workingSetSizeKb - firstHistory.totals.workingSetSizeKb
    : 0
  const probableHotspots = [
    ...topCpu
      .filter((row) => row.cpuPercent >= 15)
      .map((row) => `${row.label} is using ${row.cpuPercent.toFixed(1)}% CPU`),
    ...topMemory
      .filter((row) => row.workingSetSizeKb >= 300 * 1024)
      .map((row) => `${row.label} is using ${formatMb(row.workingSetSizeKb)} working set memory`),
    ...(Math.abs(workingSetGrowthKb) >= 128 * 1024
      ? [`Working set changed by ${formatMb(Math.abs(workingSetGrowthKb))} across the retained sample window`]
      : []),
    ...(snapshot.trace.status === 'recording' && snapshot.trace.elapsedMs >= 5 * 60 * 1000
      ? ['Trace recording has been running for more than 5 minutes and may be larger than needed']
      : []),
    ...(snapshot.gpu.infoStatus !== 'ready'
      ? [`GPU diagnostics are ${snapshot.gpu.infoStatus}`]
      : []),
  ]

  const unavailable: string[] = []
  if (snapshot.gpu.infoStatus !== 'ready') unavailable.push('gpuInfo')
  if (snapshot.trace.status === 'idle') unavailable.push('trace')

  return {
    generatedAt: snapshot.sampledAt,
    app: snapshot.overview.app,
    platform: snapshot.overview.platform,
    arch: snapshot.overview.arch,
    uptimeSeconds: snapshot.overview.uptimeSeconds,
    totals: snapshot.totals,
    topCpu,
    topMemory,
    rendererHealth: snapshot.processes.filter((row) => row.group === 'renderer').map((row) => ({
      label: row.label,
      pid: row.pid,
      cpuPercent: row.cpuPercent,
      workingSetSizeKb: row.workingSetSizeKb,
    })),
    gpu: snapshot.gpu,
    trace: snapshot.trace,
    probableHotspots,
    unavailable,
  }
}

function buildSummaryMarkdown(summary: ReturnType<typeof buildSummary>): string {
  const lines: string[] = [
    '# ZuraAI Diagnostics Summary',
    '',
    `Generated: ${summary.generatedAt}`,
    `App Version: ${summary.app.appVersion}`,
    `Build: ${summary.app.channel}`,
    `Platform: ${summary.platform} (${summary.arch})`,
    `Uptime Seconds: ${summary.uptimeSeconds}`,
    '',
    '## Totals',
    '',
    `- CPU: ${summary.totals.cpuPercent.toFixed(1)}%`,
    `- Working Set: ${formatMb(summary.totals.workingSetSizeKb)}`,
    `- Private Bytes: ${formatMb(summary.totals.privateBytesKb)}`,
    `- Shared Bytes: ${formatMb(summary.totals.sharedBytesKb)}`,
    '',
    '## Probable Hotspots',
    '',
    ...(summary.probableHotspots.length > 0
      ? summary.probableHotspots.map((item) => `- ${item}`)
      : ['- No obvious hotspots detected in the retained sample window']),
    '',
    '## Top CPU Consumers',
    '',
    ...summary.topCpu.map(
      (row) => `- ${row.label} (PID ${row.pid}, ${row.cpuPercent.toFixed(1)}% CPU)`
    ),
    '',
    '## Top Memory Consumers',
    '',
    ...summary.topMemory.map(
      (row) => `- ${row.label} (PID ${row.pid}, ${formatMb(row.workingSetSizeKb)})`
    ),
    '',
    '## Trace',
    '',
    `- Status: ${summary.trace.status}`,
    `- Elapsed: ${Math.round(summary.trace.elapsedMs / 1000)}s`,
    `- Trace Path: ${summary.trace.tracePath ?? 'Unavailable'}`,
    '',
    '## Unavailable Data',
    '',
    ...(summary.unavailable.length > 0
      ? summary.unavailable.map((item) => `- ${item}`)
      : ['- None']),
    '',
  ]

  return lines.join('\n')
}

export class PerformanceMonitorService {
  private readonly samplingIntervalMs: number
  private readonly historyLimit: number
  private readonly traceCategories: string[]
  private readonly now: () => number
  private interval: NodeJS.Timeout | null = null
  private subscribers = new Set<WebContents>()
  private history: HistorySample[] = []
  private gpuInfo: DiagnosticsGpuInfo = createGpuInfoState(null, null, 'pending', null, null)
  private traceState: DiagnosticsTraceState = {
    status: 'idle',
    startedAt: null,
    stoppedAt: null,
    elapsedMs: 0,
    categories: [...PERFORMANCE_TRACE_CATEGORIES],
    tracePath: null,
    estimatedTraceSizeBytes: null,
    lastError: null,
  }
  private readonly handleGpuInfoUpdate = () => {
    void this.refreshGpuInfo()
  }

  constructor(options: PerformanceMonitorOptions = {}) {
    this.samplingIntervalMs = options.samplingIntervalMs ?? DEFAULT_SAMPLING_INTERVAL_MS
    this.historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT
    this.traceCategories = options.traceCategories ?? PERFORMANCE_TRACE_CATEGORIES
    this.now = options.now ?? (() => Date.now())

    app.on('gpu-info-update', this.handleGpuInfoUpdate)
    void this.refreshGpuInfo()
  }

  dispose(): void {
    app.off('gpu-info-update', this.handleGpuInfoUpdate)
    this.stopSampling()
    this.subscribers.clear()
  }

  isSampling(): boolean {
    return this.interval !== null
  }

  getHistory(): DiagnosticsSnapshot[] {
    return this.history.map((entry) => entry.snapshot)
  }

  getTraceState(): DiagnosticsTraceState {
    return this.buildTraceState()
  }

  setGpuInfoForTesting(gpuInfo: DiagnosticsGpuInfo): void {
    this.gpuInfo = gpuInfo
  }

  async refreshGpuInfo(): Promise<void> {
    let featureStatus: Record<string, string> | null = null

    try {
      featureStatus = {
        ...app.getGPUFeatureStatus(),
      }
    } catch (error) {
      this.gpuInfo = createGpuInfoState(
        null,
        null,
        'error',
        error instanceof Error ? error.message : 'Unknown GPU feature status error',
        new Date(this.now()).toISOString()
      )
      return
    }

    try {
      const info = await app.getGPUInfo('basic')
      this.gpuInfo = createGpuInfoState(
        featureStatus,
        info,
        'ready',
        null,
        new Date(this.now()).toISOString()
      )
    } catch (error) {
      this.gpuInfo = createGpuInfoState(
        featureStatus,
        null,
        'unavailable',
        error instanceof Error ? error.message : 'GPU info unavailable',
        new Date(this.now()).toISOString()
      )
    }
  }

  subscribe(webContents: WebContents): void {
    this.subscribers.add(webContents)
    webContents.once('destroyed', () => {
      this.unsubscribe(webContents)
    })

    if (!this.isSampling()) {
      void this.emitSnapshot()
      this.startSampling()
    }
  }

  unsubscribe(webContents: WebContents): void {
    this.subscribers.delete(webContents)
    if (this.subscribers.size === 0) {
      this.stopSampling()
    }
  }

  async getSnapshot(): Promise<DiagnosticsSnapshot> {
    const metrics = app.getAppMetrics()
    const windowProcessMap = getWindowProcessMap()
    const processes = metrics
      .map((metric) => normalizeProcessMetric(metric, windowProcessMap))
      .sort((left, right) => {
        if (right.cpuPercent !== left.cpuPercent) return right.cpuPercent - left.cpuPercent
        return right.workingSetSizeKb - left.workingSetSizeKb
      })

    const sampledAt = new Date(this.now()).toISOString()
    const totals = processes.reduce(
      (accumulator, process) => ({
        cpuPercent: accumulator.cpuPercent + process.cpuPercent,
        workingSetSizeKb: accumulator.workingSetSizeKb + process.workingSetSizeKb,
        privateBytesKb: accumulator.privateBytesKb + process.privateBytesKb,
        sharedBytesKb: accumulator.sharedBytesKb + process.sharedBytesKb,
      }),
      { cpuPercent: 0, workingSetSizeKb: 0, privateBytesKb: 0, sharedBytesKb: 0 }
    )

    const snapshot: DiagnosticsSnapshot = {
      sampledAt,
      overview: {
        app: getAppRuntimeInfo(),
        platform: process.platform,
        arch: os.arch(),
        uptimeSeconds: Math.round(process.uptime()),
        sampledAt,
        samplingIntervalMs: this.samplingIntervalMs,
        isSampling: this.isSampling(),
        processCount: processes.length,
      },
      totals: {
        cpuPercent: Number(totals.cpuPercent.toFixed(2)),
        workingSetSizeKb: totals.workingSetSizeKb,
        privateBytesKb: totals.privateBytesKb,
        sharedBytesKb: totals.sharedBytesKb,
      },
      processes,
      history: [],
      gpu: this.gpuInfo,
      trace: this.buildTraceState(),
    }

    this.history = pushBoundedHistory(this.history, { snapshot }, this.historyLimit)
    snapshot.history = this.history.map((entry) => historyPointFromSnapshot(entry.snapshot))
    return snapshot
  }

  async startTrace(): Promise<DiagnosticsTraceState> {
    if (this.traceState.status === 'recording') {
      throw new Error('Trace recording is already active')
    }

    const nowIso = new Date(this.now()).toISOString()
    this.traceState = {
      status: 'recording',
      startedAt: nowIso,
      stoppedAt: null,
      elapsedMs: 0,
      categories: [...this.traceCategories],
      tracePath: null,
      estimatedTraceSizeBytes: null,
      lastError: null,
    }

    try {
      await contentTracing.startRecording({
        included_categories: this.traceCategories,
      })
      return this.buildTraceState()
    } catch (error) {
      this.traceState = {
        ...this.traceState,
        status: 'idle',
        startedAt: null,
        lastError: error instanceof Error ? error.message : 'Failed to start trace',
      }
      throw error
    }
  }

  async stopTrace(): Promise<DiagnosticsTraceState> {
    if (this.traceState.status !== 'recording') {
      throw new Error('Trace recording is not active')
    }

    const tracePath = path.join(
      app.getPath('temp'),
      `zura-trace-${this.now()}.json`
    )

    try {
      const recordedPath = await contentTracing.stopRecording(tracePath)
      const stat = await fs.stat(recordedPath)
      this.traceState = {
        ...this.traceState,
        status: 'stopped',
        stoppedAt: new Date(this.now()).toISOString(),
        tracePath: recordedPath,
        estimatedTraceSizeBytes: stat.size,
        elapsedMs: this.traceState.startedAt
          ? Math.max(0, this.now() - new Date(this.traceState.startedAt).getTime())
          : 0,
        lastError: null,
      }
      return this.buildTraceState()
    } catch (error) {
      this.traceState = {
        ...this.traceState,
        status: 'idle',
        startedAt: null,
        stoppedAt: null,
        tracePath: null,
        estimatedTraceSizeBytes: null,
        lastError: error instanceof Error ? error.message : 'Failed to stop trace',
      }
      throw error
    }
  }

  async exportBundle(ownerWindow?: BrowserWindow): Promise<DiagnosticsExportResult> {
    const selection = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, {
          title: 'Choose diagnostics export folder',
          properties: ['openDirectory', 'createDirectory'],
        })
      : await dialog.showOpenDialog({
          title: 'Choose diagnostics export folder',
          properties: ['openDirectory', 'createDirectory'],
        })

    if (selection.canceled || selection.filePaths.length === 0) {
      return {
        canceled: true,
        bundlePath: null,
        exportedAt: null,
        files: {
          summaryJson: null,
          summaryMarkdown: null,
          metricsJson: null,
          traceJson: null,
        },
        unavailable: [],
      }
    }

    const exportedAt = new Date(this.now()).toISOString()
    const bundlePath = path.join(
      selection.filePaths[0],
      `zura-diagnostics-${exportedAt.replace(/[:.]/g, '-')}`
    )
    await fs.mkdir(bundlePath, { recursive: true })

    const snapshot = await this.getSnapshot()
    const history = this.getHistory()
    const summary = buildSummary(snapshot, history)
    const summaryJsonPath = path.join(bundlePath, 'summary.json')
    const summaryMarkdownPath = path.join(bundlePath, 'summary.md')
    const metricsJsonPath = path.join(bundlePath, 'metrics.json')

    await fs.writeFile(summaryJsonPath, JSON.stringify(summary, null, 2), 'utf8')
    await fs.writeFile(summaryMarkdownPath, buildSummaryMarkdown(summary), 'utf8')
    await fs.writeFile(metricsJsonPath, JSON.stringify(history, null, 2), 'utf8')

    let traceJsonPath: string | null = null
    const unavailable = [...summary.unavailable]

    if (snapshot.trace.tracePath) {
      traceJsonPath = path.join(bundlePath, 'trace.json')
      await fs.copyFile(snapshot.trace.tracePath, traceJsonPath)
    } else {
      unavailable.push('traceArtifact')
    }

    return {
      canceled: false,
      bundlePath,
      exportedAt,
      files: {
        summaryJson: summaryJsonPath,
        summaryMarkdown: summaryMarkdownPath,
        metricsJson: metricsJsonPath,
        traceJson: traceJsonPath,
      },
      unavailable,
    }
  }

  private buildTraceState(): DiagnosticsTraceState {
    const liveElapsedMs = this.traceState.startedAt
      ? this.now() - new Date(this.traceState.startedAt).getTime()
      : 0

    return {
      ...this.traceState,
      elapsedMs: this.traceState.status === 'recording'
        ? Math.max(0, liveElapsedMs)
        : this.traceState.elapsedMs,
    }
  }

  private startSampling(): void {
    if (this.interval) return
    this.interval = setInterval(() => {
      void this.emitSnapshot()
    }, this.samplingIntervalMs)
  }

  private stopSampling(): void {
    if (!this.interval) return
    clearInterval(this.interval)
    this.interval = null
  }

  private async emitSnapshot(): Promise<void> {
    const snapshot = await this.getSnapshot()
    for (const subscriber of [...this.subscribers]) {
      if (subscriber.isDestroyed()) {
        this.subscribers.delete(subscriber)
        continue
      }
      subscriber.send('performance-monitor:snapshot', snapshot)
    }
  }
}

let performanceMonitorService: PerformanceMonitorService | null = null

export function getPerformanceMonitorService(): PerformanceMonitorService {
  if (!performanceMonitorService) {
    performanceMonitorService = new PerformanceMonitorService()
  }
  return performanceMonitorService
}

export function resetPerformanceMonitorService(): void {
  performanceMonitorService?.dispose()
  performanceMonitorService = null
}

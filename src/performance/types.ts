import type { AppRuntimeInfo } from '../electron'

export type DiagnosticsProcessGroup =
  | 'main'
  | 'renderer'
  | 'gpu'
  | 'utility'
  | 'network'
  | 'storage'
  | 'other'

export interface DiagnosticsProcessMetricRow {
  id: string
  pid: number
  group: DiagnosticsProcessGroup
  type: string
  cpuPercent: number
  idleWakeupsPerSecond: number | null
  workingSetSizeKb: number
  peakWorkingSetSizeKb: number
  privateBytesKb: number
  sharedBytesKb: number
  creationTime: number | null
  sandboxed: boolean
  serviceName: string | null
  name: string | null
  label: string
  windowTitle: string | null
  windowRoute: string | null
}

export interface DiagnosticsHistoryPoint {
  sampledAt: string
  totalCpuPercent: number
  totalWorkingSetSizeKb: number
  totalPrivateBytesKb: number
  rendererWorkingSetSizeKb: number
  gpuWorkingSetSizeKb: number
}

export interface DiagnosticsGpuInfo {
  featureStatus: Record<string, string>
  info: unknown | null
  infoStatus: 'pending' | 'ready' | 'unavailable' | 'error'
  lastUpdatedAt: string | null
  error: string | null
}

export interface DiagnosticsTraceState {
  status: 'idle' | 'recording' | 'stopped'
  startedAt: string | null
  stoppedAt: string | null
  elapsedMs: number
  categories: string[]
  tracePath: string | null
  estimatedTraceSizeBytes: number | null
  lastError: string | null
}

export interface DiagnosticsOverview {
  app: AppRuntimeInfo
  platform: NodeJS.Platform
  arch: string
  uptimeSeconds: number
  sampledAt: string
  samplingIntervalMs: number
  isSampling: boolean
  processCount: number
}

export interface DiagnosticsTotals {
  cpuPercent: number
  workingSetSizeKb: number
  privateBytesKb: number
  sharedBytesKb: number
}

export interface DiagnosticsSnapshot {
  sampledAt: string
  overview: DiagnosticsOverview
  totals: DiagnosticsTotals
  processes: DiagnosticsProcessMetricRow[]
  history: DiagnosticsHistoryPoint[]
  gpu: DiagnosticsGpuInfo
  trace: DiagnosticsTraceState
}

export interface DiagnosticsExportResult {
  canceled: boolean
  bundlePath: string | null
  exportedAt: string | null
  files: {
    summaryJson: string | null
    summaryMarkdown: string | null
    metricsJson: string | null
    traceJson: string | null
  }
  unavailable: string[]
}

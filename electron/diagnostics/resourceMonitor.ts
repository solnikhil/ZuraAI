import { app, BrowserWindow, ipcMain, type IpcMain, type WebContents } from 'electron'

import type { ProcessSample, ProcessSampleType, ResourceSample } from '../../src/electron/types'

const LOG_PREFIX = '[resource-monitor]'
const SAMPLE_INTERVAL_MS = 2000

/**
 * Shape of the upstream metric we sample from. Mirrors the subset of
 * `Electron.ProcessMetric` we actually consume so this module stays easy to
 * unit-test with a plain object.
 */
export interface RawProcessMetric {
  pid: number
  type: string
  name?: string
  serviceName?: string
  memory: {
    workingSetSize: number
    peakWorkingSetSize: number
  }
  cpu: {
    percentCPUUsage: number
  }
}

const KNOWN_TYPES: ReadonlySet<ProcessSampleType> = new Set([
  'Browser',
  'Tab',
  'GPU',
  'Utility',
  'Zygote',
  'Sandbox helper',
  'Unknown',
])

function classifyType(rawType: string): ProcessSampleType {
  if ((KNOWN_TYPES as Set<string>).has(rawType)) {
    return rawType as ProcessSampleType
  }
  return 'Unknown'
}

function kbToMb(kilobytes: number): number {
  if (!Number.isFinite(kilobytes) || kilobytes <= 0) return 0
  return Math.round((kilobytes / 1024) * 10) / 10
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.round(value * 10) / 10
}

/**
 * Pure, side-effect-free transform of a raw Electron metric into the
 * renderer-facing shape. Exported for unit testing.
 */
export function normalizeMetric(
  metric: RawProcessMetric,
  windowTitle?: string
): ProcessSample {
  return {
    pid: metric.pid,
    type: classifyType(metric.type),
    rawType: metric.type,
    name: metric.name?.trim() || metric.serviceName?.trim() || classifyType(metric.type),
    memoryMB: kbToMb(metric.memory.workingSetSize),
    peakMemoryMB: kbToMb(metric.memory.peakWorkingSetSize),
    cpuPercent: clampPercent(metric.cpu.percentCPUUsage),
    ...(windowTitle ? { windowTitle } : {}),
  }
}

interface ResourceMonitorDeps {
  /** Returns the current set of raw process metrics. Defaults to `app.getAppMetrics()`. */
  getAppMetrics?: () => RawProcessMetric[]
  /** Returns a list of windows used to enrich Tab samples with window titles. */
  listWindows?: () => Array<{
    webContents: { id: number }
    isDestroyed: () => boolean
    getTitle: () => string
  }>
  /** Setter for the recurring sampler. Defaults to `setInterval`. */
  setIntervalImpl?: typeof setInterval
  /** Clearer for the recurring sampler. Defaults to `clearInterval`. */
  clearIntervalImpl?: typeof clearInterval
  /** Sample frequency override in ms. */
  sampleIntervalMs?: number
}

interface ResourceMonitorRuntime {
  /** Manually take a snapshot. */
  sampleNow: () => ResourceSample
  /** Add a subscriber. */
  addSubscriber: (subscriber: WebContents) => void
  /** Remove a subscriber. */
  removeSubscriber: (subscriber: WebContents) => void
  /** Whether the recurring interval is currently active. */
  isRunning: () => boolean
  /** Number of registered subscribers. */
  subscriberCount: () => number
  /** Tear everything down (used by tests / reload). */
  dispose: () => void
}

function buildResourceMonitor(deps: ResourceMonitorDeps = {}): ResourceMonitorRuntime {
  const getMetrics =
    deps.getAppMetrics ?? (() => app.getAppMetrics() as unknown as RawProcessMetric[])
  const listWindows =
    deps.listWindows ??
    (() =>
      BrowserWindow.getAllWindows().map((win) => ({
        webContents: { id: win.webContents.id },
        isDestroyed: () => win.isDestroyed(),
        getTitle: () => win.getTitle(),
      })))
  const setIntervalFn = deps.setIntervalImpl ?? setInterval
  const clearIntervalFn = deps.clearIntervalImpl ?? clearInterval
  const intervalMs = deps.sampleIntervalMs ?? SAMPLE_INTERVAL_MS

  const subscribers = new Set<WebContents>()
  let timer: ReturnType<typeof setInterval> | null = null

  const sampleNow = (): ResourceSample => {
    let metrics: RawProcessMetric[]
    try {
      metrics = getMetrics() ?? []
    } catch (error) {
      console.warn(`${LOG_PREFIX} getAppMetrics failed`, error)
      metrics = []
    }

    let titleByWcId: Map<number, string> | null = null
    const ensureTitleMap = () => {
      if (titleByWcId) return titleByWcId
      titleByWcId = new Map<number, string>()
      try {
        for (const win of listWindows()) {
          if (win.isDestroyed()) continue
          const title = win.getTitle()
          if (title) titleByWcId.set(win.webContents.id, title)
        }
      } catch (error) {
        console.warn(`${LOG_PREFIX} listWindows failed`, error)
      }
      return titleByWcId
    }

    const processes: ProcessSample[] = metrics.map((metric) => {
      // Tab processes correspond to a renderer; we attach the owning window
      // title when we can resolve it. Other process types skip enrichment.
      if (metric.type === 'Tab') {
        const titles = ensureTitleMap()
        // Without a stable webContents <-> pid mapping in `getAppMetrics`,
        // we surface any single window title that matches the renderer's
        // process via best-effort: expose first title if there is exactly one.
        if (titles.size === 1) {
          const onlyTitle = titles.values().next().value
          return normalizeMetric(metric, onlyTitle)
        }
        return normalizeMetric(metric)
      }
      return normalizeMetric(metric)
    })

    return {
      capturedAt: Date.now(),
      processes,
    }
  }

  const tick = () => {
    if (subscribers.size === 0) return
    const sample = sampleNow()
    for (const subscriber of subscribers) {
      if (subscriber.isDestroyed()) {
        subscribers.delete(subscriber)
        continue
      }
      try {
        subscriber.send('resource-monitor:sample', sample)
      } catch (error) {
        console.warn(`${LOG_PREFIX} send failed for wc ${subscriber.id}`, error)
      }
    }
    if (subscribers.size === 0) {
      stop()
    }
  }

  const start = () => {
    if (timer) return
    timer = setIntervalFn(tick, intervalMs)
    // Intentional info-level log: surfaces sampler lifecycle in dev / packaged logs
    // alongside other diagnostics modules.
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} sampler started (interval=${intervalMs}ms)`)
  }

  const stop = () => {
    if (!timer) return
    clearIntervalFn(timer)
    timer = null
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} sampler stopped`)
  }

  const addSubscriber = (subscriber: WebContents) => {
    if (subscribers.has(subscriber)) return
    subscribers.add(subscriber)
    subscriber.once('destroyed', () => {
      subscribers.delete(subscriber)
      if (subscribers.size === 0) stop()
    })
    if (subscribers.size === 1) start()
  }

  const removeSubscriber = (subscriber: WebContents) => {
    if (!subscribers.delete(subscriber)) return
    if (subscribers.size === 0) stop()
  }

  const dispose = () => {
    subscribers.clear()
    stop()
  }

  return {
    sampleNow,
    addSubscriber,
    removeSubscriber,
    isRunning: () => timer !== null,
    subscriberCount: () => subscribers.size,
    dispose,
  }
}

let activeRuntime: ResourceMonitorRuntime | null = null

/**
 * Registers the resource-monitor IPC handlers and returns a handle to the
 * underlying runtime. Subsequent calls return the existing instance instead
 * of registering duplicate handlers.
 */
export function startResourceMonitor(
  ipc: IpcMain = ipcMain,
  deps?: ResourceMonitorDeps
): ResourceMonitorRuntime {
  if (activeRuntime) return activeRuntime

  const runtime = buildResourceMonitor(deps)

  ipc.on('resource-monitor:subscribe', (event) => {
    runtime.addSubscriber(event.sender)
  })

  ipc.on('resource-monitor:unsubscribe', (event) => {
    runtime.removeSubscriber(event.sender)
  })

  ipc.handle('resource-monitor:get-now', () => runtime.sampleNow())

  activeRuntime = runtime
  return runtime
}

/**
 * Tears the runtime down and removes IPC handlers. Intended for app shutdown
 * or test cleanup.
 */
export function stopResourceMonitor(ipc: IpcMain = ipcMain): void {
  if (!activeRuntime) return
  activeRuntime.dispose()
  activeRuntime = null
  ipc.removeAllListeners('resource-monitor:subscribe')
  ipc.removeAllListeners('resource-monitor:unsubscribe')
  ipc.removeHandler('resource-monitor:get-now')
}

/** @internal exported for unit tests. */
export const __test__ = {
  buildResourceMonitor,
  classifyType,
  kbToMb,
  clampPercent,
}

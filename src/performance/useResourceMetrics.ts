import { useEffect, useMemo, useRef, useState } from 'react'

import type { ResourceSample } from '../electron/types'

/** Number of ms after which we treat the latest sample as stale. */
const STALE_AFTER_MS = 6000
const STALE_TICK_MS = 1000

export interface ResourceTotals {
  totalMemoryMB: number
  totalCpuPercent: number
  processCount: number
}

export interface UseResourceMetricsResult {
  /** Latest sample received from main, or null until the first delivery. */
  sample: ResourceSample | null
  /** `Date.now()` value of the most recent sample, or null. */
  lastUpdatedMs: number | null
  /** True once the sample is older than `STALE_AFTER_MS`. */
  isStale: boolean
  /** Whether the renderer is connected to the main-process sampler. */
  isAvailable: boolean
  /** True when the document is hidden and the live stream is intentionally unsubscribed. */
  isPaused: boolean
  /** Requests a one-off sample without waiting for the next live tick. */
  refreshNow: () => Promise<void>
  /** Memoized aggregates across all processes. */
  totals: ResourceTotals
}

const EMPTY_TOTALS: ResourceTotals = {
  totalMemoryMB: 0,
  totalCpuPercent: 0,
  processCount: 0,
}

function computeTotals(sample: ResourceSample | null): ResourceTotals {
  if (!sample || sample.processes.length === 0) return EMPTY_TOTALS
  let memory = 0
  let cpu = 0
  for (const process of sample.processes) {
    memory += process.memoryMB
    cpu += process.cpuPercent
  }
  return {
    totalMemoryMB: Math.round(memory * 10) / 10,
    totalCpuPercent: Math.round(cpu * 10) / 10,
    processCount: sample.processes.length,
  }
}

/**
 * Subscribes to the live resource-monitor stream while the consuming component
 * is mounted. Cleans up on unmount so the main-process sampler can shut down
 * when no panel is observing it.
 *
 * In environments where `window.resourceMonitor` is not exposed (non-Electron
 * test renders), the hook returns a no-op state so callers can render safely.
 */
export function useResourceMetrics(): UseResourceMetricsResult {
  const isAvailable =
    typeof window !== 'undefined' && typeof window.resourceMonitor !== 'undefined'

  const [sample, setSample] = useState<ResourceSample | null>(null)
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null)
  const [now, setNow] = useState<number>(() => Date.now())
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => {
    if (typeof document === 'undefined') return true
    return document.visibilityState !== 'hidden'
  })
  const sampleRef = useRef(sample)
  sampleRef.current = sample

  const applySample = (next: ResourceSample) => {
    setSample(next)
    setLastUpdatedMs(Date.now())
  }

  const refreshNow = async () => {
    if (!isAvailable) return
    const next = await window.resourceMonitor.getNow()
    applySample(next)
  }

  useEffect(() => {
    if (typeof document === 'undefined') return
    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState !== 'hidden')
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!isAvailable || !isDocumentVisible) return
    const unsubscribe = window.resourceMonitor.subscribe((next) => {
      applySample(next)
    })

    // Best-effort initial snapshot so the panel doesn't have to wait a full
    // sampler tick on first mount.
    void window.resourceMonitor
      .getNow()
      .then((initial) => {
        // Don't clobber a streamed sample that arrived first.
        if (!sampleRef.current) {
          applySample(initial)
        }
      })
      .catch(() => {
        /* Non-fatal: the streaming subscription will provide values. */
      })

    return () => {
      unsubscribe()
    }
  }, [isAvailable, isDocumentVisible])

  // Drive a low-frequency "now" tick so isStale flips even when no samples
  // arrive. We only run this while we have a sample to evaluate.
  useEffect(() => {
    if (lastUpdatedMs === null) return
    const id = window.setInterval(() => setNow(Date.now()), STALE_TICK_MS)
    return () => window.clearInterval(id)
  }, [lastUpdatedMs])

  const totals = useMemo(() => computeTotals(sample), [sample])

  const isStale = lastUpdatedMs !== null && now - lastUpdatedMs > STALE_AFTER_MS

  return {
    sample,
    lastUpdatedMs,
    isStale,
    isAvailable,
    isPaused: isAvailable && !isDocumentVisible,
    refreshNow,
    totals,
  }
}

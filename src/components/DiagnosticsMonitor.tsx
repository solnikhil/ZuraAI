import { useEffect, useState } from 'react'
import { useAppShell } from '../contexts/AppShellContext'
import './DiagnosticsMonitor.css'

interface MemoryInfo {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

interface MonitorStats {
  fps: number
  memoryLabel: string
  memoryLimitLabel: string
}

function getPerformanceMemory(): MemoryInfo | null {
  const memory = (performance as Performance & { memory?: Partial<MemoryInfo> }).memory
  if (
    !memory ||
    typeof memory.usedJSHeapSize !== 'number' ||
    typeof memory.totalJSHeapSize !== 'number' ||
    typeof memory.jsHeapSizeLimit !== 'number'
  ) {
    return null
  }
  return {
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
  }
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 MB'
  const megabytes = value / 1024 / 1024
  if (megabytes < 1024) return `${Math.round(megabytes)} MB`
  return `${(megabytes / 1024).toFixed(1)} GB`
}

function readMonitorStats(frameCount: number, elapsedMs: number): MonitorStats {
  const fps = elapsedMs > 0 ? Math.round((frameCount * 1000) / elapsedMs) : 0
  const memory = getPerformanceMemory()

  if (!memory) {
    return {
      fps,
      memoryLabel: 'Unavailable',
      memoryLimitLabel: 'N/A',
    }
  }

  return {
    fps,
    memoryLabel: `${formatBytes(memory.usedJSHeapSize)} / ${formatBytes(memory.totalJSHeapSize)}`,
    memoryLimitLabel: formatBytes(memory.jsHeapSizeLimit),
  }
}

export default function DiagnosticsMonitor(): React.ReactElement | null {
  const { memoryMonitorVisible } = useAppShell()
  const [stats, setStats] = useState<MonitorStats>(() => readMonitorStats(0, 0))

  useEffect(() => {
    if (!memoryMonitorVisible) return

    let animationFrame = 0
    let frameCount = 0
    let windowStart = performance.now()

    const tick = (now: number) => {
      frameCount += 1
      const elapsed = now - windowStart

      if (elapsed >= 500) {
        setStats(readMonitorStats(frameCount, elapsed))
        frameCount = 0
        windowStart = now
      }

      animationFrame = requestAnimationFrame(tick)
    }

    animationFrame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animationFrame)
    }
  }, [memoryMonitorVisible])

  if (!memoryMonitorVisible) return null

  return (
    <aside className="diagnostics-monitor" aria-label="Memory and FPS monitor">
      <div className="diagnostics-monitor__header">
        <span>Monitor</span>
        <span className="diagnostics-monitor__status" aria-hidden="true" />
      </div>
      <div className="diagnostics-monitor__row">
        <span className="diagnostics-monitor__label">FPS</span>
        <span className="diagnostics-monitor__value">{stats.fps}</span>
      </div>
      <div className="diagnostics-monitor__row">
        <span className="diagnostics-monitor__label">Memory</span>
        <span className="diagnostics-monitor__value">{stats.memoryLabel}</span>
      </div>
      <div className="diagnostics-monitor__row">
        <span className="diagnostics-monitor__label">Limit</span>
        <span className="diagnostics-monitor__value">{stats.memoryLimitLabel}</span>
      </div>
    </aside>
  )
}

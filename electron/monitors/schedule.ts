import type { MonitorIntervalPreset } from './types'

export const MONITOR_INTERVAL_MS: Record<MonitorIntervalPreset, number> = {
  '1m': 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
}

export function isMonitorIntervalPreset(value: unknown): value is MonitorIntervalPreset {
  return (
    value === '1m' ||
    value === '30m' ||
    value === '1h' ||
    value === '6h' ||
    value === '12h' ||
    value === 'daily' ||
    value === 'weekly'
  )
}

export function getMonitorIntervalMs(preset: MonitorIntervalPreset): number {
  return MONITOR_INTERVAL_MS[preset]
}

export function calculateNextRunAt(fromMs: number, preset: MonitorIntervalPreset): number {
  return fromMs + getMonitorIntervalMs(preset)
}

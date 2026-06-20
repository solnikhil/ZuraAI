// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { calculateNextRunAt, getMonitorIntervalMs, isMonitorIntervalPreset } from './schedule'

describe('monitor schedule', () => {
  it('recognizes supported presets only', () => {
    expect(isMonitorIntervalPreset('1m')).toBe(true)
    expect(isMonitorIntervalPreset('30m')).toBe(true)
    expect(isMonitorIntervalPreset('weekly')).toBe(true)
    expect(isMonitorIntervalPreset('5m')).toBe(false)
  })

  it('supports minute-level presets', () => {
    expect(getMonitorIntervalMs('1m')).toBe(60 * 1000)
    expect(getMonitorIntervalMs('30m')).toBe(30 * 60 * 1000)
    expect(calculateNextRunAt(1_000, '1h')).toBe(1_000 + 60 * 60 * 1000)
  })
})

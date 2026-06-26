import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const overlayCss = readFileSync(resolve('src/components/overlay/overlay.css'), 'utf8')
import { OVERLAY_IDLE_HEIGHT } from './overlayLayout'

const PILL_HEIGHT = OVERLAY_IDLE_HEIGHT

describe('overlay measurement layout', () => {
  it('ships CSS that lets the measure wrapper report intrinsic expanded height', () => {
    expect(overlayCss).toContain('.zo-measure')
    expect(overlayCss).toMatch(/\.zo-measure[\s\S]*?flex-shrink:\s*0/)
    expect(overlayCss).toMatch(/\.zo-shell[\s\S]*?height:\s*auto/)
    expect(overlayCss).toMatch(/\.zo-card[\s\S]*?min-height:\s*96px/)
  })

  it('treats expanded content height as greater than the pill baseline', () => {
    const idleMeasure = document.createElement('div')
    Object.defineProperty(idleMeasure, 'scrollHeight', { value: PILL_HEIGHT, configurable: true })

    const expandedMeasure = document.createElement('div')
    Object.defineProperty(expandedMeasure, 'scrollHeight', { value: 240, configurable: true })

    expect(idleMeasure.scrollHeight).toBe(PILL_HEIGHT)
    expect(expandedMeasure.scrollHeight).toBeGreaterThan(PILL_HEIGHT)
  })
})
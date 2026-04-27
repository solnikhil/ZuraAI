import { describe, expect, it } from 'vitest'
import { mapScreenshotPointToDesktop, type ScreenshotCoordinateContext } from './coordinates'

function context(overrides: Partial<ScreenshotCoordinateContext> = {}): ScreenshotCoordinateContext {
  return {
    displayId: '1',
    displayLabel: 'Display 1',
    renderedWidth: 1280,
    renderedHeight: 720,
    nativeWidth: 2560,
    nativeHeight: 1440,
    displayBounds: { x: 0, y: 0, width: 2560, height: 1440 },
    scaleFactor: 1,
    ...overrides,
  }
}

describe('computer-use coordinate mapping', () => {
  it('maps resized screenshot coordinates to larger desktop bounds', () => {
    const point = mapScreenshotPointToDesktop({ x: 640, y: 360 }, context())

    expect(point).toEqual({ x: 1280, y: 720 })
  })

  it('keeps 1:1 screenshot coordinates unchanged on the primary display', () => {
    const point = mapScreenshotPointToDesktop(
      { x: 320, y: 240 },
      context({
        renderedWidth: 800,
        renderedHeight: 600,
        nativeWidth: 800,
        nativeHeight: 600,
        displayBounds: { x: 0, y: 0, width: 800, height: 600 },
      })
    )

    expect(point).toEqual({ x: 320, y: 240 })
  })

  it('adds non-zero display origins for secondary monitors', () => {
    const point = mapScreenshotPointToDesktop(
      { x: 640, y: 360 },
      context({
        displayId: '2',
        displayBounds: { x: 1920, y: -120, width: 2560, height: 1440 },
      })
    )

    expect(point).toEqual({ x: 3200, y: 600 })
  })

  it('maps Windows DPI-scaled screenshots into Electron desktop coordinates', () => {
    const point = mapScreenshotPointToDesktop(
      { x: 640, y: 360 },
      context({
        nativeWidth: 2560,
        nativeHeight: 1440,
        displayBounds: { x: 0, y: 0, width: 1707, height: 960 },
        scaleFactor: 1.5,
      })
    )

    expect(point).toEqual({ x: 854, y: 480 })
  })

  it('rejects out-of-bounds screenshot coordinates before desktop conversion', () => {
    expect(() => mapScreenshotPointToDesktop({ x: 1280, y: 100 }, context()))
      .toThrow('outside the latest screenshot bounds')
  })

  it('rejects invalid coordinate values', () => {
    expect(() => mapScreenshotPointToDesktop({ x: Number.NaN, y: 100 }, context()))
      .toThrow('Invalid x coordinate')
  })
})

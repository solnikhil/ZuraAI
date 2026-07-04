import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { mapScreenshotPointToDesktop, type ScreenshotCoordinateContext } from './coordinates'

function context(
  overrides: Partial<ScreenshotCoordinateContext> = {}
): ScreenshotCoordinateContext {
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
    expect(() => mapScreenshotPointToDesktop({ x: 1280, y: 100 }, context())).toThrow(
      'outside the latest screen bounds'
    )
  })

  it('rejects invalid coordinate values', () => {
    expect(() => mapScreenshotPointToDesktop({ x: Number.NaN, y: 100 }, context())).toThrow(
      'Invalid x coordinate'
    )
  })
})

/**
 * Property-based coverage for Computer Use coordinate mapping.
 *
 * The mapping projects a screenshot pixel (in the resized/rendered capture
 * space) back onto the captured display's Electron
 * desktop coordinates (device-independent pixels). Requirement 4.4 demands that
 * the projected point resolves to the same physical screen location, accounting
 * for the display's DPI scale factor, to within 1 device pixel.
 *
 * `mapScreenshotPointToDesktop` rounds the projected offset in DIP space, so the
 * only deviation from the exact physical location is the rounding error
 * (<= 0.5 DIP), which equals `roundingError * scaleFactor` device pixels. That
 * stays within 1 device pixel for the standard Windows display scaling values
 * (100%-200%), which is the DPI range the captured-display scale factor takes.
 */
const COORDINATE_PROPERTY_CONFIG = {
  numRuns: 300,
  seed: 0x5eed,
}

/** Standard Windows display scaling values (100%-200%) the scale factor takes. */
const WINDOWS_SCALE_FACTORS = [1, 1.25, 1.5, 1.75, 2] as const

/** A scenario: a screenshot coordinate context plus an in-bounds screenshot point. */
const coordinateScenarioArb = fc
  .record({
    scaleFactor: fc.constantFrom(...WINDOWS_SCALE_FACTORS),
    boundsWidth: fc.integer({ min: 640, max: 3840 }),
    boundsHeight: fc.integer({ min: 480, max: 2160 }),
    boundsX: fc.integer({ min: -4000, max: 4000 }),
    boundsY: fc.integer({ min: -4000, max: 4000 }),
    renderedWidth: fc.integer({ min: 320, max: 3840 }),
    renderedHeight: fc.integer({ min: 240, max: 2160 }),
  })
  .chain((dims) =>
    fc.record({
      dims: fc.constant(dims),
      // Screenshot pixels are integers and must be strictly in-bounds.
      px: fc.integer({ min: 0, max: dims.renderedWidth - 1 }),
      py: fc.integer({ min: 0, max: dims.renderedHeight - 1 }),
    })
  )

describe('computer-use coordinate mapping — Property 15: coordinate mapping resolves to the same physical location', () => {
  it('maps any in-bounds screenshot point to within 1 device pixel of its physical location', () => {
    fc.assert(
      fc.property(coordinateScenarioArb, ({ dims, px, py }) => {
        const context: ScreenshotCoordinateContext = {
          displayId: '1',
          displayLabel: 'Display 1',
          renderedWidth: dims.renderedWidth,
          renderedHeight: dims.renderedHeight,
          nativeWidth: Math.round(dims.boundsWidth * dims.scaleFactor),
          nativeHeight: Math.round(dims.boundsHeight * dims.scaleFactor),
          displayBounds: {
            x: dims.boundsX,
            y: dims.boundsY,
            width: dims.boundsWidth,
            height: dims.boundsHeight,
          },
          scaleFactor: dims.scaleFactor,
        }

        const actual = mapScreenshotPointToDesktop({ x: px, y: py }, context)

        // Exact physical location (in DIP) the screenshot pixel represents,
        // computed independently of the implementation's rounding.
        const expectedDipX = dims.boundsX + (px / dims.renderedWidth) * dims.boundsWidth
        const expectedDipY = dims.boundsY + (py / dims.renderedHeight) * dims.boundsHeight

        // Convert the DIP deviation to device pixels via the DPI scale factor.
        const deviceErrorX = Math.abs(actual.x - expectedDipX) * dims.scaleFactor
        const deviceErrorY = Math.abs(actual.y - expectedDipY) * dims.scaleFactor

        // Within 1 device pixel (small epsilon for floating-point comparison).
        const TOLERANCE = 1 + 1e-9
        expect(deviceErrorX).toBeLessThanOrEqual(TOLERANCE)
        expect(deviceErrorY).toBeLessThanOrEqual(TOLERANCE)

        // The resolved point must remain on the same physical display.
        expect(actual.x).toBeGreaterThanOrEqual(dims.boundsX)
        expect(actual.x).toBeLessThanOrEqual(dims.boundsX + dims.boundsWidth)
        expect(actual.y).toBeGreaterThanOrEqual(dims.boundsY)
        expect(actual.y).toBeLessThanOrEqual(dims.boundsY + dims.boundsHeight)
      }),
      COORDINATE_PROPERTY_CONFIG
    )
  })

  it('is deterministic: identical inputs resolve to the identical physical location', () => {
    fc.assert(
      fc.property(coordinateScenarioArb, ({ dims, px, py }) => {
        const context: ScreenshotCoordinateContext = {
          renderedWidth: dims.renderedWidth,
          renderedHeight: dims.renderedHeight,
          nativeWidth: Math.round(dims.boundsWidth * dims.scaleFactor),
          nativeHeight: Math.round(dims.boundsHeight * dims.scaleFactor),
          displayBounds: {
            x: dims.boundsX,
            y: dims.boundsY,
            width: dims.boundsWidth,
            height: dims.boundsHeight,
          },
          scaleFactor: dims.scaleFactor,
        }

        const first = mapScreenshotPointToDesktop({ x: px, y: py }, context)
        const second = mapScreenshotPointToDesktop({ x: px, y: py }, context)

        expect(second).toEqual(first)
      }),
      COORDINATE_PROPERTY_CONFIG
    )
  })
})

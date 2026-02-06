/**
 * Property-Based Tests for Resize Direction Mapping
 *
 * Feature: frosted-sidebar-window-controls-fix
 * Task: 4.6 Write property test for resize direction mapping (Property 3)
 *
 * Property 3: Resize direction maps to correct bounds change
 *
 * *For any* resize direction (top, bottom, left, right, top-left, top-right,
 * bottom-left, bottom-right) and any mouse drag delta, the resulting window
 * bounds change should only affect the axes corresponding to that direction.
 *
 * **Validates: Requirements 2.2, 2.3**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { computeNewBounds, type ResizeDirection } from './ResizeHandles'

// ============================================================================
// Constants (must match ResizeHandles.tsx)
// ============================================================================

const MIN_WIDTH = 900
const MIN_HEIGHT = 600

// ============================================================================
// Arbitraries
// ============================================================================

/** Arbitrary for resize directions */
const directionArb: fc.Arbitrary<ResizeDirection> = fc.constantFrom(
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right'
)

/**
 * Arbitrary for start bounds — ensures width/height are at least MIN so that
 * the function's clamping logic doesn't mask axis-isolation checks.
 */
const startBoundsArb = fc.record({
  x: fc.integer({ min: -2000, max: 2000 }),
  y: fc.integer({ min: -2000, max: 2000 }),
  width: fc.integer({ min: MIN_WIDTH, max: 3000 }),
  height: fc.integer({ min: MIN_HEIGHT, max: 3000 }),
})

/** Arbitrary for mouse deltas (reasonable pixel range) */
const deltaArb = fc.integer({ min: -500, max: 500 })

// ============================================================================
// Helpers — which axes a direction affects
// ============================================================================

/** Directions that include a horizontal (left/right) component */
const AFFECTS_X: Set<ResizeDirection> = new Set([
  'left',
  'top-left',
  'bottom-left',
])

const AFFECTS_WIDTH: Set<ResizeDirection> = new Set([
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
])

const AFFECTS_Y: Set<ResizeDirection> = new Set([
  'top',
  'top-left',
  'top-right',
])

const AFFECTS_HEIGHT: Set<ResizeDirection> = new Set([
  'top',
  'bottom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
])

// ============================================================================
// Property 3 Tests
// ============================================================================

describe('Property 3: Resize direction maps to correct bounds change', () => {
  // --------------------------------------------------------------------------
  // Per-direction axis isolation tests
  // --------------------------------------------------------------------------

  it("'top' direction: y and height change, x and width unchanged", () => {
    fc.assert(
      fc.property(startBoundsArb, deltaArb, deltaArb, (startBounds, deltaX, deltaY) => {
        const result = computeNewBounds('top', startBounds, deltaX, deltaY)
        expect(result.x).toBe(startBounds.x)
        expect(result.width).toBe(startBounds.width)
      }),
      { numRuns: 100 }
    )
  })

  it("'bottom' direction: height changes, x, y, and width unchanged", () => {
    fc.assert(
      fc.property(startBoundsArb, deltaArb, deltaArb, (startBounds, deltaX, deltaY) => {
        const result = computeNewBounds('bottom', startBounds, deltaX, deltaY)
        expect(result.x).toBe(startBounds.x)
        expect(result.y).toBe(startBounds.y)
        expect(result.width).toBe(startBounds.width)
      }),
      { numRuns: 100 }
    )
  })

  it("'left' direction: x and width change, y and height unchanged", () => {
    fc.assert(
      fc.property(startBoundsArb, deltaArb, deltaArb, (startBounds, deltaX, deltaY) => {
        const result = computeNewBounds('left', startBounds, deltaX, deltaY)
        expect(result.y).toBe(startBounds.y)
        expect(result.height).toBe(startBounds.height)
      }),
      { numRuns: 100 }
    )
  })

  it("'right' direction: width changes, x, y, and height unchanged", () => {
    fc.assert(
      fc.property(startBoundsArb, deltaArb, deltaArb, (startBounds, deltaX, deltaY) => {
        const result = computeNewBounds('right', startBounds, deltaX, deltaY)
        expect(result.x).toBe(startBounds.x)
        expect(result.y).toBe(startBounds.y)
        expect(result.height).toBe(startBounds.height)
      }),
      { numRuns: 100 }
    )
  })

  it("'top-left' direction: x, y, width, height all may change (no axis is guaranteed unchanged)", () => {
    fc.assert(
      fc.property(startBoundsArb, deltaArb, deltaArb, (startBounds, deltaX, deltaY) => {
        const result = computeNewBounds('top-left', startBounds, deltaX, deltaY)
        // All four axes may change — just verify the result is a valid bounds object
        expect(typeof result.x).toBe('number')
        expect(typeof result.y).toBe('number')
        expect(typeof result.width).toBe('number')
        expect(typeof result.height).toBe('number')
      }),
      { numRuns: 100 }
    )
  })

  it("'top-right' direction: y, width, height may change, x unchanged", () => {
    fc.assert(
      fc.property(startBoundsArb, deltaArb, deltaArb, (startBounds, deltaX, deltaY) => {
        const result = computeNewBounds('top-right', startBounds, deltaX, deltaY)
        expect(result.x).toBe(startBounds.x)
      }),
      { numRuns: 100 }
    )
  })

  it("'bottom-left' direction: x, width, height may change, y unchanged", () => {
    fc.assert(
      fc.property(startBoundsArb, deltaArb, deltaArb, (startBounds, deltaX, deltaY) => {
        const result = computeNewBounds('bottom-left', startBounds, deltaX, deltaY)
        expect(result.y).toBe(startBounds.y)
      }),
      { numRuns: 100 }
    )
  })

  it("'bottom-right' direction: width and height may change, x and y unchanged", () => {
    fc.assert(
      fc.property(startBoundsArb, deltaArb, deltaArb, (startBounds, deltaX, deltaY) => {
        const result = computeNewBounds('bottom-right', startBounds, deltaX, deltaY)
        expect(result.x).toBe(startBounds.x)
        expect(result.y).toBe(startBounds.y)
      }),
      { numRuns: 100 }
    )
  })

  // --------------------------------------------------------------------------
  // General axis-isolation property (all directions)
  // --------------------------------------------------------------------------

  it('for any direction, axes NOT associated with that direction remain unchanged', () => {
    fc.assert(
      fc.property(
        directionArb,
        startBoundsArb,
        deltaArb,
        deltaArb,
        (direction, startBounds, deltaX, deltaY) => {
          const result = computeNewBounds(direction, startBounds, deltaX, deltaY)

          if (!AFFECTS_X.has(direction)) {
            expect(result.x).toBe(startBounds.x)
          }
          if (!AFFECTS_WIDTH.has(direction)) {
            expect(result.width).toBe(startBounds.width)
          }
          if (!AFFECTS_Y.has(direction)) {
            expect(result.y).toBe(startBounds.y)
          }
          if (!AFFECTS_HEIGHT.has(direction)) {
            expect(result.height).toBe(startBounds.height)
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  // --------------------------------------------------------------------------
  // Minimum dimension enforcement
  // --------------------------------------------------------------------------

  it('width never goes below MIN_WIDTH (900) for any direction and delta', () => {
    fc.assert(
      fc.property(
        directionArb,
        startBoundsArb,
        deltaArb,
        deltaArb,
        (direction, startBounds, deltaX, deltaY) => {
          const result = computeNewBounds(direction, startBounds, deltaX, deltaY)
          expect(result.width).toBeGreaterThanOrEqual(MIN_WIDTH)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('height never goes below MIN_HEIGHT (600) for any direction and delta', () => {
    fc.assert(
      fc.property(
        directionArb,
        startBoundsArb,
        deltaArb,
        deltaArb,
        (direction, startBounds, deltaX, deltaY) => {
          const result = computeNewBounds(direction, startBounds, deltaX, deltaY)
          expect(result.height).toBeGreaterThanOrEqual(MIN_HEIGHT)
        }
      ),
      { numRuns: 200 }
    )
  })

  // --------------------------------------------------------------------------
  // Zero-delta identity property
  // --------------------------------------------------------------------------

  it('zero delta produces unchanged bounds for any direction', () => {
    fc.assert(
      fc.property(directionArb, startBoundsArb, (direction, startBounds) => {
        const result = computeNewBounds(direction, startBounds, 0, 0)
        expect(result).toEqual(startBounds)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property-Based Test: Keyboard navigation focus index stays in bounds
 *
 *
 * For any visible session list of length N (N > 0) and any sequence of ArrowUp/ArrowDown
 * key presses starting from any valid focus index, the resulting focus index should always
 * remain within the range [0, N-1]. ArrowDown increments by 1 (clamped at N-1), ArrowUp
 * decrements by 1 (clamped at 0).
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// Focus index reducer (mirrors the keyboard navigation logic in Sidebar)

type KeyAction = 'ArrowDown' | 'ArrowUp'

function applyKeyAction(focusIndex: number, action: KeyAction, listLength: number): number {
  if (listLength === 0) return -1
  if (action === 'ArrowDown') {
    return Math.min(focusIndex + 1, listLength - 1)
  }
  if (action === 'ArrowUp') {
    return Math.max(focusIndex - 1, 0)
  }
  return focusIndex
}

function applyKeySequence(
  initialFocusIndex: number,
  actions: KeyAction[],
  listLength: number
): number {
  let index = initialFocusIndex
  for (const action of actions) {
    index = applyKeyAction(index, action, listLength)
  }
  return index
}

describe('Property 2: Keyboard navigation focus index stays in bounds', () => {
  it('focus index remains in [0, N-1] for any sequence of ArrowUp/ArrowDown', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }), // listLength N
        fc.integer({ min: 0, max: 99 }).chain((startIndex) =>
          fc.tuple(
            fc.constant(startIndex),
            fc.array(fc.constantFrom('ArrowDown' as KeyAction, 'ArrowUp' as KeyAction), {
              minLength: 1,
              maxLength: 200,
            })
          )
        ),
        (listLength, [rawStartIndex, actions]) => {
          const startIndex = Math.min(rawStartIndex, listLength - 1)
          const finalIndex = applyKeySequence(startIndex, actions, listLength)
          expect(finalIndex).toBeGreaterThanOrEqual(0)
          expect(finalIndex).toBeLessThan(listLength)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('ArrowDown from N-1 stays at N-1 (clamped)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (listLength) => {
        const result = applyKeyAction(listLength - 1, 'ArrowDown', listLength)
        expect(result).toBe(listLength - 1)
      }),
      { numRuns: 100 }
    )
  })

  it('ArrowUp from 0 stays at 0 (clamped)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (listLength) => {
        const result = applyKeyAction(0, 'ArrowUp', listLength)
        expect(result).toBe(0)
      }),
      { numRuns: 100 }
    )
  })

  it('ArrowDown increments by exactly 1 when not at end', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }),
        fc.integer({ min: 0, max: 98 }),
        (listLength, rawIndex) => {
          const index = Math.min(rawIndex, listLength - 2)
          const result = applyKeyAction(index, 'ArrowDown', listLength)
          expect(result).toBe(index + 1)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('ArrowUp decrements by exactly 1 when not at start', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }),
        fc.integer({ min: 1, max: 99 }),
        (listLength, rawIndex) => {
          const index = Math.min(rawIndex, listLength - 1)
          const result = applyKeyAction(index, 'ArrowUp', listLength)
          expect(result).toBe(index - 1)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('empty list always returns -1', () => {
    fc.assert(
      fc.property(fc.constantFrom('ArrowDown' as KeyAction, 'ArrowUp' as KeyAction), (action) => {
        const result = applyKeyAction(-1, action, 0)
        expect(result).toBe(-1)
      }),
      { numRuns: 100 }
    )
  })
})

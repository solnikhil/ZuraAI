/**
 * Property-Based Tests for the Agent Desktop held-input queue.
 *
 * Validates the held-input lifecycle (Req 3.6–3.8) of `HeldInputQueue`:
 *  - input requested while the Agent_Desktop is not displayed is parked, never
 *    delivered, and stamped with `expiresAt = requestedAt + HELD_INPUT_TTL_MS`
 *    (Property 12 / Req 3.6),
 *  - on a display switch the still-live held actions are released in FIFO order
 *    and the queue is emptied (Property 13 / Req 3.7),
 *  - actions that age out at/after their 60s expiry are reported expired,
 *    discarded, and never released (Property 14 / Req 3.8).
 *
 * Timing is driven by a mutable fake clock (a closure variable returned by
 * `now`) so expiry behavior is deterministic. fast-check + Vitest, min 100 runs.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import { HeldInputQueue, type HeldInputInput } from './heldInputQueue'
import { HELD_INPUT_TTL_MS } from './constants'
import type { AgentActionType } from './types'

const NUM_RUNS = 100

/** Create a queue backed by a mutable fake clock (closure variable). */
function createClockQueue(initial = 0) {
  let current = initial
  const queue = new HeldInputQueue({ now: () => current })
  return {
    queue,
    setTime: (t: number) => {
      current = t
    },
    advance: (delta: number) => {
      current += delta
    },
    getTime: () => current,
  }
}

// Input action types that the queue parks while the Agent_Desktop is hidden.
const inputActionArb: fc.Arbitrary<AgentActionType> = fc.constantFrom(
  'click',
  'type',
  'key',
  'scroll',
  'cursor_position'
)

const argsArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string(),
  fc.oneof(fc.string(), fc.integer(), fc.boolean())
)

const heldInputArb: fc.Arbitrary<HeldInputInput> = fc.record({
  action: inputActionArb,
  args: argsArb,
})

// A held input plus the clock gap (ms) to advance before enqueueing it, so that
// items can carry distinct requestedAt/expiresAt stamps within a single run.
const entryArb = fc.record({
  item: heldInputArb,
  gap: fc.integer({ min: 0, max: 2_000 }),
})

// Start times kept well clear of overflow concerns.
const startTimeArb = fc.integer({ min: 0, max: 1_000_000_000 })

describe('HeldInputQueue property tests', () => {
  // Feature: agent-desktop, Property 12: Input requested while the Agent_Desktop is not displayed is held, not delivered
  describe('Property 12: Input requested while the Agent_Desktop is not displayed is held, not delivered', () => {
    // Validates: Requirements 3.6
    it('parks every enqueued action in FIFO order with expiresAt = requestedAt + HELD_INPUT_TTL_MS and never delivers it', () => {
      fc.assert(
        fc.property(
          fc.array(entryArb, { minLength: 0, maxLength: 20 }),
          startTimeArb,
          (entries, startTime) => {
            const { queue, advance } = createClockQueue(startTime)

            const enqueued = entries.map((entry) => {
              advance(entry.gap)
              const sizeBefore = queue.size
              const stored = queue.enqueue(entry.item)

              // Enqueue parks the item: size grows by exactly one, nothing is delivered.
              expect(queue.size).toBe(sizeBefore + 1)
              // Stamp invariant: expiresAt is exactly TTL after the requestedAt clock read.
              expect(stored.expiresAt).toBe(stored.requestedAt + HELD_INPUT_TTL_MS)
              return { entry, stored }
            })

            // The queue holds everything (it never delivers): peek shows all items.
            const view = queue.peek()
            expect(view.length).toBe(entries.length)
            expect(queue.size).toBe(entries.length)

            // FIFO order is preserved and per-item stamping holds in the held view.
            view.forEach((held, index) => {
              const { entry, stored } = enqueued[index]
              expect(held.id).toBe(stored.id)
              expect(held.action).toBe(entry.item.action)
              expect(held.args).toEqual(entry.item.args)
              expect(held.expiresAt).toBe(held.requestedAt + HELD_INPUT_TTL_MS)
            })
          }
        ),
        { numRuns: NUM_RUNS }
      )
    })
  })

  // Feature: agent-desktop, Property 13: Held input is released on display switch in order
  describe('Property 13: Held input is released on display switch in order', () => {
    // Validates: Requirements 3.7
    it('releases all still-live held actions in FIFO order, empties the queue, and reports no expired actions', () => {
      fc.assert(
        fc.property(
          fc.array(entryArb, { minLength: 1, maxLength: 20 }),
          startTimeArb,
          fc.integer({ min: 0, max: HELD_INPUT_TTL_MS * 4 }),
          (entries, startTime, rawPreReleaseAdvance) => {
            const { queue, advance, getTime } = createClockQueue(startTime)

            const enqueuedIds: string[] = []
            for (const entry of entries) {
              advance(entry.gap)
              enqueuedIds.push(queue.enqueue(entry.item).id)
            }

            // The first item enqueued has the earliest expiry. Advance the clock
            // toward (but strictly before) that earliest expiry so the switch
            // happens before any action's 60s expiry.
            const earliestExpiry = startTime + HELD_INPUT_TTL_MS
            const maxSafeAdvance = earliestExpiry - 1 - getTime()
            const preReleaseAdvance = Math.max(0, Math.min(rawPreReleaseAdvance, maxSafeAdvance))
            advance(preReleaseAdvance)
            // Sanity: no action has reached its expiry yet.
            expect(getTime()).toBeLessThan(earliestExpiry)

            const { released, expired } = queue.release()

            // FIFO release order matches enqueue order.
            expect(released.map((item) => item.id)).toEqual(enqueuedIds)
            // Nothing aged out, so the expired partition is empty.
            expect(expired).toEqual([])
            // The display switch empties the queue.
            expect(queue.size).toBe(0)
            expect(queue.peek()).toEqual([])
          }
        ),
        { numRuns: NUM_RUNS }
      )
    })
  })

  // Feature: agent-desktop, Property 14: Held input expires after 60 seconds
  describe('Property 14: Held input expires after 60 seconds', () => {
    // Validates: Requirements 3.8
    it('reports every held action expired (never released) once the clock advances at least HELD_INPUT_TTL_MS past enqueue, via release()', () => {
      fc.assert(
        fc.property(
          fc.array(entryArb, { minLength: 1, maxLength: 20 }),
          startTimeArb,
          fc.integer({ min: 0, max: HELD_INPUT_TTL_MS * 4 }),
          (entries, startTime, extraAdvance) => {
            const { queue, setTime, advance } = createClockQueue(startTime)

            const enqueuedIds: string[] = []
            let lastRequestedAt = startTime
            for (const entry of entries) {
              advance(entry.gap)
              const stored = queue.enqueue(entry.item)
              enqueuedIds.push(stored.id)
              lastRequestedAt = stored.requestedAt
            }

            // Advance to at least the latest action's expiry so all are expired.
            setTime(lastRequestedAt + HELD_INPUT_TTL_MS + extraAdvance)

            const { released, expired } = queue.release()

            // Aged-out actions are surfaced as expired in FIFO order...
            expect(expired.map((item) => item.id)).toEqual(enqueuedIds)
            // ...never released...
            expect(released).toEqual([])
            // ...and discarded from the queue.
            expect(queue.size).toBe(0)
            expect(queue.peek()).toEqual([])
          }
        ),
        { numRuns: NUM_RUNS }
      )
    })

    // Validates: Requirements 3.8
    it('discards every expired held action via purgeExpired() and releases none afterward', () => {
      fc.assert(
        fc.property(
          fc.array(entryArb, { minLength: 1, maxLength: 20 }),
          startTimeArb,
          fc.integer({ min: 0, max: HELD_INPUT_TTL_MS * 4 }),
          (entries, startTime, extraAdvance) => {
            const { queue, setTime, advance } = createClockQueue(startTime)

            const enqueuedIds: string[] = []
            let lastRequestedAt = startTime
            for (const entry of entries) {
              advance(entry.gap)
              const stored = queue.enqueue(entry.item)
              enqueuedIds.push(stored.id)
              lastRequestedAt = stored.requestedAt
            }

            setTime(lastRequestedAt + HELD_INPUT_TTL_MS + extraAdvance)

            const purged = queue.purgeExpired()
            // Expired actions are removed in FIFO order.
            expect(purged.map((item) => item.id)).toEqual(enqueuedIds)
            expect(queue.size).toBe(0)

            // Nothing remains to release.
            const { released, expired } = queue.release()
            expect(released).toEqual([])
            expect(expired).toEqual([])
          }
        ),
        { numRuns: NUM_RUNS }
      )
    })

    // Validates: Requirements 3.8
    it('treats the expiry boundary as expired at now === expiresAt and as still-live one tick before', () => {
      fc.assert(
        fc.property(heldInputArb, startTimeArb, (item, requestedAt) => {
          const expiresAt = requestedAt + HELD_INPUT_TTL_MS

          // Just before expiry (now === expiresAt - 1): still live, released.
          const before = createClockQueue(requestedAt)
          const liveItem = before.queue.enqueue(item)
          before.setTime(expiresAt - 1)
          const beforeResult = before.queue.release()
          expect(beforeResult.released.map((r) => r.id)).toEqual([liveItem.id])
          expect(beforeResult.expired).toEqual([])

          // Exactly at expiry (now === expiresAt): expired, never released.
          const atBoundary = createClockQueue(requestedAt)
          const expiredItem = atBoundary.queue.enqueue(item)
          atBoundary.setTime(expiresAt)
          const atResult = atBoundary.queue.release()
          expect(atResult.expired.map((r) => r.id)).toEqual([expiredItem.id])
          expect(atResult.released).toEqual([])
          expect(atBoundary.queue.size).toBe(0)
        }),
        { numRuns: NUM_RUNS }
      )
    })
  })
})

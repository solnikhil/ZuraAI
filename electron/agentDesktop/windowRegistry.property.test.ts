/**
 * Property-Based Tests for the Agent Desktop window registry.
 *
 * Validates the design's correctness properties for `WindowRegistry`
 * (`electron/agentDesktop/windowRegistry.ts`):
 *
 * - Property 8: Window–run association is preserved across operations (Req 2.3)
 * - Property 9: Placement failure is recorded after the attempt threshold (Req 2.5)
 *
 * The registry is pure in-memory state with an injectable clock, so these tests
 * exercise it directly with no mocking of native side-effects.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { WindowRegistry } from './windowRegistry'
import { MAX_PLACEMENT_ATTEMPTS } from './constants'
import type { WindowResidence } from './types'

const NUM_RUNS = 100

// A small, fixed pool of run identifiers so sequences naturally interleave
// windows from several Agent_Runs.
const runIdArb = fc.constantFrom('run-a', 'run-b', 'run-c', 'run-d')

// A small HWND space so register/remove operations collide on the same handle
// often, exercising replacement and removal semantics.
const hwndArb = fc.integer({ min: 1, max: 20 })

const residenceArb = fc.constantFrom<WindowResidence>('agent-desktop', 'user-desktop')

const titleArb = fc.string({ minLength: 0, maxLength: 24 })
const pidArb = fc.integer({ min: 1, max: 10_000 })

type Operation =
  | { type: 'register'; hwnd: number; agentRunId: string; title: string; pid: number; residence: WindowResidence }
  | { type: 'updateResidence'; hwnd: number; residence: WindowResidence }
  | { type: 'recordPlacementAttempt'; hwnd: number }
  | { type: 'remove'; hwnd: number }

const operationArb: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({
    type: fc.constant('register' as const),
    hwnd: hwndArb,
    agentRunId: runIdArb,
    title: titleArb,
    pid: pidArb,
    residence: residenceArb,
  }),
  fc.record({
    type: fc.constant('updateResidence' as const),
    hwnd: hwndArb,
    residence: residenceArb,
  }),
  fc.record({
    type: fc.constant('recordPlacementAttempt' as const),
    hwnd: hwndArb,
  }),
  fc.record({
    type: fc.constant('remove' as const),
    hwnd: hwndArb,
  })
)

describe('WindowRegistry property tests', () => {
  // Feature: agent-desktop, Property 8: Window–run association is preserved across operations
  it('Property 8: every live window keeps the run id it was registered with, and getByRun is exact', () => {
    fc.assert(
      fc.property(fc.array(operationArb, { minLength: 0, maxLength: 60 }), (operations) => {
        const registry = new WindowRegistry({ now: () => 0 })

        // Oracle: the run id each currently-live HWND was last registered with.
        const expectedRunById = new Map<number, string>()

        const assertAssociationsHold = () => {
          // Every window the oracle considers live must exist in the registry
          // with exactly the run id it was registered under.
          for (const [hwnd, runId] of expectedRunById) {
            const record = registry.get(hwnd)
            expect(record).toBeDefined()
            expect(record?.agentRunId).toBe(runId)
          }

          // The registry must not hold any window the oracle does not know about.
          expect(registry.size).toBe(expectedRunById.size)

          // getByRun(runId) returns exactly the windows registered for that run.
          const runIds = new Set(expectedRunById.values())
          for (const runId of runIds) {
            const expectedHwnds = new Set(
              Array.from(expectedRunById.entries())
                .filter(([, id]) => id === runId)
                .map(([hwnd]) => hwnd)
            )
            const actual = registry.getByRun(runId)
            const actualHwnds = new Set(actual.map((r) => r.hwnd))

            expect(actualHwnds).toEqual(expectedHwnds)
            // Each returned record genuinely belongs to the queried run.
            for (const record of actual) {
              expect(record.agentRunId).toBe(runId)
            }
          }
        }

        for (const op of operations) {
          switch (op.type) {
            case 'register': {
              registry.register({
                hwnd: op.hwnd,
                agentRunId: op.agentRunId,
                title: op.title,
                pid: op.pid,
                residence: op.residence,
              })
              // Registration fully replaces any prior record for the HWND.
              expectedRunById.set(op.hwnd, op.agentRunId)
              break
            }
            case 'updateResidence': {
              // Capture the association of an unrelated run to prove isolation:
              // a residence update must never change any window's run id.
              registry.updateResidence(op.hwnd, op.residence)
              break
            }
            case 'recordPlacementAttempt': {
              registry.recordPlacementAttempt(op.hwnd)
              break
            }
            case 'remove': {
              // Removing one window must not touch any other window's run id.
              registry.remove(op.hwnd)
              expectedRunById.delete(op.hwnd)
              break
            }
          }

          // Invariant must hold after every single operation, which captures
          // "removing a window from one run never affects another run's
          // associations" because all surviving associations are re-verified.
          assertAssociationsHold()
        }
      }),
      { numRuns: NUM_RUNS }
    )
  })

  // Feature: agent-desktop, Property 9: Placement failure is recorded after the attempt threshold
  it('Property 9: recordPlacementAttempt accumulates monotonically and reports thresholdReached at MAX_PLACEMENT_ATTEMPTS', () => {
    fc.assert(
      fc.property(
        hwndArb,
        runIdArb,
        fc.integer({ min: 1, max: MAX_PLACEMENT_ATTEMPTS + 5 }),
        (hwnd, runId, attemptCount) => {
          const registry = new WindowRegistry({ now: () => 0 })
          registry.register({ hwnd, agentRunId: runId, title: 'win', pid: 1 })

          let previous = 0
          for (let i = 1; i <= attemptCount; i++) {
            const result = registry.recordPlacementAttempt(hwnd)

            // A registered window always yields a result.
            expect(result).toBeDefined()
            // Attempts accumulate monotonically, by exactly one per call.
            expect(result?.attempts).toBe(previous + 1)
            expect(result?.attempts).toBe(i)
            previous = result?.attempts ?? previous

            // thresholdReached is true if and only if attempts have reached the cap.
            expect(result?.thresholdReached).toBe(i >= MAX_PLACEMENT_ATTEMPTS)
          }
        }
      ),
      { numRuns: NUM_RUNS }
    )
  })

  // Feature: agent-desktop, Property 9: Placement failure is recorded after the attempt threshold
  it('Property 9: recordPlacementAttempt returns undefined for an unknown hwnd and leaves the registry untouched', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(hwndArb, { minLength: 0, maxLength: 10 }),
        runIdArb,
        (registeredHwnds, runId) => {
          const registry = new WindowRegistry({ now: () => 0 })
          for (const hwnd of registeredHwnds) {
            registry.register({ hwnd, agentRunId: runId, title: 'win', pid: 1 })
          }

          // Choose an hwnd guaranteed not to be registered (above the HWND pool).
          const unknownHwnd = 1_000

          expect(registry.recordPlacementAttempt(unknownHwnd)).toBeUndefined()
          // No phantom window is created and existing counters are unaffected.
          expect(registry.isAgentWindow(unknownHwnd)).toBe(false)
          expect(registry.size).toBe(registeredHwnds.length)
          for (const hwnd of registeredHwnds) {
            expect(registry.get(hwnd)?.placementAttempts).toBe(0)
          }
        }
      ),
      { numRuns: NUM_RUNS }
    )
  })

  // Feature: agent-desktop, Property 9: Placement failure is recorded after the attempt threshold
  it('Property 9: per-window placement counters are independent across runs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_PLACEMENT_ATTEMPTS + 3 }),
        fc.integer({ min: 0, max: MAX_PLACEMENT_ATTEMPTS + 3 }),
        (attemptsA, attemptsB) => {
          const registry = new WindowRegistry({ now: () => 0 })
          registry.register({ hwnd: 1, agentRunId: 'run-a', title: 'a', pid: 1 })
          registry.register({ hwnd: 2, agentRunId: 'run-b', title: 'b', pid: 2 })

          let lastA: number | undefined
          for (let i = 0; i < attemptsA; i++) {
            lastA = registry.recordPlacementAttempt(1)?.attempts
          }
          let lastB: number | undefined
          for (let i = 0; i < attemptsB; i++) {
            lastB = registry.recordPlacementAttempt(2)?.attempts
          }

          expect(registry.get(1)?.placementAttempts).toBe(attemptsA)
          expect(registry.get(2)?.placementAttempts).toBe(attemptsB)
          if (attemptsA > 0) expect(lastA).toBe(attemptsA)
          if (attemptsB > 0) expect(lastB).toBe(attemptsB)
        }
      ),
      { numRuns: NUM_RUNS }
    )
  })
})

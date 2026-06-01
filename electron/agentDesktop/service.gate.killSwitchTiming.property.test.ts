// @vitest-environment node

// Feature: agent-desktop, Property 23: Kill-switch double-Escape timing

/**
 * Property-based test for the Agent Desktop double-Escape kill-switch timing
 * window (Task 13.5).
 *
 * Covered correctness property (from the design):
 * - Property 23: Kill-switch double-Escape timing (Req 6.1, 6.2, 6.3) — Task 13.5
 *
 * ## What the property asserts
 * *For any* pair of Escape-press timestamps, the kill switch aborts the active
 * Agent_Run **if and only if** the interval between the two presses is strictly
 * less than {@link KILL_SWITCH_WINDOW_MS} (500ms):
 * - Two Escape presses within KILL_SWITCH_WINDOW_MS abort the run (Req 6.1, 6.2).
 * - A second Escape press strictly MORE than KILL_SWITCH_WINDOW_MS after the
 *   first does NOT abort, and that later press is treated as the first press of
 *   a brand-new Kill_Switch sequence — so a follow-up press within the window of
 *   *it* then aborts (Req 6.3).
 * - The boundary is strict: a gap of exactly KILL_SWITCH_WINDOW_MS does not
 *   abort.
 *
 * Timing is driven entirely by the explicit timestamps passed to
 * {@link AgentDesktopService.registerEscape} (the injectable-clock seam), so the
 * detector is exercised deterministically with no real timers.
 *
 * ## Test strategy
 * The service is exercised in isolation over a fully-controllable in-memory mock
 * {@link VdaBinding} (no real DLL / `koffi`, no nut.js, no `desktopCapturer`) and
 * an injected clock. An enabled, disclosure-acknowledged settings object plus an
 * `available` VDA load lets `startSession` provision an active Agent_Run so the
 * abort acts on a real session (Req 6.2). Escape timestamps and gaps are
 * generated so the iff-invariant is checked across 200 inputs per property,
 * with the strict boundary (`< 500ms`) explicitly seeded into the generators.
 *
 * The API usage mirrors the sibling test
 * `service.gate.postAbort.property.test.ts`: `service.registerEscape(timestamp)`
 * returns `true` exactly when that press triggered an abort.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
  createAgentDesktopService,
  type AgentDesktopService,
  type AgentDesktopTimelineStep,
} from './service'
import { KILL_SWITCH_WINDOW_MS } from './constants'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { VdaLoadOutcome } from './types'
import { defaultAgentDesktopSettings, type AgentDesktopSettings } from './settings'

/**
 * Shared property-test configuration. A stable seed keeps any failure
 * reproducible; `numRuns` comfortably exceeds the spec's minimum of 100.
 */
const PROPERTY_TEST_CONFIG = { numRuns: 200, seed: 0x23c0 }

/** Index the mock hands out for the first {@link MockVdaBinding.createDesktop}. */
const FIRST_CREATED_INDEX = 100

/**
 * A minimal, fully-controllable in-memory {@link VdaBinding}.
 *
 * `load()` reports `available` so `initialize` + `startSession` can provision a
 * session, making the kill-switch abort act on a real active Agent_Run. No OS
 * work happens — only the kill-switch timing logic is under test.
 */
class MockVdaBinding implements VdaBinding {
  private available = false
  current = 0
  private nextIndex = FIRST_CREATED_INDEX
  private existing = new Set<number>([0])
  windows: VdaWindowInfo[] = []
  goToDesktopCalls: number[] = []

  async load(): Promise<VdaLoadOutcome> {
    this.available = true
    return 'available'
  }

  isAvailable(): boolean {
    return this.available
  }

  getLoadError(): string | null {
    return null
  }

  getCurrentDesktopIndex(): number {
    return this.current
  }

  getDesktopCount(): number {
    return this.existing.size
  }

  createDesktop(): number {
    const index = this.nextIndex++
    this.existing.add(index)
    return index
  }

  removeDesktop(index: number): void {
    this.existing.delete(index)
  }

  goToDesktop(index: number): void {
    this.current = index
    this.goToDesktopCalls.push(index)
  }

  desktopExists(index: number): boolean {
    return this.existing.has(index)
  }

  moveWindowToDesktop(): void {
    /* placement is confirmed via isWindowOnDesktop below */
  }

  isWindowOnDesktop(): boolean {
    return true
  }

  enumerateWindows(): VdaWindowInfo[] {
    return this.windows.slice()
  }

  dispose(): void {
    this.available = false
  }
}

/** Enabled, disclosure-acknowledged settings so a session can be provisioned. */
function makeEnabledSettings(): AgentDesktopSettings {
  return {
    ...defaultAgentDesktopSettings,
    approvalPolicy: { ...defaultAgentDesktopSettings.approvalPolicy },
    enabled: true,
    disclosureAcknowledged: true,
  }
}

/**
 * Build an initialized service with an active session over the supplied mock
 * binding and injected clock. `startSession` resets the kill-switch sequence
 * (`lastEscapeAt`) and the abort latch, giving each property run a clean slate.
 */
async function makeSessionService(
  binding: MockVdaBinding,
  now: () => number
): Promise<AgentDesktopService> {
  const service = createAgentDesktopService({
    binding,
    settings: makeEnabledSettings(),
    platformSupported: true,
    now,
  })
  await service.initialize()
  const result = await service.startSession('run-1')
  expect(result.provisioned).toBe(true)
  // A freshly provisioned session is never aborted.
  expect(service.isAborted()).toBe(false)
  return service
}

/** Capture every timeline step the service emits for abort assertions. */
function recordTimeline(service: AgentDesktopService): AgentDesktopTimelineStep[] {
  const steps: AgentDesktopTimelineStep[] = []
  service.onTimelineStep((step) => steps.push(step))
  return steps
}

// Shared generators.

/**
 * First Escape-press timestamp. Strictly positive so it is never the `0`
 * sentinel the detector uses to mean "no sequence in progress".
 */
const firstPressArb = fc.integer({ min: 1, max: 10_000_000 })

/**
 * Gap (ms) between two consecutive Escape presses, seeded to straddle the strict
 * 500ms boundary so the iff-invariant is checked right at the edge:
 * - `0` (simultaneous), `1` (just inside),
 * - `KILL_SWITCH_WINDOW_MS - 1` (last gap that aborts),
 * - `KILL_SWITCH_WINDOW_MS` (first gap that does NOT abort — strict bound),
 * - `KILL_SWITCH_WINDOW_MS + 1` (just outside),
 * - plus a broad uniform spread well past the window.
 */
const gapArb = fc.oneof(
  fc.integer({ min: 0, max: 3 * KILL_SWITCH_WINDOW_MS }),
  fc.constantFrom(
    0,
    1,
    KILL_SWITCH_WINDOW_MS - 1,
    KILL_SWITCH_WINDOW_MS,
    KILL_SWITCH_WINDOW_MS + 1
  )
)

/** A gap strictly inside the kill-switch window (aborts on the second press). */
const insideWindowGapArb = fc.integer({ min: 0, max: KILL_SWITCH_WINDOW_MS - 1 })

/** A gap at-or-past the kill-switch window (does NOT abort on the second press). */
const outsideWindowGapArb = fc.integer({
  min: KILL_SWITCH_WINDOW_MS,
  max: 5 * KILL_SWITCH_WINDOW_MS,
})

// ---------------------------------------------------------------------------
// Property 23 — Task 13.5
// ---------------------------------------------------------------------------

describe('AgentDesktopService kill switch — Property 23: double-Escape timing', () => {
  // Feature: agent-desktop, Property 23: Kill-switch double-Escape timing
  // Validates: Requirements 6.1, 6.2, 6.3
  it('aborts the active run on the second Escape iff the gap is strictly less than KILL_SWITCH_WINDOW_MS', async () => {
    await fc.assert(
      fc.asyncProperty(firstPressArb, gapArb, async (firstPressAt, gap) => {
        const binding = new MockVdaBinding()
        const service = await makeSessionService(binding, () => firstPressAt)

        // First Escape press: always begins a sequence, never aborts.
        expect(service.registerEscape(firstPressAt)).toBe(false)
        expect(service.isAborted()).toBe(false)

        // Second Escape press: aborts iff the interval is strictly < the window.
        const shouldAbort = gap < KILL_SWITCH_WINDOW_MS
        const aborted = service.registerEscape(firstPressAt + gap)

        expect(aborted).toBe(shouldAbort)
        // The abort decision and the active-run abort state agree (Req 6.2).
        expect(service.isAborted()).toBe(shouldAbort)
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 23: Kill-switch double-Escape timing
  // Validates: Requirements 6.1, 6.2
  it('aborts and records a kill-switch step when two presses fall within the window', async () => {
    await fc.assert(
      fc.asyncProperty(firstPressArb, insideWindowGapArb, async (firstPressAt, gap) => {
        const binding = new MockVdaBinding()
        const service = await makeSessionService(binding, () => firstPressAt)
        const steps = recordTimeline(service)

        expect(service.registerEscape(firstPressAt)).toBe(false)
        expect(service.registerEscape(firstPressAt + gap)).toBe(true)

        // The active Agent_Run is aborted (Req 6.2) and a kill-switch-abort step
        // was emitted for the run.
        expect(service.isAborted()).toBe(true)
        expect(steps.some((s) => s.kind === 'kill-switch-abort')).toBe(true)
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 23: Kill-switch double-Escape timing
  // Validates: Requirements 6.3
  it('does not abort when the second press is at or past the window (strict boundary)', async () => {
    await fc.assert(
      fc.asyncProperty(firstPressArb, outsideWindowGapArb, async (firstPressAt, gap) => {
        const binding = new MockVdaBinding()
        const service = await makeSessionService(binding, () => firstPressAt)
        const steps = recordTimeline(service)

        expect(service.registerEscape(firstPressAt)).toBe(false)
        // A second press at-or-past the window does not complete a double-Escape.
        expect(service.registerEscape(firstPressAt + gap)).toBe(false)

        expect(service.isAborted()).toBe(false)
        expect(steps.some((s) => s.kind === 'kill-switch-abort')).toBe(false)
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 23: Kill-switch double-Escape timing
  // Validates: Requirements 6.3
  it('treats a too-late second press as the first press of a new sequence that can then abort', async () => {
    await fc.assert(
      fc.asyncProperty(
        firstPressArb,
        // First→second gap is at/past the window (no abort, starts a new sequence).
        outsideWindowGapArb,
        // Second→third gap is strictly inside the window (aborts the new sequence).
        insideWindowGapArb,
        async (firstPressAt, lateGap, freshGap) => {
          const binding = new MockVdaBinding()
          const service = await makeSessionService(binding, () => firstPressAt)

          // Press 1 — starts a sequence.
          expect(service.registerEscape(firstPressAt)).toBe(false)
          expect(service.isAborted()).toBe(false)

          // Press 2 — too late: does not abort, becomes the new "first" press.
          const secondPressAt = firstPressAt + lateGap
          expect(service.registerEscape(secondPressAt)).toBe(false)
          expect(service.isAborted()).toBe(false)

          // Press 3 — within the window of press 2: completes a double-Escape on
          // the new sequence and aborts (Req 6.3).
          expect(service.registerEscape(secondPressAt + freshGap)).toBe(true)
          expect(service.isAborted()).toBe(true)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 23: Kill-switch double-Escape timing
  // Validates: Requirements 6.1, 6.2, 6.3
  it('walks a sequence of presses and aborts exactly at the first within-window consecutive pair', async () => {
    await fc.assert(
      fc.asyncProperty(
        firstPressArb,
        fc.array(gapArb, { minLength: 1, maxLength: 12 }),
        async (firstPressAt, gaps) => {
          const binding = new MockVdaBinding()
          const service = await makeSessionService(binding, () => firstPressAt)

          // Build absolute, non-decreasing press timestamps from the gaps.
          const timestamps: number[] = [firstPressAt]
          for (const gap of gaps) {
            timestamps.push(timestamps[timestamps.length - 1] + gap)
          }

          // Reference model: the kill switch fires on the FIRST consecutive pair
          // whose gap is strictly < the window; once it fires, the sequence ends.
          let expectedAbortIndex = -1
          for (let i = 1; i < timestamps.length; i++) {
            if (timestamps[i] - timestamps[i - 1] < KILL_SWITCH_WINDOW_MS) {
              expectedAbortIndex = i
              break
            }
          }

          let firedIndex = -1
          for (let i = 0; i < timestamps.length; i++) {
            const fired = service.registerEscape(timestamps[i])
            if (fired) {
              firedIndex = i
              break
            }
          }

          expect(firedIndex).toBe(expectedAbortIndex)
          expect(service.isAborted()).toBe(expectedAbortIndex !== -1)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})

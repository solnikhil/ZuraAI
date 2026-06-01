// @vitest-environment node

// Feature: agent-desktop, Property 24: Aborted sessions dispatch no further actions

/**
 * Property-based test for the Agent Desktop Computer Use gate's post-abort
 * dispatch refusal (Task 13.6).
 *
 * Covered correctness property (from the design):
 * - Property 24: Aborted sessions dispatch no further actions (Req 6.4) — Task 13.6
 *
 * ## What the property asserts
 * Once an Agent_Run is aborted by the kill switch
 * ({@link AgentDesktopService.abortForKillSwitch}, reachable directly or via a
 * double-Escape through {@link AgentDesktopService.registerEscape}), EVERY
 * subsequent {@link AgentDesktopService.gateComputerAction} call for that session
 * is refused. The gate must:
 * - return `{ allow: false }` for every subsequent action (no dispatch signal),
 * - report `outcome: 'aborted'` for every valid Computer Use action,
 * - never increment the shared action counter past the abort reset (no work is
 *   counted because no action is dispatched),
 * - never emit an `action-allowed` or `action-held` timeline step after the
 *   abort (a held step would mean an input action was parked for later delivery,
 *   i.e. still "dispatched" eventually — that must not happen post-abort),
 * - never park input in the held-input queue (Req 6.4: dispatch stops entirely).
 *
 * This directly validates Requirement 6.4: "WHEN the Kill_Switch aborts an
 * Agent_Run, THE Agent_Desktop_Service SHALL stop dispatching any further
 * Computer_Use actions ... for that session."
 *
 * ## Test strategy
 * The service is exercised in isolation over a fully-controllable in-memory mock
 * {@link VdaBinding} (no real DLL / `koffi`, no nut.js, no `desktopCapturer`) and
 * an injectable clock for the kill-switch timing. An enabled, disclosure-
 * acknowledged settings object plus an `available` VDA load lets `startSession`
 * provision a session so the gate is reachable; the abort then flips behavior.
 * Actions, targeting metadata, and the abort trigger are all generated so the
 * invariant is checked across 200 inputs per property.
 *
 * The gate's dispatch signal is `{ allow: true }` (the caller delegates to the
 * real Computer Use executor only then). "No dispatch" is therefore observed
 * directly as the gate never returning `allow: true` after the abort.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
  createAgentDesktopService,
  type AgentDesktopService,
  type AgentDesktopTimelineStep,
  type GateDecision,
} from './service'
import { KILL_SWITCH_WINDOW_MS } from './constants'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { AgentActionType, VdaLoadOutcome } from './types'
import { defaultAgentDesktopSettings, type AgentDesktopSettings } from './settings'

/**
 * Shared property-test configuration. A stable seed keeps any failure
 * reproducible; `numRuns` comfortably exceeds the spec's minimum of 100.
 */
const PROPERTY_TEST_CONFIG = { numRuns: 200, seed: 0x24a0 }

/** Index the mock hands out for the first {@link MockVdaBinding.createDesktop}. */
const FIRST_CREATED_INDEX = 100

/** The complete Computer Use action surface Agent Desktop reuses (Req 4.1). */
const VALID_ACTIONS: readonly AgentActionType[] = [
  'screenshot',
  'click',
  'type',
  'key',
  'scroll',
  'cursor_position',
  'list_windows',
  'launch_app',
  'close_app',
  'find_app',
]

/** Input actions among the surface — these are the ones presence/holding gates. */
const INPUT_ACTIONS: readonly AgentActionType[] = [
  'click',
  'type',
  'key',
  'scroll',
  'cursor_position',
]

/**
 * A minimal, fully-controllable in-memory {@link VdaBinding} for the gate.
 *
 * `load()` reports `available`, and `goToDesktop` updates the displayed index so
 * `activateTakeOver` (which confirms the switch via `getCurrentDesktopIndex`)
 * can succeed. `isWindowOnDesktop` reports `true` so `notifyWindowOpened` can
 * confirm placement when a property needs an Agent_Window registered. No OS work
 * actually happens — the gate's decision logic is what is under test.
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

/** Enabled, disclosure-acknowledged settings so the gate is reachable. */
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
 * binding and injected clock. The gate is reachable (`available` VDA, enabled
 * skill, provisioned session in `background` presence).
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
  return service
}

/** Capture every timeline step the service emits for post-abort assertions. */
function recordTimeline(service: AgentDesktopService): AgentDesktopTimelineStep[] {
  const steps: AgentDesktopTimelineStep[] = []
  service.onTimelineStep((step) => steps.push(step))
  return steps
}

/** Assert a decision is a refusal (never the dispatch signal `allow: true`). */
function expectRefused(decision: GateDecision): void {
  expect(decision.allow).toBe(false)
}

// Shared generators.
const validActionArb = fc.constantFrom<AgentActionType>(...VALID_ACTIONS)
const hwndArb = fc.integer({ min: 1, max: 1_000_000 })

/** A gate input over the Computer Use surface with optional targeting metadata. */
const gateInputArb = fc.record({
  action: validActionArb,
  targetHwnd: fc.option(hwndArb, { nil: undefined }),
  onAgentDesktop: fc.option(fc.boolean(), { nil: undefined }),
})

// ---------------------------------------------------------------------------
// Property 24 — Task 13.6
// ---------------------------------------------------------------------------

describe('AgentDesktopService gate — Property 24: aborted sessions dispatch no further actions', () => {
  // Feature: agent-desktop, Property 24: Aborted sessions dispatch no further actions
  // Validates: Requirements 6.4
  it('refuses every subsequent gate call with outcome "aborted" after abortForKillSwitch (no dispatch)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(gateInputArb, { minLength: 1, maxLength: 20 }),
        async (subsequentActions) => {
          const binding = new MockVdaBinding()
          let clock = 1_000
          const service = await makeSessionService(binding, () => clock)
          const steps = recordTimeline(service)

          // Abort the active run via the kill switch (Req 6.2–6.4).
          service.abortForKillSwitch()
          expect(service.isAborted()).toBe(true)
          // The shared action counter is reset by the abort.
          expect(service.getActionCount()).toBe(0)

          for (const input of subsequentActions) {
            clock += 5
            const decision = await service.gateComputerAction(input)

            // Core invariant (Req 6.4): no dispatch — never `allow: true`.
            expectRefused(decision)
            // Every valid Computer Use action is refused specifically because the
            // session was aborted.
            if (!decision.allow) {
              expect(decision.outcome).toBe('aborted')
            }
          }

          // No action was counted (nothing was dispatched), and the abort latch
          // is still set for the whole session.
          expect(service.getActionCount()).toBe(0)
          expect(service.isAborted()).toBe(true)

          // No post-abort step ever allowed or held an action. The only gate
          // steps emitted are kill-switch + aborted rejections.
          const postAbortGateSteps = steps.filter(
            (s) =>
              s.kind === 'action-allowed' ||
              s.kind === 'action-held' ||
              s.kind === 'held-expired'
          )
          expect(postAbortGateSteps).toHaveLength(0)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 24: Aborted sessions dispatch no further actions
  // Validates: Requirements 6.4
  it('produces the same post-abort refusal when the abort came from a double-Escape kill switch', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(validActionArb, { minLength: 1, maxLength: 15 }),
        // A second Escape strictly within the kill-switch window triggers abort.
        fc.integer({ min: 0, max: KILL_SWITCH_WINDOW_MS - 1 }),
        async (actions, secondPressGap) => {
          const binding = new MockVdaBinding()
          let clock = 5_000
          const service = await makeSessionService(binding, () => clock)
          const steps = recordTimeline(service)

          // Double-Escape within KILL_SWITCH_WINDOW_MS aborts the run (Req 6.1, 6.2).
          const firstPressAt = clock
          expect(service.registerEscape(firstPressAt)).toBe(false)
          const aborted = service.registerEscape(firstPressAt + secondPressGap)
          expect(aborted).toBe(true)
          expect(service.isAborted()).toBe(true)

          // A kill-switch-abort step was recorded for the run.
          expect(steps.some((s) => s.kind === 'kill-switch-abort')).toBe(true)

          for (const action of actions) {
            clock += 3
            const decision = await service.gateComputerAction({ action, args: {} })
            expectRefused(decision)
            if (!decision.allow) {
              expect(decision.outcome).toBe('aborted')
            }
          }

          expect(service.getActionCount()).toBe(0)
          expect(
            steps.some((s) => s.kind === 'action-allowed' || s.kind === 'action-held')
          ).toBe(false)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 24: Aborted sessions dispatch no further actions
  // Validates: Requirements 6.4
  it('refuses an action that WOULD have been dispatched before the abort', async () => {
    await fc.assert(
      fc.asyncProperty(validActionArb, async (action) => {
        const binding = new MockVdaBinding()
        let clock = 9_000
        const service = await makeSessionService(binding, () => clock)

        // Bring the session into Take_Over so input actions are deliverable, and
        // register an Agent_Window so a window-targeted action passes targeting.
        const takeOver = await service.activateTakeOver()
        expect(takeOver.ok).toBe(true)
        const hwnd = 4242
        await service.notifyWindowOpened(hwnd)

        // Build an input the gate would ALLOW pre-abort: window-targeted input
        // actions get a confirmed-on-Agent_Desktop target; non-input actions
        // (screenshot/list_windows/find_app/launch_app/close_app) don't need one.
        const isInput = INPUT_ACTIONS.includes(action)
        const baselineInput = isInput
          ? { action, args: {}, targetHwnd: hwnd, onAgentDesktop: true }
          : action === 'close_app'
            ? { action, args: {}, targetHwnd: hwnd, onAgentDesktop: true }
            : { action, args: {} }

        const before = await service.gateComputerAction(baselineInput)
        // Sanity: at least one representative action is genuinely dispatchable
        // pre-abort. (Approval-required actions still return allow:true with
        // autoApprove:false; the caller then prompts.)
        expect(before.allow).toBe(true)

        // Now abort, then re-issue the exact same input.
        service.abortForKillSwitch()
        const after = await service.gateComputerAction(baselineInput)

        expectRefused(after)
        if (!after.allow) {
          expect(after.outcome).toBe('aborted')
        }
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 24: Aborted sessions dispatch no further actions
  // Validates: Requirements 6.4
  it('never returns the dispatch signal post-abort for any action name, in or out of the surface', async () => {
    // Broader invariant: even arbitrary / out-of-surface action names must never
    // be dispatched after an abort. (Out-of-surface names are rejected by the
    // surface gate with outcome "rejected"; in-surface names by the abort gate
    // with "aborted". Either way: allow:false, no dispatch.)
    const anyActionArb = fc.oneof(
      validActionArb,
      fc.constantFrom('navigate', 'drag', 'paste', 'open_url', 'CLICK', ''),
      fc.string({ maxLength: 12 })
    )

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            action: anyActionArb,
            targetHwnd: fc.option(hwndArb, { nil: undefined }),
            onAgentDesktop: fc.option(fc.boolean(), { nil: undefined }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        async (inputs) => {
          const binding = new MockVdaBinding()
          let clock = 12_000
          const service = await makeSessionService(binding, () => clock)

          service.abortForKillSwitch()

          for (const input of inputs) {
            clock += 2
            const decision = await service.gateComputerAction(input)
            expectRefused(decision)
            // Valid in-surface names are refused as "aborted"; out-of-surface
            // names are refused as "rejected" — neither is ever dispatched.
            if (!decision.allow) {
              expect(['aborted', 'rejected']).toContain(decision.outcome)
            }
          }

          expect(service.getActionCount()).toBe(0)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})

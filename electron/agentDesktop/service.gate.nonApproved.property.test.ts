// @vitest-environment node

/**
 * Property-based test for the Agent Desktop non-approved outcome handling
 * (Task 13.4 / Property 22). Lives in a dedicated file so it never collides with
 * the other parallel gate test-authoring tasks (Properties 16, 17, 23–39).
 *
 * Covered correctness property (from the design):
 * - Property 22: Non-approved outcomes skip execution and are recorded
 *                (Req 5.7)                                              — Task 13.4
 *
 * ## Requirement under test (Req 5.7)
 * > WHEN an `approval-required` action is rejected or times out, THE
 * > Agent_Desktop_Service SHALL skip execution of the action and SHALL record
 * > the rejection in the Agent_Run timeline.
 *
 * The service routes every `approval-required` gated action through
 * {@link AgentDesktopService.requestActionApproval}, which blocks on the
 * {@link AgentDesktopApprovalManager} prompt and:
 * - returns `true` (the action may proceed) ONLY on an `approved` outcome, and
 * - returns `false` (skip execution) AND emits exactly one `action-rejected`
 *   timeline step for every NON-approved outcome (`rejected`, `timed_out`,
 *   `cancelled`).
 *
 * ## Test strategy
 * `requestActionApproval` is the single seam Req 5.7 describes: it is the method
 * the Computer Use tool path (Task 16.1) calls to actually block on the prompt
 * and decide whether to execute. The property drives it across all 10 Computer
 * Use action types, arbitrary args, an optional target window, and all four
 * approval outcomes, asserting the skip/record invariant holds universally:
 *
 * - non-approved (`rejected` / `timed_out` / `cancelled`)
 *     → resolves `false` (execution skipped) AND records exactly one
 *       `action-rejected` step (`outcome: 'rejected'`, `status: 'rejected'`) that
 *       identifies the action, the target window, and a mode-appropriate reason.
 * - `approved`
 *     → resolves `true` (the action may proceed) AND records NO `action-rejected`
 *       step — the rejection is recorded EXACTLY for non-approved outcomes.
 *
 * Native side-effects are injected through a fully-controllable in-memory
 * {@link VdaBinding} mock; the `timed_out` outcome is produced deterministically
 * with Vitest fake timers (the configured 5s approval timeout), so no real time
 * passes and the test stays fast across 200 runs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fc from 'fast-check'

import {
  createAgentDesktopService,
  type AgentDesktopService,
  type AgentDesktopTimelineStep,
} from './service'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { AgentActionType, VdaLoadOutcome } from './types'
import { defaultAgentDesktopSettings, type AgentDesktopSettings } from './settings'
import { MIN_APPROVAL_TIMEOUT_MS } from './constants'

/**
 * Shared property-test configuration. A stable seed keeps any failure
 * reproducible and `numRuns` comfortably satisfies the spec's minimum of 100.
 */
const PROPERTY_TEST_CONFIG = { numRuns: 200, seed: 0x22d4 }

/**
 * Index the mock hands out for {@link MockVdaBinding.createDesktop}. Kept far
 * above the user-desktop range (0) so a created Agent_Desktop index never
 * collides with the User_Desktop index recorded at provisioning.
 */
const FIRST_CREATED_INDEX = 100

/** The configured approval timeout (the clamped minimum) used to drive `timed_out`. */
const APPROVAL_TIMEOUT_MS = MIN_APPROVAL_TIMEOUT_MS

/** The complete Computer Use action surface reused by Agent Desktop. */
const ACTION_TYPES: readonly AgentActionType[] = [
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

/** The four possible approval outcomes; the first three are "non-approved". */
type ApprovalMode = 'rejected' | 'timed_out' | 'cancelled' | 'approved'

/**
 * Minimal, fully-controllable in-memory {@link VdaBinding} for the approval
 * property. It only needs to report `available` and provision a session: the
 * non-approved-outcome path drives no OS placement/switch, so the move/switch
 * primitives are no-ops here.
 */
class MockVdaBinding implements VdaBinding {
  private available = false
  private readonly existing = new Set<number>([0])
  private nextIndex = FIRST_CREATED_INDEX

  async load(): Promise<VdaLoadOutcome> {
    this.available = true
    return 'available'
  }

  isAvailable(): boolean {
    return this.available
  }

  /** Read defensively by the service; no load error on the available path. */
  getLoadError(): string | null {
    return null
  }

  getCurrentDesktopIndex(): number {
    return 0
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

  goToDesktop(): void {
    /* not exercised by the non-approved-outcome path */
  }

  desktopExists(index: number): boolean {
    return this.existing.has(index)
  }

  moveWindowToDesktop(): void {
    /* not exercised by the non-approved-outcome path */
  }

  isWindowOnDesktop(): boolean {
    return true
  }

  enumerateWindows(): VdaWindowInfo[] {
    return []
  }

  dispose(): void {
    this.available = false
  }
}

/** Build enabled, disclosure-acknowledged settings with the 5s approval timeout. */
function makeSettings(): AgentDesktopSettings {
  return {
    ...defaultAgentDesktopSettings,
    approvalPolicy: { ...defaultAgentDesktopSettings.approvalPolicy },
    enabled: true,
    disclosureAcknowledged: true,
    approvalTimeoutMs: APPROVAL_TIMEOUT_MS,
  }
}

/**
 * Create an initialized service with an active session over a mock binding, so
 * {@link AgentDesktopService.requestActionApproval} is not short-circuited by the
 * `!session` / `aborted` guards.
 */
async function makeSessionService(
  binding: MockVdaBinding
): Promise<AgentDesktopService> {
  const service = createAgentDesktopService({
    binding,
    settings: makeSettings(),
    platformSupported: true,
  })
  await service.initialize()
  const result = await service.startSession('run-1')
  expect(result.provisioned).toBe(true)
  return service
}

describe('AgentDesktopService gate — Property 22: non-approved outcomes skip execution and are recorded', () => {
  beforeEach(() => {
    // Fake timers drive the `timed_out` outcome deterministically. The
    // provisioning / load paths settle on microtasks (not the guard timer), so
    // `await initialize()` / `await startSession()` resolve without advancing.
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Feature: agent-desktop, Property 22: Non-approved outcomes skip execution and are recorded
  // Validates: Requirements 5.7
  it('skips execution and records a rejection for every non-approved outcome; proceeds and records nothing when approved', async () => {
    const argsArb = fc.dictionary(
      fc.string({ maxLength: 8 }),
      fc.oneof(fc.string({ maxLength: 12 }), fc.integer(), fc.boolean()),
      { maxKeys: 4 }
    )

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ACTION_TYPES),
        argsArb,
        fc.option(fc.integer({ min: 1, max: 1_000_000 }), { nil: undefined }),
        fc.constantFrom<ApprovalMode>('rejected', 'timed_out', 'cancelled', 'approved'),
        async (action, args, targetHwnd, mode) => {
          const binding = new MockVdaBinding()
          const service = await makeSessionService(binding)

          // Capture every emitted timeline step for this run.
          const steps: AgentDesktopTimelineStep[] = []
          const unsubscribe = service.onTimelineStep((step) => steps.push(step))

          try {
            // Kick off the approval-required prompt (do NOT await yet): the
            // synchronous portion creates exactly one pending request.
            const decisionPromise = service.requestActionApproval(action, args, {
              targetHwnd,
            })

            const manager = service.getApprovalManager()
            const pending = manager.listPending()
            // Exactly one prompt is created and execution is withheld until it
            // resolves (Req 5.4).
            expect(pending).toHaveLength(1)
            expect(pending[0].action).toBe(action)
            expect(pending[0].classification).toBe('approval-required')

            // Drive the chosen outcome.
            switch (mode) {
              case 'rejected':
                manager.resolveApproval(pending[0].id, false)
                break
              case 'approved':
                manager.resolveApproval(pending[0].id, true)
                break
              case 'cancelled':
                // Cancelling pending approvals finishes each with 'cancelled'
                // (mirrors the kill-switch / shutdown path).
                manager.dispose()
                break
              case 'timed_out':
                // No user resolution within the configured timeout → 'timed_out'.
                await vi.advanceTimersByTimeAsync(APPROVAL_TIMEOUT_MS + 1)
                break
            }

            const result = await decisionPromise

            const rejectionSteps = steps.filter((s) => s.kind === 'action-rejected')

            if (mode === 'approved') {
              // Approved → the action may proceed; NO rejection is recorded.
              expect(result).toBe(true)
              expect(rejectionSteps).toHaveLength(0)
            } else {
              // Non-approved → execution is skipped (Req 5.7).
              expect(result).toBe(false)

              // ...and exactly one rejection is recorded in the timeline (Req 5.7).
              expect(rejectionSteps).toHaveLength(1)
              const step = rejectionSteps[0]
              expect(step.title).toBe('Computer action')
              expect(step.agentRunId).toBe('run-1')
              expect(step.action).toBe(action)
              expect(step.outcome).toBe('rejected')
              expect(step.status).toBe('rejected')
              // The step identifies the affected window (when one was targeted).
              expect(step.hwnd).toBe(targetHwnd)

              // The recorded reason distinguishes a timeout from a user/cancel
              // rejection (Req 5.7 calls out "rejected or times out").
              const expectedReason =
                mode === 'timed_out'
                  ? 'Approval timed out.'
                  : mode === 'cancelled'
                    ? 'Approval was cancelled.'
                    : 'Action rejected by the user.'
              expect(step.reason).toBe(expectedReason)

              // "Skip execution" — no allowed/dispatchable step was emitted for
              // a non-approved action.
              expect(steps.some((s) => s.kind === 'action-allowed')).toBe(false)
            }

            // The prompt is cleared once resolved, regardless of outcome.
            expect(manager.listPending()).toHaveLength(0)
            // The pending-approval counter is balanced back to zero.
            expect(service.getState().pendingApprovalCount).toBe(0)

            return true
          } finally {
            unsubscribe()
            service.dispose()
          }
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})
